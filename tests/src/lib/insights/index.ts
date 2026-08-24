import "server-only";
/**
 * MindStep Insights Engine — Orchestrator (Prompt 11).
 *
 * Pulls together the focus, time-pattern, task-pattern, energy-correlation,
 * and weekly-review generators. The API route calls into here.
 *
 * Privacy (Prompt 11 — Privacy):
 *   - Only the minimum necessary data is fetched from the DB.
 *   - We take the last 100 focus sessions, last 200 tasks, last 30 energy
 *     entries — enough for stable patterns, no more.
 *   - No external sharing. Insights are persisted to the user's own
 *     `Insight` rows; they can be dismissed.
 */

import { db } from "@/lib/db";
import type { Locale } from "@/i18n/locale";
import {
  generateFocusInsights,
  type FocusSessionData,
} from "./focus-insights";
import {
  generateTimePatternInsights,
  type TaskTimeData,
} from "./time-patterns";
import {
  generateTaskPatternInsights,
  type TaskPatternData,
} from "./task-patterns";
import {
  generateEnergyCorrelationInsights,
  type EnergyEntryData,
  type TaskCompletionData,
} from "./energy-correlation";
import { generateWeeklyReview, type WeeklyReview } from "./weekly-review";

export interface ComputedInsights {
  focus: ReturnType<typeof generateFocusInsights>;
  time: ReturnType<typeof generateTimePatternInsights>;
  task: ReturnType<typeof generateTaskPatternInsights>;
  energy: ReturnType<typeof generateEnergyCorrelationInsights>;
  weeklyReview: WeeklyReview;
  // Convenience: all insights flattened.
  all: Array<{
    id: string;
    kind: string;
    category: string;
    title: string;
    body: string;
    data?: {
      chartType?: string;
      chartData?: Array<{ label: string; value: number }>;
      chartCaption?: string;
      metrics?: Record<string, number | string>;
      items?: Array<{ label: string; value: number }>;
    };
  }>;
}

// ============================================================
// FETCH USER DATA — minimum necessary only.
// ============================================================

export async function fetchInsightData(userId: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [focusSessionsRaw, tasksRaw, energyRaw, remindersRaw] = await Promise.all([
    db.focusSession.findMany({
      where: { userId, startedAt: { gte: since } },
      select: {
        id: true, startedAt: true, endedAt: true, plannedMinutes: true,
        actualMinutes: true, status: true, interruptions: true,
        taskId: true, taskTitle: true,
      },
      orderBy: { startedAt: "desc" },
      take: 100, // Cap — minimum necessary.
    }),
    db.task.findMany({
      where: { userId },
      select: {
        id: true, status: true, priority: true, estimateMinutes: true,
        actualMinutes: true, createdAt: true, completedAt: true,
        archivedAt: true, projectId: true, tags: true, title: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.energyEntry.findMany({
      where: { userId, timestamp: { gte: since } },
      select: { id: true, level: true, timestamp: true, note: true },
      orderBy: { timestamp: "desc" },
      take: 30,
    }),
    // Snooze counts per task — for "frequently postponed" insight.
    db.reminder.groupBy({
      by: ["taskId"],
      where: { userId, snoozedCount: { gte: 1 } },
      _sum: { snoozedCount: true },
    }),
  ]);

  // Build a snooze-count map (taskId → total snoozes across reminders for that task).
  const snoozeMap: Record<string, number> = {};
  for (const r of remindersRaw) {
    if (r.taskId && r._sum.snoozedCount) {
      snoozeMap[r.taskId] = (snoozeMap[r.taskId] ?? 0) + r._sum.snoozedCount;
    }
  }

  const focusSessions: FocusSessionData[] = focusSessionsRaw.map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    plannedMinutes: s.plannedMinutes,
    actualMinutes: s.actualMinutes,
    status: s.status,
    interruptions: s.interruptions,
    taskId: s.taskId,
    taskTitle: s.taskTitle,
  }));

  const tasks: TaskPatternData[] = tasksRaw.map((t) => ({
    id: t.id,
    status: t.status,
    priority: t.priority,
    estimateMinutes: t.estimateMinutes,
    actualMinutes: t.actualMinutes,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    archivedAt: t.archivedAt,
    projectId: t.projectId,
    tags: t.tags,
    snoozedCount: snoozeMap[t.id] ?? 0,
    title: t.title,
  }));

  const energy: EnergyEntryData[] = energyRaw.map((e) => ({
    id: e.id,
    level: e.level,
    timestamp: e.timestamp,
    note: e.note,
  }));

  return { focusSessions, tasks, energy };
}

// ============================================================
// COMPUTE ALL INSIGHTS
// ============================================================

export async function computeInsights(
  userId: string,
  locale: Locale,
): Promise<ComputedInsights> {
  const { focusSessions, tasks, energy } = await fetchInsightData(userId);

  const focusInsights = generateFocusInsights(focusSessions, locale);
  const timeInsights = generateTimePatternInsights(tasks, locale);
  const taskInsights = generateTaskPatternInsights(tasks, locale);

  // For energy correlation we need the task completion data shape.
  const taskCompletions: TaskCompletionData[] = tasks.map((t) => ({
    id: t.id,
    completedAt: t.completedAt,
    status: t.status,
  }));
  const energyInsights = generateEnergyCorrelationInsights(energy, taskCompletions, locale);

  const weeklyReview = generateWeeklyReview(
    { focusSessions, tasks, energyEntries: energy },
    locale,
  );

  // Flatten all insights.
  const all = [
    ...focusInsights,
    ...timeInsights,
    ...taskInsights,
    ...energyInsights,
  ];

  return {
    focus: focusInsights,
    time: timeInsights,
    task: taskInsights,
    energy: energyInsights,
    weeklyReview,
    all,
  };
}
