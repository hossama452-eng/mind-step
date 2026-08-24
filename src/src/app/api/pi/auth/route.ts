import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import {
  authenticateWithPi,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_DAYS,
} from "@/lib/pi/auth";
import { isPiServerConfigured } from "@/lib/pi/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authSchema = z.object({
  accessToken: z.string().min(1),
  reportedUid: z.string().optional(),
  reportedUsername: z.string().optional(),
});

/**
 * POST /api/pi/auth
 *
 * Verifies a Pi Pioneer's identity using the CURRENT official Pi auth flow.
 *
 * Request body:
 *   { accessToken: string }  // from Pi.authenticate()
 *
 * Sets the `mindstep.pi.session` HTTP-only cookie on success.
 *
 * Response:
 *   200 — { ok: true, user: { userId, piUid, piUsername, network }, expiresAt }
 *   400 — invalid request body
 *   401 — accessToken invalid (Pi /me returned 401)
 *   503 — server not configured for the active network
 */
export async function POST(req: NextRequest) {
  try {
    if (!isPiServerConfigured()) {
      return NextResponse.json(
        { error: { code: "PI_NOT_CONFIGURED", message: "Pi server is not configured. See PI-INTEGRATION.md." } },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = authSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid auth payload.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const result = await authenticateWithPi(parsed.data, { ipAddress, userAgent });
    if (!result.ok) {
      const status = result.code === "INVALID_TOKEN" ? 401
        : result.code === "SERVER_NOT_CONFIGURED" ? 503
        : 500;
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status });
    }

    // Set the HTTP-only session cookie.
    const res = NextResponse.json({
      ok: true,
      user: {
        userId: result.userId,
        piUid: result.piUid,
        piUsername: result.piUsername,
        network: result.network,
      },
      expiresAt: result.expiresAt,
    });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    });
    return res;
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * GET /api/pi/auth
 *
 * Returns the current session info (for the client to display "signed in as").
 * Returns 401 if not signed in.
 */
export async function GET() {
  try {
    const { getSessionInfo } = await import("@/lib/pi/auth");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: { code: "NO_SESSION", message: "Not signed in." } }, { status: 401 });
    }
    const info = await getSessionInfo(sessionToken);
    if (!info) {
      return NextResponse.json({ error: { code: "NO_SESSION", message: "Session expired or revoked." } }, { status: 401 });
    }
    return NextResponse.json({ ok: true, session: info });
  } catch (err) {
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
