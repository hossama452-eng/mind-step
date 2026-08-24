import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/focus-sessions/active
 *
 * Returns the user's currently active (or paused) focus session, or null.
 * Used by the client on page load for refresh recovery (Prompt 05 §9).
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const session = await db.focusSession.findFirst({
      where: {
        userId,
        status: { in: ["active", "paused"] },
      },
      orderBy: { startedAt: "desc" },
      include: {
        distractions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, content: true, category: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ session: session ?? null });
  } catch (err) {
    console.error("[/api/focus-sessions/active] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
