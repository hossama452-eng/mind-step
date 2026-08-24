import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { createPaymentRecord } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  productKey: z.string().min(1),
  piPaymentId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
  amount: z.number().positive(),
  currency: z.string().min(1),
});

/**
 * POST /api/pi/payments
 *
 * Records a pending Pi payment with the given idempotency key (Prompt 12 §3 §9).
 *
 * Called by the client right after `Pi.createPayment()` returns a paymentId.
 *
 * The client-supplied `amount` is VALIDATED against the centrally-configured
 * product — if mismatched, we reject. Never trust the client.
 *
 * Idempotent: re-calling with the same `idempotencyKey` returns the existing
 * payment row.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid payment payload.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const result = await createPaymentRecord(userId, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: 400 });
    }
    return NextResponse.json({ ok: true, payment: result.payment });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
