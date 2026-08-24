import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getPaymentState } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/payments/[id]
 *
 * Returns the current state of a payment for client polling.
 *
 * Per Prompt 12 §7: stores minimum transaction info, doesn't expose
 * sensitive server-side info (the error field is sanitized).
 *
 * The [id] is the Pi payment identifier (piPaymentId), not our internal id.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: piPaymentId } = await params;

    const state = await getPaymentState(userId, piPaymentId);
    if (!state) {
      throw new AppError("NOT_FOUND" as any, "Payment not found.", { statusCode: 404 } as any);
    }
    return NextResponse.json({ ok: true, payment: state });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
