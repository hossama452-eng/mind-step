import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const reward = await db.reward.findUnique({ where: { id }, select: { userId: true } });
    if (!reward) throw new AppError(ErrorCodes.NOT_FOUND, "Reward not found.");
    assertOwnership(reward.userId, userId);

    const updated = await db.reward.update({
      where: { id },
      data: { redeemed: true, redeemedAt: new Date() },
    });
    return NextResponse.json({ reward: updated });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
