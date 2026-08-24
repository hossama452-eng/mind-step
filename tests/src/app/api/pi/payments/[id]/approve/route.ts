import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { serverApprovePayment } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pi/payments/[id]/approve
 *
 * Called by the client when the Pi SDK fires the
 * `onReadyForServerApproval(paymentId)` callback.
 *
 * Calls Pi Platform API POST /payments/{id}/approve (server-side, using the
 * Server API Key — NEVER exposed to the client).
 *
 * NEVER trusts the client — the actual /approve call goes directly from our
 * backend to the Pi Servers using our API key.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: piPaymentId } = await params;

    const result = await serverApprovePayment(userId, piPaymentId);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: result.paymentDTO?.status });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
