import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { serverCancelPayment } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pi/payments/[id]/cancel
 *
 * Called by the client when the Pi SDK fires the `onCancel(paymentId)` callback,
 * OR when the user explicitly cancels from the MindStep UI.
 *
 * Marks our payment row as cancelled AND calls Pi Platform API /cancel for
 * safety (in case the Pi Servers haven't seen the cancel yet).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: piPaymentId } = await params;

    // Optional reason in the body — for audit purposes.
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = typeof body?.reason === "string" ? body.reason : undefined;
    } catch {
      // Body is optional — no problem.
    }

    const result = await serverCancelPayment(userId, piPaymentId, reason);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: result.paymentDTO?.status });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
