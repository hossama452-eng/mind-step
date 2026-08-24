import { NextResponse, NextRequest } from "next/server";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { logoutSession, SESSION_COOKIE_NAME } from "@/lib/pi/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pi/logout
 *
 * Revokes the current Pi session. The PiAccount and PremiumEntitlement
 * are PRESERVED — they survive logout (Prompt 12 §4).
 *
 * Clears the `mindstep.pi.session` cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionToken) {
      await logoutSession(sessionToken);
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
