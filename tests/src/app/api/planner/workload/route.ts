import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planner/workload
 *
 * Returns the user's current workload: total estimated time for all
 * active tasks, number of tasks, and overload status.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const tasks = await db.task.findMany({
      where: {
        userId,
        status: { notIn: ["completed", "archived", "done"] },
      },
      select: { id: true, estimateMinutes: true, dueAt: true, priority: true },
    });

    const totalEstimateMinutes = tasks.reduce(
      (sum, t) => sum + (t.estimateMinutes ?? 25),
      0
    );

    const prefs = await db.preferences.findUnique({
      where: { userId },
      select: { maxDailyFocusMinutes: true, bufferPercentage: true },
    });
    const maxDaily = prefs?.maxDailyFocusMinutes ?? 240;

    // Simple overload check: if total estimate > 2x max daily focus.
    const isOverloaded = totalEstimateMinutes > maxDaily * 2;

    // Count overdue.
    const now = new Date();
    const overdueCount = tasks.filter(
      (t) => t.dueAt && new Date(t.dueAt).getTime() < now.getTime()
    ).length;

    return NextResponse.json({
      totalTasks: tasks.length,
      totalEstimateMinutes,
      maxDailyFocusMinutes: maxDaily,
      isOverloaded,
      overdueCount,
    });
  } catch (err) {
    console.error("[/api/planner/workload] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
