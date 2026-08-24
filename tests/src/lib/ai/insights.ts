/**
 * MindStep Personal Insight Service (Prompt 07 §29, §30, §31).
 *
 * Generates insights from REAL user data only.
 * If there is insufficient data, returns an honest "not enough data" message.
 * Never fabricates patterns (Prompt 07 §30).
 *
 * Insight thresholds (Prompt 07 §31):
 *   - Focus pattern: minimum 3 completed sessions.
 *   - Task completion pattern: minimum 5 completed tasks.
 *   - Energy pattern: minimum 5 check-ins.
 *   - Planning pattern: minimum 5 days with time blocks (Phase 07 future).
 */

export interface InsightInput {
  focusSessions: Array<{
    actualMinutes: number;
    plannedMinutes: number;
    startedAt: Date;
    taskId: string | null;
  }>;
  tasks: Array<{
    status: string;
    estimateMinutes: number | null;
    actualMinutes: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }>;
  energyEntries: Array<{
    level: number; // 1-5
    timestamp: Date;
  }>;
}

export interface InsightResult {
  id: string;
  kind: "pattern" | "suggestion" | "warning" | "celebration";
  title: string;
  body: string;
}

// ============================================================
// THRESHOLDS (Prompt 07 §31)
// ============================================================

const MIN_FOCUS_SESSIONS = 3;
const MIN_COMPLETED_TASKS = 5;
const MIN_ENERGY_ENTRIES = 5;

// ============================================================
// INSIGHT GENERATION
// ============================================================

export function generateInsights(data: InsightInput): InsightResult[] {
  const insights: InsightResult[] = [];

  // --- Focus pattern insight ---
  if (data.focusSessions.length >= MIN_FOCUS_SESSIONS) {
    const avgActual = data.focusSessions.reduce((sum, s) => sum + s.actualMinutes, 0) / data.focusSessions.length;
    const avgPlanned = data.focusSessions.reduce((sum, s) => sum + s.plannedMinutes, 0) / data.focusSessions.length;

    insights.push({
      id: "focus-average",
      kind: "pattern",
      title: "Focus pattern",
      body: `Your average focus session was ${Math.round(avgActual)} minutes (planned: ${Math.round(avgPlanned)}). ${
        avgActual < avgPlanned * 0.8
          ? "You tend to finish sessions a bit earlier than planned — that's okay. Consider shorter planned sessions."
          : avgActual > avgPlanned * 1.2
          ? "You often focus longer than planned. You might enjoy longer sessions."
          : "Your actual and planned times are well-aligned."
      }`,
    });

    // Shortest vs longest session.
    const sorted = [...data.focusSessions].sort((a, b) => a.actualMinutes - b.actualMinutes);
    const shortest = sorted[0];
    const longest = sorted[sorted.length - 1];
    if (longest.actualMinutes > shortest.actualMinutes * 2) {
      insights.push({
        id: "focus-range",
        kind: "pattern",
        title: "Session length varies",
        body: `Your longest session was ${longest.actualMinutes} minutes, your shortest was ${shortest.actualMinutes}. Shorter sessions count just as much.`,
      });
    }

    // Weekly trend.
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeekSessions = data.focusSessions.filter((s) => s.startedAt >= weekAgo);
    if (thisWeekSessions.length > 0) {
      const weekMinutes = thisWeekSessions.reduce((sum, s) => sum + s.actualMinutes, 0);
      insights.push({
        id: "focus-week",
        kind: "celebration",
        title: "This week",
        body: `You focused for ${weekMinutes} minutes across ${thisWeekSessions.length} sessions this week.`,
      });
    }
  } else if (data.focusSessions.length > 0 && data.focusSessions.length < MIN_FOCUS_SESSIONS) {
    insights.push({
      id: "focus-insufficient",
      kind: "suggestion",
      title: "Not enough focus data yet",
      body: `Not enough focus data yet. You have ${data.focusSessions.length} completed session(s). Complete at least ${MIN_FOCUS_SESSIONS} to identify a reliable focus pattern.`,
    });
  }

  // --- Task completion pattern ---
  const completedTasks = data.tasks.filter((t) => t.status === "completed" || t.status === "done");
  if (completedTasks.length >= MIN_COMPLETED_TASKS) {
    // Short vs long tasks completion rate.
    const shortTasks = completedTasks.filter((t) => (t.estimateMinutes ?? 25) <= 15);
    const longTasks = completedTasks.filter((t) => (t.estimateMinutes ?? 25) > 30);

    if (shortTasks.length > longTasks.length * 2) {
      insights.push({
        id: "task-short-pref",
        kind: "pattern",
        title: "Short tasks work well",
        body: `You tend to complete shorter tasks (≤15 min) more consistently. Consider breaking larger tasks into smaller steps.`,
      });
    }

    // Average completion time.
    const withEstimates = completedTasks.filter((t) => t.estimateMinutes);
    if (withEstimates.length > 0) {
      const avgEstimate = withEstimates.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0) / withEstimates.length;
      insights.push({
        id: "task-avg-estimate",
        kind: "pattern",
        title: "Task estimates",
        body: `Your completed tasks had an average estimate of ${Math.round(avgEstimate)} minutes. Tasks closer to this length tend to get done.`,
      });
    }
  } else if (completedTasks.length > 0 && completedTasks.length < MIN_COMPLETED_TASKS) {
    insights.push({
      id: "task-insufficient",
      kind: "suggestion",
      title: "Not enough task data yet",
      body: `Not enough task data yet. You have ${completedTasks.length} completed task(s). Complete at least ${MIN_COMPLETED_TASKS} to identify task completion patterns.`,
    });
  }

  // --- Energy pattern ---
  if (data.energyEntries.length >= MIN_ENERGY_ENTRIES) {
    const avgLevel = data.energyEntries.reduce((sum, e) => sum + e.level, 0) / data.energyEntries.length;
    const recentEntries = data.energyEntries.slice(0, Math.min(5, data.energyEntries.length));
    const recentAvg = recentEntries.reduce((sum, e) => sum + e.level, 0) / recentEntries.length;

    if (recentAvg > avgLevel + 0.5) {
      insights.push({
        id: "energy-rising",
        kind: "celebration",
        title: "Energy is trending up",
        body: `Your recent energy levels are higher than your average. This might be a good time for harder tasks.`,
      });
    } else if (recentAvg < avgLevel - 0.5) {
      insights.push({
        id: "energy-low",
        kind: "warning",
        title: "Energy is lower than usual",
        body: `Your recent energy levels are a bit lower. Consider shorter, easier tasks today.`,
      });
    } else {
      // Sufficient data but no clear trend — still provide a baseline insight.
      insights.push({
        id: "energy-stable",
        kind: "pattern",
        title: "Energy patterns",
        body: `Your average energy level is ${avgLevel.toFixed(1)}/5 based on ${data.energyEntries.length} check-ins. Your recent levels are stable.`,
      });
    }
  } else if (data.energyEntries.length > 0 && data.energyEntries.length < MIN_ENERGY_ENTRIES) {
    insights.push({
      id: "energy-insufficient",
      kind: "suggestion",
      title: "Not enough energy data yet",
      body: `Not enough energy data yet. You have ${data.energyEntries.length} energy check-in(s). Log at least ${MIN_ENERGY_ENTRIES} to identify energy patterns.`,
    });
  }

  // If no insights at all — honest about it.
  if (insights.length === 0) {
    insights.push({
      id: "no-data",
      kind: "suggestion",
      title: "Not enough activity yet",
      body: "Not enough activity yet to identify a reliable pattern. Start using MindStep regularly — focus sessions, task completion, and energy check-ins will reveal patterns over time.",
    });
  }

  return insights;
}
