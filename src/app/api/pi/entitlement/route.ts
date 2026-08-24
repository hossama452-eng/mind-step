import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getActiveEntitlement } from "@/lib/pi/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/entitlement
 *
 * Returns the user's current premium entitlement.
 *
 * Per Prompt 12 §4: durable across logout/login/refresh/new device.
 * The entitlement is stored in the DB keyed by userId, NOT in localStorage.
 *
 * Returns:
 *   200 — { ok: true, entitlement: { plan, status, expiresAt, features, ... } | null }
 *   401 — not signed in
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const entitlement = await getActiveEntitlement(userId);
    return NextResponse.json({ ok: true, entitlement });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
