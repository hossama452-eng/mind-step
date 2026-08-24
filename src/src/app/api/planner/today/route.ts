import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getNextBestAction } from "@/lib/scheduling-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planner/today
 *
 * Returns the user's schedule for today:
 *   - Time blocks (scheduled, in_progress, completed)
 *   - Now / Next / Later grouping
 *   - Total planned time, available time, buffer
 *   - Overdue tasks (neutral display)
 *   - Overload detection
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Load today's time blocks.
    const blocks = await db.timeBlock.findMany({
      where: {
        userId,
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["cancelled"] },
      },
      orderBy: { startAt: "asc" },
      include: {
        task: { select: { id: true, title: true, status: true, priority: true, energy: true, projectId: true } },
      },
    });

    // Load overdue tasks (neutral display, Prompt 06 §42).
    const overdueTasks = await db.task.findMany({
      where: {
        userId,
        dueAt: { lt: now },
        status: { notIn: ["completed", "archived", "done"] },
      },
      select: { id: true, title: true, priority: true, dueAt: true, estimateMinutes: true },
      take: 10,
    });

    // Load active focus session (if any).
    const activeFocus = await db.focusSession.findFirst({
      where: { userId, status: { in: ["active", "paused"] } },
      select: { id: true, taskId: true, taskTitle: true, startedAt: true, plannedMinutes: true, status: true },
    });

    // Load preferences.
    const prefs = await db.preferences.findUnique({
      where: { userId },
    });
    const dailyStart = prefs?.dailyStartMinutes ?? 480;
    const dailyEnd = prefs?.dailyEndMinutes ?? 1320;
    const bufferPct = prefs?.bufferPercentage ?? 0.15;
    const maxDaily = prefs?.maxDailyFocusMinutes ?? 240;

    // Calculate stats.
    const totalPlanned = blocks
      .filter((b) => b.type === "focus")
      .reduce((sum, b) => sum + b.plannedMinutes, 0);
    const availableMinutes = Math.max(0, dailyEnd - dailyStart);
    const bufferMinutes = Math.round(availableMinutes * bufferPct);
    const isOverloaded = totalPlanned > availableMinutes - bufferMinutes;

    // Now / Next / Later grouping (Prompt 06 §17).
    const completedBlocks = blocks.filter((b) => b.status === "completed");
    const nowBlocks = blocks.filter(
      (b) => b.status === "in_progress" || (new Date(b.startAt) <= now && b.status === "scheduled")
    );
    const nextBlocks = blocks
      .filter((b) => new Date(b.startAt) > now && b.status === "scheduled")
      .slice(0, 2);
    const laterBlocks = blocks
      .filter((b) => new Date(b.startAt) > now && b.status === "scheduled")
      .slice(2);

    // Next best action (Prompt 06 §18, §19).
    const nextAction = getNextBestAction({
      hasActiveFocusSession: !!activeFocus,
      activeFocusTaskTitle: activeFocus?.taskTitle ?? undefined,
      scheduledBlocks: blocks.map((b) => ({
        taskId: b.taskId ?? "",
        taskTitle: b.task?.title ?? "",
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        plannedMinutes: b.plannedMinutes,
        type: b.type as "focus" | "break" | "buffer",
      })),
      unscheduledTasks: [],
      now,
      isOverwhelmed: isOverloaded,
    });

    return NextResponse.json({
      blocks,
      now: now.toISOString(),
      stats: {
        totalPlannedMinutes: totalPlanned,
        availableMinutes,
        bufferMinutes,
        isOverloaded,
        completedCount: completedBlocks.length,
        maxDailyFocusMinutes: maxDaily,
      },
      nowNextLater: {
        now: nowBlocks,
        next: nextBlocks,
        later: laterBlocks,
      },
      overdueTasks,
      activeFocus,
      nextBestAction: nextAction,
    });
  } catch (err) {
    console.error("[/api/planner/today] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
