import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { deleteAccount } from "@/lib/privacy/privacy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  confirm: z.literal("DELETE"),
});

/**
 * POST /api/privacy/delete-account
 *
 * PERMANENTLY deletes the user account and ALL cascaded data.
 * This action is IRREVERSIBLE.
 *
 * Body: { confirm: "DELETE" } — explicit confirmation string.
 *
 * Returns:
 *   200 — { ok: true } (account deleted)
 *   400 — confirmation missing
 *   404 — user not found
 *
 * After deletion, the user's session cookie should be cleared by the client.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Confirmation required. Send { confirm: \"DELETE\" }.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const deleted = await deleteAccount(userId);
    if (!deleted) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", { statusCode: 404 });
    }

    // Clear the Pi session cookie if present (best-effort — the user is gone).
    const res = NextResponse.json({ ok: true, deletedAt: new Date().toISOString() });
    res.cookies.set({
      name: "mindstep.pi.session",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
