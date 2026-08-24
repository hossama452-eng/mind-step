/**
 * MindStep — Prompt 11 Personal Insights Engine tests.
 *
 * Covers:
 *   - Focus insights (empty, insufficient, sufficient data — average, best period,
 *     completion rate, interruptions, weekly trend).
 *   - Time patterns (dominant period, balanced, day-of-week).
 *   - Task patterns (postponed, typical duration, high-friction, completion trend).
 *   - Energy correlation (baseline, by-time, trend, association — cautious language).
 *   - Weekly review (what worked, what was difficult, what changed, suggested experiment).
 *   - Personal experiments (computeMetricsSnapshot, computeDelta, describeDelta).
 *   - Localization (4 languages: en/ar/fr/zh).
 *
 * All tests use deterministic synthetic data — no DB needed for these unit tests.
 */

import { describe, it, expect } from "vitest";
import type { Locale } from "@/i18n/locale";
import {
  generateFocusInsights,
  type FocusSessionData,
} from "@/lib/insights/focus-insights";
import {
  generateTimePatternInsights,
  type TaskTimeData,
} from "@/lib/insights/time-patterns";
import {
  generateTaskPatternInsights,
  type TaskPatternData,
} from "@/lib/insights/task-patterns";
import {
  generateEnergyCorrelationInsights,
  type EnergyEntryData,
  type TaskCompletionData,
} from "@/lib/insights/energy-correlation";
import { generateWeeklyReview } from "@/lib/insights/weekly-review";
import {
  EXPERIMENT_TYPES,
  computeDelta,
  describeDelta,
  type ExperimentMetrics,
  type ExperimentDelta,
} from "@/lib/insights/personal-experiments";

// ============================================================
// HELPERS — synthetic data factories
// ============================================================

function makeSession(overrides: Partial<FocusSessionData> = {}): FocusSessionData {
  return {
    id: `s-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date(),
    endedAt: null,
    plannedMinutes: 25,
    actualMinutes: 25,
    status: "completed",
    interruptions: 0,
    taskId: null,
    taskTitle: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskPatternData> = {}): TaskPatternData {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    status: "inbox",
    priority: "normal",
    estimateMinutes: 25,
    actualMinutes: null,
    createdAt: new Date(),
    completedAt: null,
    archivedAt: null,
    projectId: null,
    tags: "[]",
    snoozedCount: 0,
    title: "Test task",
    ...overrides,
  };
}

function makeEnergy(overrides: Partial<EnergyEntryData> = {}): EnergyEntryData {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    level: 3,
    timestamp: new Date(),
    note: null,
    ...overrides,
  };
}

// ============================================================
// FOCUS INSIGHTS
// ============================================================

describe("Focus Insights (Prompt 11 — Focus Insights)", () => {
  const locales: Locale[] = ["en", "ar", "fr", "zh"];

  it("returns an empty state when there are no sessions", () => {
    for (const locale of locales) {
      const result = generateFocusInsights([], locale);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("focus-empty");
      expect(result[0].kind).toBe("suggestion");
    }
  });

  it("returns 'insufficient data' when 1-2 sessions exist", () => {
    const sessions = [makeSession(), makeSession()];
    for (const locale of locales) {
      const result = generateFocusInsights(sessions, locale);
      expect(result.some((r) => r.id === "focus-insufficient")).toBe(true);
    }
  });

  it("computes average focus duration when ≥3 sessions exist", () => {
    const sessions = [
      makeSession({ actualMinutes: 20, plannedMinutes: 25 }),
      makeSession({ actualMinutes: 30, plannedMinutes: 25 }),
      makeSession({ actualMinutes: 25, plannedMinutes: 25 }),
    ];
    const result = generateFocusInsights(sessions, "en");
    const avg = result.find((r) => r.id === "focus-average");
    expect(avg).toBeDefined();
    expect(avg?.data?.metrics?.avgActualMinutes).toBe(25);
    expect(avg?.data?.metrics?.avgPlannedMinutes).toBe(25);
    expect(avg?.data?.chartData).toHaveLength(2);
    expect(avg?.data?.chartCaption).toBeTruthy();
  });

  it("detects best focus period when ≥5 sessions exist", () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      makeSession({
        startedAt: new Date(2026, 7, 22, 8 + i, 0, 0), // 8am-1pm (morning mostly)
        actualMinutes: 20,
      }),
    );
    const result = generateFocusInsights(sessions, "en");
    const bestPeriod = result.find((r) => r.id === "focus-best-period");
    expect(bestPeriod).toBeDefined();
    expect(bestPeriod?.data?.chartData).toHaveLength(4); // morning/afternoon/evening/night
  });

  it("computes session completion rate", () => {
    const sessions = [
      makeSession({ status: "completed" }),
      makeSession({ status: "completed" }),
      makeSession({ status: "cancelled" }),
    ];
    const result = generateFocusInsights(sessions, "en");
    const completion = result.find((r) => r.id === "focus-completion");
    expect(completion).toBeDefined();
    expect(completion?.data?.metrics?.completionRate).toBe(67);
    expect(completion?.data?.metrics?.completedSessions).toBe(2);
    expect(completion?.data?.metrics?.cancelledSessions).toBe(1);
  });

  it("computes interruptions per session", () => {
    const sessions = [
      makeSession({ interruptions: 1 }),
      makeSession({ interruptions: 3 }),
      makeSession({ interruptions: 2 }),
    ];
    const result = generateFocusInsights(sessions, "en");
    const interr = result.find((r) => r.id === "focus-interruptions");
    expect(interr).toBeDefined();
    expect(interr?.data?.metrics?.avgInterruptions).toBe(2);
  });

  it("computes weekly trend", () => {
    const now = new Date();
    const sessions = Array.from({ length: 7 }, (_, i) =>
      makeSession({
        startedAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
        actualMinutes: 20,
      }),
    );
    const result = generateFocusInsights(sessions, "en");
    const trend = result.find((r) => r.id === "focus-weekly-trend");
    expect(trend).toBeDefined();
    expect(trend?.data?.chartData).toHaveLength(7);
    expect(trend?.data?.metrics?.totalWeekMinutes).toBeGreaterThan(0);
  });

  it("uses cautious language — never claims 'you have ADHD'", () => {
    const sessions = Array.from({ length: 5 }, () => makeSession({ actualMinutes: 25 }));
    for (const locale of locales) {
      const result = generateFocusInsights(sessions, locale);
      const allBodies = result.map((r) => r.body).join(" ");
      expect(allBodies).not.toMatch(/\bADHD\b/i);
      expect(allBodies).not.toMatch(/you should/i);
    }
  });
});

// ============================================================
// TIME PATTERNS
// ============================================================

describe("Time Patterns (Prompt 11 — Time Patterns)", () => {
  const locales: Locale[] = ["en", "ar", "fr", "zh"];

  it("returns empty state when there are no completed tasks", () => {
    for (const locale of locales) {
      const result = generateTimePatternInsights([makeTask()], locale);
      expect(result.some((r) => r.id === "time-empty")).toBe(true);
    }
  });

  it("returns 'insufficient data' when < 5 completed tasks", () => {
    const tasks = Array.from({ length: 3 }, (_, i) =>
      makeTask({
        status: "completed",
        completedAt: new Date(2026, 7, 22, 10 + i, 0, 0),
      }),
    );
    for (const locale of locales) {
      const result = generateTimePatternInsights(tasks, locale);
      expect(result.some((r) => r.id === "time-insufficient")).toBe(true);
    }
  });

  it("detects dominant period (morning > 40% of completions)", () => {
    const morning = Array.from({ length: 6 }, () =>
      makeTask({
        status: "completed",
        completedAt: new Date(2026, 7, 22, 8, 0, 0), // morning
      }),
    );
    const afternoon = Array.from({ length: 2 }, () =>
      makeTask({
        status: "completed",
        completedAt: new Date(2026, 7, 22, 14, 0, 0), // afternoon
      }),
    );
    const tasks = [...morning, ...afternoon.map((t, i) => ({ ...t, id: `t-after-${i}` }))];
    const result = generateTimePatternInsights(tasks, "en");
    const dominant = result.find((r) => r.id === "time-dominant-period");
    expect(dominant).toBeDefined();
    expect(dominant?.data?.metrics?.dominantPeriod).toBe("morning");
    expect(dominant?.data?.metrics?.dominantPercent).toBeGreaterThanOrEqual(40);
  });

  it("returns balanced when no single period dominates", () => {
    const tasks = [
      ...Array.from({ length: 2 }, () => makeTask({ status: "completed", completedAt: new Date(2026, 7, 22, 8, 0, 0) })),
      ...Array.from({ length: 2 }, () => makeTask({ status: "completed", completedAt: new Date(2026, 7, 22, 14, 0, 0) })),
      ...Array.from({ length: 2 }, () => makeTask({ status: "completed", completedAt: new Date(2026, 7, 22, 19, 0, 0) })),
    ];
    const result = generateTimePatternInsights(tasks, "en");
    expect(result.some((r) => r.id === "time-balanced")).toBe(true);
  });

  it("avoids claiming causation", () => {
    const tasks = Array.from({ length: 8 }, () =>
      makeTask({ status: "completed", completedAt: new Date(2026, 7, 22, 9, 0, 0) }),
    );
    for (const locale of locales) {
      const result = generateTimePatternInsights(tasks, locale);
      const allBodies = result.map((r) => r.body).join(" ");
      // No causal words in English
      if (locale === "en") {
        expect(allBodies.toLowerCase()).not.toMatch(/\bbecause\b/);
        expect(allBodies.toLowerCase()).not.toMatch(/\bcauses?\b/);
      }
      // Descriptive tone: should mention "data shows" style or be descriptive
      expect(allBodies.length).toBeGreaterThan(20);
    }
  });
});

// ============================================================
// TASK PATTERNS
// ============================================================

describe("Task Patterns (Prompt 11 — Task Patterns)", () => {
  it("returns empty state when there are no tasks", () => {
    const result = generateTaskPatternInsights([], "en");
    expect(result.some((r) => r.id === "task-empty")).toBe(true);
  });

  it("detects frequently postponed tasks", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Hard task", snoozedCount: 3 }),
      makeTask({ id: "t2", title: "Another", snoozedCount: 2 }),
      makeTask({ id: "t3", title: "Easy", snoozedCount: 0 }),
    ];
    const result = generateTaskPatternInsights(tasks, "en");
    const postponed = result.find((r) => r.id === "task-frequently-postponed");
    expect(postponed).toBeDefined();
    expect(postponed?.data?.items).toHaveLength(2);
  });

  it("computes typical task duration", () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({
        status: "completed",
        completedAt: new Date(),
        estimateMinutes: 15 + (i % 3) * 10,
      }),
    );
    const result = generateTaskPatternInsights(tasks, "en");
    const duration = result.find((r) => r.id === "task-typical-duration");
    expect(duration).toBeDefined();
    expect(duration?.data?.metrics?.sampleSize).toBe(6);
  });

  it("detects high-friction projects", () => {
    const tasks = [
      ...Array.from({ length: 5 }, (_, i) => makeTask({ id: `a${i}`, projectId: "p1", status: "inbox" })),
      makeTask({ id: "a-done", projectId: "p1", status: "completed", completedAt: new Date() }),
      ...Array.from({ length: 4 }, (_, i) => makeTask({ id: `b${i}`, projectId: "p2", status: "completed", completedAt: new Date() })),
    ];
    const result = generateTaskPatternInsights(tasks, "en");
    const friction = result.find((r) => r.id === "task-high-friction");
    expect(friction).toBeDefined();
  });

  it("detects completion trend up", () => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 5);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 12);
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => makeTask({ id: `w${i}`, status: "completed", completedAt: weekAgo })),
      ...Array.from({ length: 3 }, (_, i) => makeTask({ id: `l${i}`, status: "completed", completedAt: twoWeeksAgo })),
    ];
    const result = generateTaskPatternInsights(tasks, "en");
    const trend = result.find((r) => r.id === "task-trend-up");
    expect(trend).toBeDefined();
    expect(trend?.data?.metrics?.delta).toBe(3);
  });
});

// ============================================================
// ENERGY CORRELATION
// ============================================================

describe("Energy Correlation (Prompt 11 — Energy Correlation)", () => {
  it("returns empty state when no energy entries exist", () => {
    const result = generateEnergyCorrelationInsights([], [], "en");
    expect(result.some((r) => r.id === "energy-empty")).toBe(true);
  });

  it("returns insufficient when < 5 entries", () => {
    const energy = [makeEnergy(), makeEnergy()];
    const result = generateEnergyCorrelationInsights(energy, [], "en");
    expect(result.some((r) => r.id === "energy-insufficient")).toBe(true);
  });

  it("computes energy baseline", () => {
    const energy = [
      makeEnergy({ level: 3 }),
      makeEnergy({ level: 4 }),
      makeEnergy({ level: 3 }),
      makeEnergy({ level: 4 }),
      makeEnergy({ level: 3 }),
    ];
    const result = generateEnergyCorrelationInsights(energy, [], "en");
    const baseline = result.find((r) => r.id === "energy-baseline");
    expect(baseline).toBeDefined();
    expect(baseline?.data?.metrics?.avgLevel).toBeCloseTo(3.4, 1);
  });

  it("computes energy-by-time when ≥2 periods have data", () => {
    const energy = [
      makeEnergy({ level: 5, timestamp: new Date(2026, 7, 22, 9, 0, 0) }), // morning
      makeEnergy({ level: 5, timestamp: new Date(2026, 7, 22, 10, 0, 0) }), // morning
      makeEnergy({ level: 2, timestamp: new Date(2026, 7, 22, 14, 0, 0) }), // afternoon
      makeEnergy({ level: 2, timestamp: new Date(2026, 7, 22, 15, 0, 0) }), // afternoon
      makeEnergy({ level: 3, timestamp: new Date(2026, 7, 22, 11, 0, 0) }), // morning
    ];
    const result = generateEnergyCorrelationInsights(energy, [], "en");
    const byTime = result.find((r) => r.id === "energy-by-time");
    expect(byTime).toBeDefined();
    expect(byTime?.data?.metrics?.topPeriod).toBe("morning");
  });

  it("surfaces correlation between energy and task completion", () => {
    const energy = [
      makeEnergy({ level: 5, timestamp: new Date(2026, 7, 22, 9, 0, 0) }),
      makeEnergy({ level: 5, timestamp: new Date(2026, 7, 22, 11, 0, 0) }),
      makeEnergy({ level: 5, timestamp: new Date(2026, 7, 22, 13, 0, 0) }),
      makeEnergy({ level: 2, timestamp: new Date(2026, 7, 22, 15, 0, 0) }),
      makeEnergy({ level: 2, timestamp: new Date(2026, 7, 22, 17, 0, 0) }),
    ];
    const tasks = [
      { id: "t1", completedAt: new Date(2026, 7, 22, 9, 30, 0), status: "completed" },
      { id: "t2", completedAt: new Date(2026, 7, 22, 11, 30, 0), status: "completed" },
      { id: "t3", completedAt: new Date(2026, 7, 22, 13, 30, 0), status: "completed" },
      { id: "t4", completedAt: new Date(2026, 7, 22, 15, 30, 0), status: "completed" },
      { id: "t5", completedAt: new Date(2026, 7, 22, 17, 30, 0), status: "completed" },
    ] as TaskCompletionData[];
    const result = generateEnergyCorrelationInsights(energy, tasks, "en");
    const correlation = result.find((r) => r.id === "energy-completion-correlation");
    expect(correlation).toBeDefined();
    expect(correlation?.kind).toBe("correlation");
    expect(correlation?.data?.chartData).toHaveLength(2); // high vs low
    // Must contain the disclaimer "association, not a cause"
    expect(correlation?.body.toLowerCase()).toMatch(/association/);
  });

  it("uses cautious language — never 'your brain works best'", () => {
    const energy = Array.from({ length: 5 }, () => makeEnergy({ level: 4 }));
    for (const locale of ["en", "ar", "fr", "zh"] as Locale[]) {
      const result = generateEnergyCorrelationInsights(energy, [], locale);
      const allBodies = result.map((r) => r.body).join(" ");
      expect(allBodies.toLowerCase()).not.toMatch(/brain works/i);
      expect(allBodies.toLowerCase()).not.toMatch(/you should/i);
    }
  });
});

// ============================================================
// WEEKLY REVIEW
// ============================================================

describe("Weekly Review (Prompt 11 — Weekly Review)", () => {
  it("returns 'nothing to highlight' when there is no data", () => {
    const review = generateWeeklyReview({ focusSessions: [], tasks: [], energyEntries: [] }, "en");
    expect(review.worked).toHaveLength(1);
    expect(review.worked[0]).toMatch(/nothing/i);
  });

  it("includes 'what worked' highlights when sessions were completed", () => {
    const now = new Date();
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({
        startedAt: new Date(now.getTime() - i * 60 * 60 * 1000),
        actualMinutes: 25,
      }),
    );
    const review = generateWeeklyReview({ focusSessions: sessions, tasks: [], energyEntries: [] }, "en");
    expect(review.worked.length).toBeGreaterThan(0);
    expect(review.worked.some((w) => /session/i.test(w))).toBe(true);
  });

  it("includes 'what was difficult' when sessions were cancelled", () => {
    const sessions = [
      ...Array.from({ length: 3 }, () => makeSession({ status: "completed", actualMinutes: 25 })),
      makeSession({ status: "cancelled" }),
    ];
    const review = generateWeeklyReview({ focusSessions: sessions, tasks: [], energyEntries: [] }, "en");
    expect(review.difficult.some((d) => /cancel/i.test(d))).toBe(true);
  });

  it("includes 'what changed' (focus delta)", () => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 5);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 12);
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeSession({ startedAt: new Date(weekAgo.getTime() - i * 60 * 60 * 1000), actualMinutes: 25 }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeSession({ startedAt: new Date(twoWeeksAgo.getTime() - i * 60 * 60 * 1000), actualMinutes: 10 }),
      ),
    ];
    const review = generateWeeklyReview({ focusSessions: sessions, tasks: [], energyEntries: [] }, "en");
    expect(review.changed.some((c) => /focus/i.test(c))).toBe(true);
  });

  it("suggests an experiment type from the allow-list", () => {
    const review = generateWeeklyReview({ focusSessions: [], tasks: [], energyEntries: [] }, "en");
    expect(EXPERIMENT_TYPES).toContain(review.suggestedExperiment.type);
  });

  it("suggests shorter_focus when actual < 80% of planned", () => {
    const now = new Date();
    const sessions = Array.from({ length: 5 }, () =>
      makeSession({
        startedAt: new Date(now.getTime() - 60 * 60 * 1000),
        plannedMinutes: 30,
        actualMinutes: 15, // 50% of planned
      }),
    );
    const review = generateWeeklyReview({ focusSessions: sessions, tasks: [], energyEntries: [] }, "en");
    expect(review.suggestedExperiment.type).toBe("shorter_focus");
  });

  it("is localized — body contains localized text in all 4 locales", () => {
    for (const locale of ["en", "ar", "fr", "zh"] as Locale[]) {
      const review = generateWeeklyReview({ focusSessions: [], tasks: [], energyEntries: [] }, locale);
      expect(review.worked[0].length).toBeGreaterThan(0);
      expect(review.suggestedExperiment.title.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// PERSONAL EXPERIMENTS — pure functions
// ============================================================

describe("Personal Experiments (Prompt 11 — Personal Experiments)", () => {
  it("defines 8 experiment types", () => {
    expect(EXPERIMENT_TYPES).toHaveLength(8);
    expect(EXPERIMENT_TYPES).toContain("shorter_focus");
    expect(EXPERIMENT_TYPES).toContain("longer_focus");
    expect(EXPERIMENT_TYPES).toContain("morning_planning");
    expect(EXPERIMENT_TYPES).toContain("evening_planning");
    expect(EXPERIMENT_TYPES).toContain("smaller_steps");
    expect(EXPERIMENT_TYPES).toContain("different_reminder_timing");
    expect(EXPERIMENT_TYPES).toContain("earlier_breaks");
    expect(EXPERIMENT_TYPES).toContain("later_breaks");
  });

  const baseline: ExperimentMetrics = {
    totalFocusMinutes: 100,
    completedSessions: 5,
    cancelledSessions: 1,
    completionRate: 83,
    avgSessionMinutes: 20,
    interruptionsPerSession: 1.5,
    completedTasks: 8,
    avgEnergy: 3.2,
    sampleDays: 7,
    capturedAt: new Date().toISOString(),
  };

  const post: ExperimentMetrics = {
    ...baseline,
    totalFocusMinutes: 150,
    completedSessions: 7,
    completionRate: 88,
    interruptionsPerSession: 1.0,
    completedTasks: 12,
    avgEnergy: 3.5,
  };

  it("computeDelta returns delta + pctChange for each metric", () => {
    const delta: ExperimentDelta = computeDelta(baseline, post);
    expect(delta.totalFocusMinutes.delta).toBe(50);
    expect(delta.totalFocusMinutes.pctChange).toBe(50); // +50%
    expect(delta.completedSessions.delta).toBe(2);
    expect(delta.interruptionsPerSession.delta).toBe(-0.5); // improvements are negative
    expect(delta.avgEnergy.delta).toBeCloseTo(0.3, 2);
  });

  it("describeDelta uses cautious language", () => {
    const delta = computeDelta(baseline, post);
    for (const locale of ["en", "ar", "fr", "zh"] as Locale[]) {
      const desc = describeDelta("shorter_focus", delta, locale);
      expect(desc.length).toBeGreaterThan(10);
      // Never judgmental
      expect(desc.toLowerCase()).not.toMatch(/you failed/i);
      expect(desc.toLowerCase()).not.toMatch(/you should have/i);
    }
  });

  it("describeDelta handles missing data gracefully", () => {
    const emptyBaseline: ExperimentMetrics = {
      ...baseline,
      avgEnergy: null,
    };
    const emptyPost: ExperimentMetrics = {
      ...post,
      avgEnergy: null,
    };
    const delta = computeDelta(emptyBaseline, emptyPost);
    const desc = describeDelta("shorter_focus", delta, "en");
    // For avgEnergy with null baseline/post, metricForType is avgSessionMinutes,
    // which has data — so the desc should still be informative.
    expect(desc.length).toBeGreaterThan(10);
  });

  it("handles zero baseline (no division by zero)", () => {
    const zeroBaseline: ExperimentMetrics = {
      ...baseline,
      totalFocusMinutes: 0,
    };
    const delta = computeDelta(zeroBaseline, post);
    expect(delta.totalFocusMinutes.delta).toBe(150);
    expect(delta.totalFocusMinutes.pctChange).toBeNull(); // can't compute % change from 0
  });
});
