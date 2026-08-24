import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { generatePlanSchema } from "@/lib/validations";
import { generatePlan, type SchedulingPreferences } from "@/lib/scheduling-engine";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PREFS: SchedulingPreferences = {
  dailyStartMinutes: 480,
  dailyEndMinutes: 1320,
  bufferPercentage: 0.15,
  maxDailyFocusMinutes: 240,
  preferredFocusDuration: 25,
  includeBreaks: false,
  energyPreference: "medium",
};

/**
 * POST /api/planner/generate
 *
 * Generate a candidate plan for a given date. NEVER writes to the database
 * (Prompt 06 §14 — "Generate → Review → Approve → Persist").
 *
 * Returns the plan (blocks, unscheduled, conflicts, summary) for the
 * client to display and the user to review/edit/approve.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const parsed = generatePlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid generate input.", {
        details: parsed.error.flatten(),
      });
    }

    const targetDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

    // Load preferences.
    const prefsRecord = await db.preferences.findUnique({
      where: { userId },
    });
    const prefs: SchedulingPreferences = {
      ...DEFAULT_PREFS,
      dailyStartMinutes: prefsRecord?.dailyStartMinutes ?? DEFAULT_PREFS.dailyStartMinutes,
      dailyEndMinutes: prefsRecord?.dailyEndMinutes ?? DEFAULT_PREFS.dailyEndMinutes,
      bufferPercentage: parsed.data.bufferPercentage ?? prefsRecord?.bufferPercentage ?? DEFAULT_PREFS.bufferPercentage,
      maxDailyFocusMinutes: prefsRecord?.maxDailyFocusMinutes ?? DEFAULT_PREFS.maxDailyFocusMinutes,
      preferredFocusDuration: prefsRecord?.preferredFocusDuration ?? DEFAULT_PREFS.preferredFocusDuration,
      includeBreaks: prefsRecord?.includeBreaks ?? DEFAULT_PREFS.includeBreaks,
      energyPreference: (prefsRecord?.energyPreference as "low" | "medium" | "high") ?? DEFAULT_PREFS.energyPreference,
    };

    // Load eligible tasks.
    const tasks = await db.task.findMany({
      where: {
        userId,
        status: { notIn: ["completed", "archived", "done"] },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        energy: true,
        estimateMinutes: true,
        dueAt: true,
        projectId: true,
        milestoneId: true,
        actualMinutes: true,
      },
    });

    // Normalize task fields to match SchedulableTask.
    const schedulableTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: (["urgent", "high", "normal", "low"].includes(t.priority) ? t.priority : "normal") as "low" | "normal" | "high" | "urgent",
      energy: (["low", "medium", "high"].includes(t.energy) ? t.energy : "medium") as "low" | "medium" | "high",
      estimateMinutes: t.estimateMinutes,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      projectId: t.projectId ?? null,
      milestoneId: t.milestoneId ?? null,
      actualMinutes: t.actualMinutes,
    }));

    // Load existing time blocks for the target date.
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const existingBlocks = await db.timeBlock.findMany({
      where: {
        userId,
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["cancelled", "missed"] },
      },
      select: { id: true, startAt: true, endAt: true, type: true, status: true },
    });

    // Load focus history averages (Prompt 06 §46).
    const focusSessions = await db.focusSession.findMany({
      where: {
        userId,
        status: "completed",
        taskId: { not: null },
      },
      select: { taskId: true, actualMinutes: true },
    });
    const historicalAverages = new Map<string, number>();
    const taskFocusMap = new Map<string, number[]>();
    for (const s of focusSessions) {
      if (!s.taskId) continue;
      const arr = taskFocusMap.get(s.taskId) ?? [];
      arr.push(s.actualMinutes ?? 0);
      taskFocusMap.set(s.taskId, arr);
    }
    for (const [taskId, minutes] of taskFocusMap) {
      const avg = minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
      // Only use historical data if we have at least 2 sessions (Prompt 06 §47).
      if (minutes.length >= 2) {
        historicalAverages.set(taskId, Math.round(avg));
      }
    }

    // Generate the plan (pure function, no DB writes).
    const plan = generatePlan(
      schedulableTasks,
      targetDate,
      prefs,
      existingBlocks.map((b) => ({
        id: b.id,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        type: b.type,
        status: b.status,
      })),
      {
        taskIds: parsed.data.taskIds,
        historicalAverages,
      }
    );

    return NextResponse.json({ plan, date: targetDate.toISOString() });
  } catch (err) {
    console.error("[/api/planner/generate] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
