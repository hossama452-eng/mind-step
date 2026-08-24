import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { withdrawAllConsent } from "@/lib/privacy/privacy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/privacy/withdraw-consent
 *
 * Withdraws ALL consent — sets all `*At` timestamps to null and all opt-ins to false.
 * Does NOT delete the user's data — use /api/privacy/delete-account for that.
 *
 * Returns: { ok: true, consent: <updated Consent row> }
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const consent = await withdrawAllConsent(userId);
    return NextResponse.json({ ok: true, consent });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
