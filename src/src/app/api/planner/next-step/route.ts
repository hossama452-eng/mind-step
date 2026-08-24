import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planner/next-step
 *
 * Returns the recommended next best action for the user.
 * (Prompt 06 §18, §19)
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();

    // Check for active focus session.
    const activeFocus = await db.focusSession.findFirst({
      where: { userId, status: { in: ["active", "paused"] } },
      select: { id: true, taskId: true, taskTitle: true, status: true, startedAt: true, plannedMinutes: true, pausedAt: true, accumulatedPausedMs: true },
    });

    if (activeFocus) {
      return NextResponse.json({
        nextBestAction: {
          action: "continue_focus",
          taskTitle: activeFocus.taskTitle,
          reason: "You're already focusing. Keep going gently.",
        },
      });
    }

    // Check for scheduled blocks today.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const upcomingBlock = await db.timeBlock.findFirst({
      where: {
        userId,
        startAt: { gte: dayStart, lt: dayEnd },
        status: "scheduled",
        type: "focus",
      },
      orderBy: { startAt: "asc" },
      include: { task: { select: { id: true, title: true } } },
    });

    if (upcomingBlock && upcomingBlock.task) {
      return NextResponse.json({
        nextBestAction: {
          action: "start_scheduled",
          taskId: upcomingBlock.task.id,
          taskTitle: upcomingBlock.task.title,
          reason: "This task is scheduled for now.",
        },
      });
    }

    // Find a high-value unscheduled task.
    const tasks = await db.task.findMany({
      where: {
        userId,
        status: { notIn: ["completed", "archived", "done"] },
      },
      select: { id: true, title: true, status: true, priority: true, estimateMinutes: true, dueAt: true, energy: true, actualMinutes: true, description: true, projectId: true, milestoneId: true },
      take: 50,
    });

    if (tasks.length === 0) {
      return NextResponse.json({
        nextBestAction: {
          action: "rest",
          reason: "Nothing urgent. Take a breath.",
        },
      });
    }

    // Score tasks and pick the best.
    // (Using the scheduling engine's scoring — imported lazily to avoid circular deps.)
    const { calculateSchedulingScore } = await import("@/lib/scheduling-engine");
    const scored = tasks.map((task) => {
      const score = calculateSchedulingScore(
        {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority as "low" | "normal" | "high" | "urgent",
          energy: task.energy as "low" | "medium" | "high",
          estimateMinutes: task.estimateMinutes,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          projectId: task.projectId ?? null,
          milestoneId: task.milestoneId ?? null,
          actualMinutes: task.actualMinutes,
        },
        { now, availableMinutes: 60 }
      );
      return { task, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return NextResponse.json({
      nextBestAction: {
        action: "start_high_value",
        taskId: best.task.id,
        taskTitle: best.task.title,
        reason: "Suggested next step based on urgency and importance.",
      },
    });
  } catch (err) {
    console.error("[/api/planner/next-step] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
