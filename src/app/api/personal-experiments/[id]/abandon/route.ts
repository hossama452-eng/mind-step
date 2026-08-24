import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/personal-experiments/[id]/abandon
 *
 * Marks the experiment as abandoned. No post snapshot is captured — the user
 * is choosing to stop without analyzing results. The baseline snapshot is
 * preserved for future reference.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const experiment = await db.personalExperiment.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    if (!experiment || experiment.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Experiment not found.", { statusCode: 404 });
    }
    if (experiment.status !== "active") {
      throw new AppError(ErrorCodes.BUSINESS_RULE_VIOLATION, "Experiment is not active.", { statusCode: 422 });
    }

    const updated = await db.personalExperiment.update({
      where: { id },
      data: { status: "abandoned", endedAt: new Date() },
    });

    return NextResponse.json({ experiment: updated });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
