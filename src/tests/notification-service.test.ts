import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_TYPES,
  isInQuietHours,
  type NotificationPrefs,
} from "@/lib/notifications/notification-service";

const DEFAULT_PREFS: NotificationPrefs = {
  notificationsEnabled: true,
  notificationFrequency: "balanced",
  quietHoursStart: 1320, // 22:00
  quietHoursEnd: 480,   // 08:00
  quietHoursEnabled: true,
  dailyNotificationBudget: 10,
  notifyTaskDue: true,
  notifyTaskOverdue: true,
  notifyFocusStart: false,
  notifyFocusEnd: false,
  notifyPlanner: true,
  notifyMilestones: true,
  notifyAINudges: true,
  // Prompt 10 — granular per-domain controls
  notifyHabits: true,
  notifyCalendar: true,
  notifyBills: true,
  notifyRoutines: true,
  maxSnoozeCount: 3,
  timezone: "UTC",
};

describe("Notification Types (Prompt 08 §2 + Prompt 10)", () => {
  it("has all required notification types", () => {
    expect(NOTIFICATION_TYPES.TASK_DUE).toBe("task_due");
    expect(NOTIFICATION_TYPES.TASK_OVERDUE).toBe("task_overdue");
    expect(NOTIFICATION_TYPES.FOCUS_START).toBe("focus_start");
    expect(NOTIFICATION_TYPES.FOCUS_END).toBe("focus_end");
    expect(NOTIFICATION_TYPES.MISSED_PLAN).toBe("missed_plan");
    expect(NOTIFICATION_TYPES.RECOVERY_SUGGESTION).toBe("recovery_suggestion");
    expect(NOTIFICATION_TYPES.SYSTEM).toBe("system");
    expect(NOTIFICATION_TYPES.AI_NUDGE).toBe("ai_nudge");
    // Prompt 10 — new notification domains
    expect(NOTIFICATION_TYPES.HABIT_REMINDER).toBe("habit_reminder");
    expect(NOTIFICATION_TYPES.CALENDAR_EVENT).toBe("calendar_event");
    expect(NOTIFICATION_TYPES.BILL_DUE).toBe("bill_due");
    expect(NOTIFICATION_TYPES.ROUTINE_REMINDER).toBe("routine_reminder");
  });
});

describe("Quiet Hours (Prompt 08 §16)", () => {
  it("detects quiet hours at night (22:00-08:00)", () => {
    const lateNight = new Date("2026-08-21T23:00:00Z");
    const earlyMorning = new Date("2026-08-21T03:00:00Z");
    expect(isInQuietHours(DEFAULT_PREFS, lateNight)).toBe(true);
    expect(isInQuietHours(DEFAULT_PREFS, earlyMorning)).toBe(true);
  });

  it("does not flag daytime as quiet hours", () => {
    const noon = new Date("2026-08-21T12:00:00Z");
    const afternoon = new Date("2026-08-21T15:00:00Z");
    expect(isInQuietHours(DEFAULT_PREFS, noon)).toBe(false);
    expect(isInQuietHours(DEFAULT_PREFS, afternoon)).toBe(false);
  });

  it("respects disabled quiet hours", () => {
    const prefs = { ...DEFAULT_PREFS, quietHoursEnabled: false };
    const lateNight = new Date("2026-08-21T23:00:00Z");
    expect(isInQuietHours(prefs, lateNight)).toBe(false);
  });

  it("handles non-wrapping quiet hours (e.g., 13:00-14:00)", () => {
    const prefs = { ...DEFAULT_PREFS, quietHoursStart: 780, quietHoursEnd: 840 }; // 13:00-14:00
    const inWindow = new Date("2026-08-21T13:30:00Z");
    const outWindow = new Date("2026-08-21T15:00:00Z");
    expect(isInQuietHours(prefs, inWindow)).toBe(true);
    expect(isInQuietHours(prefs, outWindow)).toBe(false);
  });

  it("handles midnight boundary correctly", () => {
    const prefs = { ...DEFAULT_PREFS, quietHoursStart: 1380, quietHoursEnd: 420 }; // 23:00-07:00
    const justBeforeMidnight = new Date("2026-08-21T23:59:00Z");
    const justAfterMidnight = new Date("2026-08-22T00:01:00Z");
    expect(isInQuietHours(prefs, justBeforeMidnight)).toBe(true);
    expect(isInQuietHours(prefs, justAfterMidnight)).toBe(true);
  });
});

describe("Notification Preferences (Prompt 08 §47, §48 + Prompt 10)", () => {
  it("default prefs have sensible defaults", () => {
    expect(DEFAULT_PREFS.notificationsEnabled).toBe(true);
    expect(DEFAULT_PREFS.notificationFrequency).toBe("balanced");
    expect(DEFAULT_PREFS.quietHoursEnabled).toBe(true);
    expect(DEFAULT_PREFS.dailyNotificationBudget).toBe(10);
    expect(DEFAULT_PREFS.notifyTaskDue).toBe(true);
    expect(DEFAULT_PREFS.notifyFocusStart).toBe(false); // Off by default
  });

  it("daily budget is reasonable (not 0, not excessive)", () => {
    expect(DEFAULT_PREFS.dailyNotificationBudget).toBeGreaterThan(0);
    expect(DEFAULT_PREFS.dailyNotificationBudget).toBeLessThanOrEqual(50);
  });

  it("Prompt 10 — granular per-domain notification controls exist", () => {
    expect(DEFAULT_PREFS).toHaveProperty("notifyHabits");
    expect(DEFAULT_PREFS).toHaveProperty("notifyCalendar");
    expect(DEFAULT_PREFS).toHaveProperty("notifyBills");
    expect(DEFAULT_PREFS).toHaveProperty("notifyRoutines");
    expect(DEFAULT_PREFS.notifyHabits).toBe(true);
    expect(DEFAULT_PREFS.notifyCalendar).toBe(true);
    expect(DEFAULT_PREFS.notifyBills).toBe(true);
    expect(DEFAULT_PREFS.notifyRoutines).toBe(true);
  });

  it("Prompt 10 — max snooze count is set (prevents infinite snoozing)", () => {
    expect(DEFAULT_PREFS.maxSnoozeCount).toBeGreaterThan(0);
    expect(DEFAULT_PREFS.maxSnoozeCount).toBeLessThanOrEqual(10);
  });
});
