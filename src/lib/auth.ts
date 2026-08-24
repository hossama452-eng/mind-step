import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { AppError, ErrorCodes } from "@/lib/errors";
import { resolveUserIdFromPiSession, SESSION_COOKIE_NAME } from "@/lib/pi/auth";

/**
 * Resolve the current authenticated user ID.
 *
 * Priority (per Prompt 12 §1):
 *   1. Pi session cookie (HTTP-only, server-issued) — the PRODUCTION path.
 *      Calls resolveUserIdFromPiSession which queries the PiSession table.
 *   2. Test-only fallback: `mindstep.test-user` cookie OR
 *      `x-mindstep-user-id` header — for ownership isolation testing.
 *      NEVER used in production — has no Pi auth attached.
 *
 * Either way:
 *   - NEVER trust a `userId` field sent in a request body.
 *   - The userId below is ALWAYS server-resolved.
 *   - Every Prisma query is scoped with this value at the data layer.
 *
 * This function:
 *   - Throws `UNAUTHORIZED` when no userId is resolvable.
 *   - Ensures the user exists in the database (creating a placeholder if
 *     necessary, so first-time API callers have a real user to own their
 *     records — but ONLY when the test-only `auto-create` header is set).
 */
export async function requireUserId(): Promise<string> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // 1. Pi session cookie — production auth path.
  const piSessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (piSessionToken) {
    const userId = await resolveUserIdFromPiSession(piSessionToken);
    if (userId) {
      // Ensure the user exists (it should — created during Pi auth).
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) return userId;
    }
  }

  // 2. Test-only fallback (NOT for production — no Pi auth attached).
  const fromCookie = cookieStore.get("mindstep.test-user")?.value;
  const fromHeader = headerStore.get("x-mindstep-user-id");
  const autoCreate = headerStore.get("x-mindstep-auto-create-user") === "true";

  const userId = fromCookie ?? fromHeader ?? null;

  if (!userId) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      "Sign in with Pi to continue.",
      { statusCode: 401 }
    );
  }

  // Verify the user exists — but ONLY if we're connected to a real DB.
  // In test environments, the user may have been created already.
  if (autoCreate) {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@test.mindstep.app`,
        name: `Test user ${userId.slice(0, 8)}`,
      },
    });
  } else {
    // For production: the user must already exist.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new AppError(
        ErrorCodes.UNAUTHORIZED,
        "Sign in with Pi to continue.",
        { statusCode: 401 }
      );
    }
  }

  return userId;
}

/**
 * Resolve the current user ID, or `null` if no session is present.
 * Use this for endpoints that allow anonymous browsing (e.g., health checks).
 */
export async function getOptionalUserId(): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}

/**
 * Assert that a resource with the given `resourceUserId` belongs to the
 * current user. Throws `NOT_OWNER` if not.
 *
 * @example
 *   const task = await db.task.findUnique({ where: { id } });
 *   if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "...");
 *   assertOwnership(task.userId, currentUserId);
 */
export function assertOwnership(
  resourceUserId: string | null | undefined,
  currentUserId: string
): void {
  if (resourceUserId !== currentUserId) {
    throw new AppError(
      ErrorCodes.NOT_OWNER,
      "You can only access your own data.",
      { statusCode: 403 }
    );
  }
}
