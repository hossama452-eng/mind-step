import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getPaymentHistory } from "@/lib/pi/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/payments/history
 *
 * Returns the user's payment history (Prompt 12 §7).
 *
 * Minimum required transaction info only — no sensitive server-side data.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

    const history = await getPaymentHistory(userId, isNaN(limit) ? 50 : limit);
    return NextResponse.json({ ok: true, payments: history });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
