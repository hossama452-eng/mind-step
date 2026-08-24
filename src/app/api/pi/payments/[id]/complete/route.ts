import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { serverCompletePayment } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const completeSchema = z.object({
  txid: z.string().min(8).max(200),
});

/**
 * POST /api/pi/payments/[id]/complete
 *
 * Called by the client when the Pi SDK fires the
 * `onReadyForServerCompletion(paymentId, txid)` callback.
 *
 * Calls Pi Platform API POST /payments/{id}/complete with the txid
 * (server-side, using the Server API Key — NEVER exposed to the client).
 *
 * CRITICAL SECURITY CHECK: the entitlement is only granted if the returned
 * PaymentDTO is FULLY VERIFIED (developer_completed AND transaction_verified
 * AND the network matches our server's active network).
 *
 * Idempotent: re-calling /complete on an already-completed payment is a no-op.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: piPaymentId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid txid.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const result = await serverCompletePayment(userId, piPaymentId, parsed.data.txid);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      status: result.paymentDTO?.status,
      entitlementGranted: result.entitlementGranted,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
