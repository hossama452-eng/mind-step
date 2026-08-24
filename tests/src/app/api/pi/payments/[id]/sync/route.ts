import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { syncPaymentFromPi } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pi/payments/[id]/sync
 *
 * Re-fetches the current state of a payment from the Pi Servers and
 * updates our local row.
 *
 * Used for:
 *   - Recovery from missed SDK callbacks (browser closed, network flaky)
 *   - User-initiated "refresh" in the UI
 *   - Background sync after the Pi Wallet completes a transaction
 *
 * If the payment is now fully verified AND we haven't granted an entitlement
 * yet, the entitlement is granted as part of the sync (recovery path).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: piPaymentId } = await params;

    const state = await syncPaymentFromPi(userId, piPaymentId);
    if (!state) {
      throw new AppError("NOT_FOUND" as any, "Payment not found on Pi Servers.", { statusCode: 404 } as any);
    }
    return NextResponse.json({ ok: true, payment: state });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
