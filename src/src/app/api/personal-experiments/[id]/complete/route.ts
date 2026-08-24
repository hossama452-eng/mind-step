import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getLocaleFromRequest } from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";
import {
  computeMetricsSnapshot,
  computeDelta,
  describeDelta,
  type ExperimentMetrics,
} from "@/lib/insights/personal-experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/personal-experiments/[id]/complete
 *
 * Ends an active experiment by capturing a post snapshot, computing the
 * delta vs the baseline, and updating the row.
 *
 * Returns:
 *   {
 *     experiment: {...with postSnapshot, delta, resultSummary, status: "completed", endedAt},
 *     baseline: ExperimentMetrics,
 *     post: ExperimentMetrics,
 *     delta: ExperimentDelta,
 *     description: string (localized, descriptive — never judgmental)
 *   }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const locale = getLocaleFromRequest(req) as Locale;
    const { id } = await params;

    const experiment = await db.personalExperiment.findUnique({
      where: { id },
      select: { id: true, userId: true, type: true, status: true, baselineSnapshot: true, title: true },
    });
    if (!experiment || experiment.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Experiment not found.", { statusCode: 404 });
    }
    if (experiment.status !== "active") {
      throw new AppError(ErrorCodes.BUSINESS_RULE_VIOLATION, "Experiment is not active.", { statusCode: 422 });
    }

    // Capture the post snapshot — metrics over the experiment duration.
    // We use the experiment's startedAt as the start of the post period.
    const postSnapshot = await computeMetricsSnapshot(userId, 7);
    const baseline: ExperimentMetrics = experiment.baselineSnapshot
      ? JSON.parse(experiment.baselineSnapshot)
      : postSnapshot;
    const delta = computeDelta(baseline, postSnapshot);
    const description = describeDelta(experiment.type as any, delta, locale);

    const updated = await db.personalExperiment.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: new Date(),
        postSnapshot: JSON.stringify(postSnapshot),
        delta: JSON.stringify(delta),
        resultSummary: description,
      },
    });

    return NextResponse.json({
      experiment: updated,
      baseline,
      post: postSnapshot,
      delta,
      description,
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
