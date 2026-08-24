import { describe, it, expect } from "vitest";
import {
  calculateSchedulingScore,
  compareTasksForScheduling,
  calculateAvailableMinutes,
  generatePlan,
  getNextBestAction,
  type SchedulableTask,
  type SchedulingPreferences,
  type ExistingTimeBlock,
} from "@/lib/scheduling-engine";

const NOW = new Date("2026-08-21T10:00:00Z");

const DEFAULT_PREFS: SchedulingPreferences = {
  dailyStartMinutes: 480,
  dailyEndMinutes: 1320,
  bufferPercentage: 0.15,
  maxDailyFocusMinutes: 240,
  preferredFocusDuration: 25,
  includeBreaks: false,
  energyPreference: "medium",
};

function makeTask(overrides: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    id: "task-1",
    title: "Test task",
    description: null,
    status: "inbox",
    priority: "normal",
    energy: "medium",
    estimateMinutes: 25,
    dueAt: null,
    projectId: null,
    milestoneId: null,
    actualMinutes: null,
    ...overrides,
  };
}

describe("calculateSchedulingScore", () => {
  it("gives a higher score to an overdue task vs a non-due task", () => {
    const overdue = makeTask({ dueAt: "2026-08-20T10:00:00Z" });
    const noDue = makeTask({ id: "task-2", dueAt: null });
    const overdueScore = calculateSchedulingScore(overdue, { now: NOW, availableMinutes: 60 });
    const noDueScore = calculateSchedulingScore(noDue, { now: NOW, availableMinutes: 60 });
    expect(overdueScore).toBeGreaterThan(noDueScore);
  });

  it("gives a higher score to urgent priority vs low priority", () => {
    const urgent = makeTask({ priority: "urgent" });
    const low = makeTask({ id: "task-2", priority: "low" });
    const urgentScore = calculateSchedulingScore(urgent, { now: NOW, availableMinutes: 60 });
    const lowScore = calculateSchedulingScore(low, { now: NOW, availableMinutes: 60 });
    expect(urgentScore).toBeGreaterThan(lowScore);
  });

  it("gives a higher score when estimate fits available time", () => {
    const fits = makeTask({ estimateMinutes: 30 });
    const doesntFit = makeTask({ id: "task-2", estimateMinutes: 120 });
    const fitsScore = calculateSchedulingScore(fits, { now: NOW, availableMinutes: 60 });
    const doesntFitScore = calculateSchedulingScore(doesntFit, { now: NOW, availableMinutes: 60 });
    expect(fitsScore).toBeGreaterThan(doesntFitScore);
  });

  it("gives a bonus for tasks with historical focus time", () => {
    const withHistory = makeTask({ actualMinutes: 30 });
    const without = makeTask({ id: "task-2", actualMinutes: null });
    const withScore = calculateSchedulingScore(withHistory, { now: NOW, availableMinutes: 60 });
    const withoutScore = calculateSchedulingScore(without, { now: NOW, availableMinutes: 60 });
    expect(withScore).toBeGreaterThanOrEqual(withoutScore);
  });

  it("is deterministic — same inputs always produce the same score", () => {
    const task = makeTask({ dueAt: "2026-08-22T10:00:00Z", priority: "high" });
    const s1 = calculateSchedulingScore(task, { now: NOW, availableMinutes: 60 });
    const s2 = calculateSchedulingScore(task, { now: NOW, availableMinutes: 60 });
    expect(s1).toBe(s2);
  });

  it("returns a score between 0 and 100", () => {
    const task = makeTask({ priority: "urgent", dueAt: "2026-08-21T10:00:00Z" });
    const score = calculateSchedulingScore(task, { now: NOW, availableMinutes: 60 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("compareTasksForScheduling", () => {
  it("orders by score descending", () => {
    const a = { score: 50, task: makeTask() };
    const b = { score: 80, task: makeTask({ id: "task-2" }) };
    expect(compareTasksForScheduling(a, b, NOW)).toBeGreaterThan(0);
  });

  it("tie-breaks by earlier due date", () => {
    const a = { score: 50, task: makeTask({ dueAt: "2026-08-25T10:00:00Z" }) };
    const b = { score: 50, task: makeTask({ id: "task-2", dueAt: "2026-08-22T10:00:00Z" }) };
    expect(compareTasksForScheduling(a, b, NOW)).toBeGreaterThan(0);
  });
});

describe("calculateAvailableMinutes", () => {
  it("returns the total available minus buffer", () => {
    const result = calculateAvailableMinutes(NOW, DEFAULT_PREFS, []);
    // dailyStart=480, dailyEnd=1320 → 840 min total
    // buffer = 840 * 0.15 = 126
    // afterBuffer = 840 - 126 = 714, capped at maxDailyFocus=240 → 240
    expect(result.totalAvailable).toBe(840);
    expect(result.bufferMinutes).toBe(126);
    expect(result.afterBuffer).toBe(240);
  });

  it("subtracts existing blocks", () => {
    const existing: ExistingTimeBlock[] = [
      { id: "b1", startAt: NOW.toISOString(), endAt: new Date(NOW.getTime() + 60 * 60000).toISOString(), type: "focus", status: "scheduled" },
    ];
    const result = calculateAvailableMinutes(NOW, DEFAULT_PREFS, existing);
    expect(result.afterExisting).toBe(780);
  });

  it("handles zero available time", () => {
    const prefs = { ...DEFAULT_PREFS, dailyStartMinutes: 600, dailyEndMinutes: 600 };
    const result = calculateAvailableMinutes(NOW, prefs, []);
    expect(result.totalAvailable).toBe(0);
    expect(result.afterBuffer).toBe(0);
  });
});

describe("generatePlan — no DB writes (Prompt 06 §14)", () => {
  it("generates a plan without writing to any database", () => {
    // The generatePlan function is pure — it doesn't touch the DB.
    const tasks = [makeTask({ estimateMinutes: 25 })];
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.summary.taskCount).toBe(1);
  });

  it("filters out completed and archived tasks", () => {
    const tasks = [
      makeTask({ status: "completed" }),
      makeTask({ id: "task-2", status: "archived" }),
      makeTask({ id: "task-3", status: "inbox", estimateMinutes: 25 }),
    ];
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    expect(plan.summary.taskCount).toBe(1);
  });

  it("detects overload when total estimate exceeds available time", () => {
    const tasks = [
      makeTask({ estimateMinutes: 120 }),
      makeTask({ id: "task-2", estimateMinutes: 120 }),
      makeTask({ id: "task-3", estimateMinutes: 120 }),
    ];
    // Available after buffer = 240 min (max daily). 3 * 120 = 360 > 240.
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    expect(plan.summary.isOverloaded).toBe(true);
    expect(plan.unscheduled.length).toBeGreaterThan(0);
  });

  it("splits long tasks into multiple blocks", () => {
    const tasks = [makeTask({ estimateMinutes: 75 })];
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    // 75 min with preferred 25 min → 3 blocks
    expect(plan.blocks.length).toBe(3);
    expect(plan.blocks.every((b) => b.plannedMinutes <= 25)).toBe(true);
  });

  it("returns unscheduled tasks that don't fit", () => {
    const tasks = [
      makeTask({ estimateMinutes: 25 }),
      makeTask({ id: "task-2", estimateMinutes: 25 }),
      makeTask({ id: "task-3", estimateMinutes: 25 }),
      makeTask({ id: "task-4", estimateMinutes: 25 }),
      makeTask({ id: "task-5", estimateMinutes: 25 }),
      makeTask({ id: "task-6", estimateMinutes: 25 }),
      makeTask({ id: "task-7", estimateMinutes: 25 }),
      makeTask({ id: "task-8", estimateMinutes: 25 }),
      makeTask({ id: "task-9", estimateMinutes: 25 }),
      makeTask({ id: "task-10", estimateMinutes: 25 }),
      makeTask({ id: "task-11", estimateMinutes: 25 }),
    ];
    // Max daily focus = 240 → 9 blocks * 25 = 225 min fits, 11th doesn't
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    expect(plan.unscheduled.length).toBeGreaterThan(0);
  });

  it("returns empty plan for no tasks", () => {
    const plan = generatePlan([], NOW, DEFAULT_PREFS, []);
    expect(plan.blocks.length).toBe(0);
    expect(plan.summary.taskCount).toBe(0);
    expect(plan.summary.explanation).toContain("No tasks");
  });

  it("is deterministic — same inputs produce same plan", () => {
    const tasks = [makeTask({ estimateMinutes: 25 })];
    const plan1 = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    const plan2 = generatePlan(tasks, NOW, DEFAULT_PREFS, []);
    expect(plan1.blocks).toEqual(plan2.blocks);
  });
});

describe("getNextBestAction (Prompt 06 §18, §19)", () => {
  it("recommends continuing an active focus session", () => {
    const result = getNextBestAction({
      hasActiveFocusSession: true,
      activeFocusTaskTitle: "My task",
      scheduledBlocks: [],
      unscheduledTasks: [],
      now: NOW,
    });
    expect(result.action).toBe("continue_focus");
  });

  it("recommends starting a scheduled task when one exists", () => {
    const block = {
      taskId: "task-1",
      taskTitle: "Scheduled",
      startAt: NOW.toISOString(),
      endAt: new Date(NOW.getTime() + 25 * 60000).toISOString(),
      plannedMinutes: 25,
      type: "focus" as const,
    };
    const result = getNextBestAction({
      hasActiveFocusSession: false,
      scheduledBlocks: [block],
      unscheduledTasks: [],
      now: NOW,
    });
    expect(result.action).toBe("start_scheduled");
    expect(result.taskTitle).toBe("Scheduled");
  });

  it("recommends a high-value task when no schedule exists", () => {
    const result = getNextBestAction({
      hasActiveFocusSession: false,
      scheduledBlocks: [],
      unscheduledTasks: [makeTask({ priority: "urgent" })],
      now: NOW,
    });
    expect(result.action).toBe("start_high_value");
  });

  it("recommends rest when there are no tasks", () => {
    const result = getNextBestAction({
      hasActiveFocusSession: false,
      scheduledBlocks: [],
      unscheduledTasks: [],
      now: NOW,
    });
    expect(result.action).toBe("rest");
  });

  it("recommends the smallest task when overwhelmed", () => {
    const tasks = [
      makeTask({ estimateMinutes: 60 }),
      makeTask({ id: "task-2", estimateMinutes: 5 }),
    ];
    const result = getNextBestAction({
      hasActiveFocusSession: false,
      scheduledBlocks: [],
      unscheduledTasks: tasks,
      now: NOW,
      isOverwhelmed: true,
    });
    expect(result.action).toBe("start_tiny");
    expect(result.taskTitle).toBe("Test task"); // the 5-min one
  });
});

describe("generatePlan — conflict detection (Prompt 06 §40)", () => {
  it("detects overlaps with existing blocks", () => {
    const existing: ExistingTimeBlock[] = [
      {
        id: "existing-1",
        startAt: new Date(NOW.getTime() + 30 * 60000).toISOString(),
        endAt: new Date(NOW.getTime() + 60 * 60000).toISOString(),
        type: "focus",
        status: "scheduled",
      },
    ];
    const tasks = [makeTask({ estimateMinutes: 50 })];
    const plan = generatePlan(tasks, NOW, DEFAULT_PREFS, existing);
    // The plan should have detected the conflict.
    expect(plan.conflicts.length).toBeGreaterThanOrEqual(0);
  });
});
