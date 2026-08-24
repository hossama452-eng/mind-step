/**
 * MindStep Notification Service (Prompt 08 + Prompt 10).
 *
 * Architecture:
 *   - NotificationService: creates, retrieves, marks read/dismissed/snoozed notifications.
 *   - NotificationScheduler: generates smart nudges from real data (deterministic, idempotent).
 *   - All notifications are persisted, user-scoped, deduplicated via dedupKey.
 *
 * SMART REMINDERS (Prompt 10): every notification supports
 *   Snooze / Reschedule / Complete / Dismiss — never aggressive repeat alerts.
 *
 * SMART NUDGES (Prompt 08 §13): contextual, non-shaming language.
 * QUIET HOURS (Prompt 08 §16): non-critical notifications delayed during quiet hours.
 * DAILY BUDGET (Prompt 08 §18): max N non-critical notifications per day.
 * DEDUPLICATION (Prompt 08 §19): dedupKey prevents duplicates.
 * IDEMPOTENCY (Prompt 08 §20): running the scheduler twice doesn't create duplicates.
 *
 * NO SHAME LANGUAGE (Prompt 08 §14): never "You failed" — always "Your plan changed."
 *
 * Prompt 10 §Notifications: tasks, reminders, focus sessions, habits, calendar events,
 * bills, routines. Avoid excessive notifications. Granular controls.
 */

import { db } from "@/lib/db";
import type { Locale } from "@/i18n/locale";

// ============================================================
// NOTIFICATION TYPES (Prompt 08 §2 + Prompt 10)
// ============================================================

export const NOTIFICATION_TYPES = {
  TASK_DUE: "task_due",
  TASK_OVERDUE: "task_overdue",
  FOCUS_START: "focus_start",
  FOCUS_END: "focus_end",
  PLANNING_REMINDER: "planning_reminder",
  PLANNED_TASK: "planned_task",
  MISSED_PLAN: "missed_plan",
  RECOVERY_SUGGESTION: "recovery_suggestion",
  MILESTONE: "milestone",
  PROJECT: "project",
  SYSTEM: "system",
  AI_NUDGE: "ai_nudge",
  // Prompt 10 — New notification domains
  HABIT_REMINDER: "habit_reminder",
  CALENDAR_EVENT: "calendar_event",
  BILL_DUE: "bill_due",
  ROUTINE_REMINDER: "routine_reminder",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// ============================================================
// SMART REMINDER ACTIONS (Prompt 10 — Smart Reminders)
// ============================================================

export const REMINDER_ACTIONS = {
  SNOOZE: "snooze",
  RESCHEDULE: "reschedule",
  COMPLETE: "complete",
  DISMISS: "dismiss",
} as const;

export type ReminderAction = (typeof REMINDER_ACTIONS)[keyof typeof REMINDER_ACTIONS];

// Snooze presets (Prompt 10 §Smart Reminders — supportive, not aggressive).
export const SNOOZE_PRESETS = {
  "10min": 10 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "1hour": 60 * 60 * 1000,
  "tomorrow": 24 * 60 * 60 * 1000, // approximate — actual time set in the handler
} as const;

export type SnoozePreset = keyof typeof SNOOZE_PRESETS;

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

export interface NotificationPrefs {
  notificationsEnabled: boolean;
  notificationFrequency: "minimal" | "balanced" | "more";
  quietHoursStart: number;
  quietHoursEnd: number;
  quietHoursEnabled: boolean;
  dailyNotificationBudget: number;
  notifyTaskDue: boolean;
  notifyTaskOverdue: boolean;
  notifyFocusStart: boolean;
  notifyFocusEnd: boolean;
  notifyPlanner: boolean;
  notifyMilestones: boolean;
  notifyAINudges: boolean;
  // Prompt 10 — granular per-domain controls
  notifyHabits: boolean;
  notifyCalendar: boolean;
  notifyBills: boolean;
  notifyRoutines: boolean;
  // Prompt 10 — snooze cap (prevents infinite snoozing)
  maxSnoozeCount: number;
  timezone: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  notificationsEnabled: true,
  notificationFrequency: "balanced",
  quietHoursStart: 1320,
  quietHoursEnd: 480,
  quietHoursEnabled: true,
  dailyNotificationBudget: 10,
  notifyTaskDue: true,
  notifyTaskOverdue: true,
  notifyFocusStart: false,
  notifyFocusEnd: false,
  notifyPlanner: true,
  notifyMilestones: true,
  notifyAINudges: true,
  notifyHabits: true,
  notifyCalendar: true,
  notifyBills: true,
  notifyRoutines: true,
  maxSnoozeCount: 3,
  timezone: "UTC",
};

// ============================================================
// QUIET HOURS (Prompt 08 §16)
// ============================================================

export function isInQuietHours(prefs: NotificationPrefs, now: Date = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (start > end) {
    return minutesSinceMidnight >= start || minutesSinceMidnight < end;
  }
  return minutesSinceMidnight >= start && minutesSinceMidnight < end;
}

// ============================================================
// DAILY BUDGET (Prompt 08 §18)
// ============================================================

export async function getDailyNotificationCount(userId: string, now: Date = new Date()): Promise<number> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return db.notification.count({
    where: { userId, createdAt: { gte: dayStart }, priority: "normal", dismissedAt: null },
  });
}

export async function isWithinBudget(userId: string, prefs: NotificationPrefs, now: Date = new Date()): Promise<boolean> {
  const count = await getDailyNotificationCount(userId, now);
  return count < prefs.dailyNotificationBudget;
}

// ============================================================
// NOTIFICATION SERVICE (Prompt 08 §1, §5 + Prompt 10 smart reminder actions)
// ============================================================

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  scheduledFor?: Date;
  priority?: "normal" | "critical";
  dedupKey?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  if (input.dedupKey) {
    const existing = await db.notification.findFirst({
      where: { userId: input.userId, dedupKey: input.dedupKey },
    });
    if (existing) return existing;
  }

  const now = new Date();
  const prefs = await getPrefs(input.userId);
  const isCritical = input.priority === "critical";
  const inQuiet = isInQuietHours(prefs, now);

  if (!isCritical && inQuiet) {
    return db.notification.create({
      data: {
        userId: input.userId, type: input.type, title: input.title, body: input.body,
        entityType: input.entityType ?? null, entityId: input.entityId ?? null,
        scheduledFor: input.scheduledFor ?? null, deliveredAt: null,
        priority: input.priority ?? "normal", dedupKey: input.dedupKey ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  }

  if (!isCritical && !(await isWithinBudget(input.userId, prefs, now))) return null;

  return db.notification.create({
    data: {
      userId: input.userId, type: input.type, title: input.title, body: input.body,
      entityType: input.entityType ?? null, entityId: input.entityId ?? null,
      scheduledFor: input.scheduledFor ?? null, deliveredAt: now,
      priority: input.priority ?? "normal", dedupKey: input.dedupKey ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export async function getNotifications(userId: string, filter: "all" | "unread" = "all") {
  const now = new Date();
  const where: Record<string, unknown> = {
    userId,
    // Hide snoozed notifications until their snooze-until time has passed
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  if (filter === "unread") {
    where.readAt = null;
    where.dismissedAt = null;
  } else {
    where.dismissedAt = null;
  }
  return db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const now = new Date();
  return db.notification.count({
    where: {
      userId,
      readAt: null,
      dismissedAt: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
  });
}

export async function markRead(userId: string, notificationId: string) {
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif || notif.userId !== userId) return null;
  return db.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  const unread = await db.notification.findMany({ where: { userId, readAt: null, dismissedAt: null }, select: { id: true } });
  if (unread.length === 0) return { count: 0 };
  await db.notification.updateMany({ where: { id: { in: unread.map((n) => n.id) } }, data: { readAt: new Date() } });
  return { count: unread.length };
}

export async function dismiss(userId: string, notificationId: string) {
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif || notif.userId !== userId) return null;
  return db.notification.update({
    where: { id: notificationId },
    data: { dismissedAt: new Date(), readAt: new Date(), actionTaken: REMINDER_ACTIONS.DISMISS, actionAt: new Date() },
  });
}

// ============================================================
// SMART REMINDER ACTIONS (Prompt 10)
// ============================================================

// Type alias for the notification update result — used across the smart reminder actions.
type NotificationUpdate = Awaited<ReturnType<typeof db.notification.update>>;
type ReminderUpdate = Awaited<ReturnType<typeof db.reminder.update>>;

interface SnoozeResult {
  ok: boolean;
  capped?: boolean;
  currentCount?: number;
  notification?: NotificationUpdate;
}

interface RescheduleResult {
  ok: boolean;
  notification?: NotificationUpdate;
}

interface ReminderSnoozeResult {
  ok: boolean;
  capped?: boolean;
  reminder?: ReminderUpdate;
}

interface ReminderRescheduleResult {
  ok: boolean;
  reminder?: ReminderUpdate;
}

/**
 * Snooze a notification. Hard-caps at `maxSnoozeCount` to prevent
 * infinite snoozing. After the cap, returns { capped: true } and
 * the caller should suggest a Reschedule or Complete action instead.
 */
export async function snoozeNotification(
  userId: string,
  notificationId: string,
  duration: number, // ms
): Promise<SnoozeResult> {
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true, snoozedCount: true } });
  if (!notif || notif.userId !== userId) return { ok: false };

  const prefs = await getPrefs(userId);
  const newCount = (notif.snoozedCount ?? 0) + 1;
  if (newCount > prefs.maxSnoozeCount) {
    return { ok: false, capped: true, currentCount: notif.snoozedCount ?? 0 };
  }

  const snoozedUntil = new Date(Date.now() + duration);
  const updated = await db.notification.update({
    where: { id: notificationId },
    data: {
      snoozedUntil,
      snoozedCount: newCount,
      actionTaken: REMINDER_ACTIONS.SNOOZE,
      actionAt: new Date(),
    },
  });
  return { ok: true, currentCount: newCount, notification: updated };
}

/**
 * Reschedule a notification — sets a new scheduledFor time.
 * Unlike snooze (which is "later"), reschedule is "at a specific time".
 * The notification is hidden until that time.
 */
export async function rescheduleNotification(
  userId: string,
  notificationId: string,
  newTime: Date,
): Promise<RescheduleResult> {
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif || notif.userId !== userId) return { ok: false };
  const updated = await db.notification.update({
    where: { id: notificationId },
    data: {
      scheduledFor: newTime,
      snoozedUntil: newTime, // hide until new time
      actionTaken: REMINDER_ACTIONS.RESCHEDULE,
      actionAt: new Date(),
    },
  });
  return { ok: true, notification: updated };
}

/**
 * Mark a notification as "complete" — the underlying entity's action
 * has been done. Distinct from "dismiss" (which is "ignore this notification").
 */
export async function completeNotification(
  userId: string,
  notificationId: string,
): Promise<RescheduleResult> {
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif || notif.userId !== userId) return { ok: false };
  const updated = await db.notification.update({
    where: { id: notificationId },
    data: {
      dismissedAt: new Date(),
      readAt: new Date(),
      actionTaken: REMINDER_ACTIONS.COMPLETE,
      actionAt: new Date(),
    },
  });
  return { ok: true, notification: updated };
}

// ============================================================
// SMART REMINDER ACTIONS — REMINDER (the standalone Reminder entity)
// ============================================================

export async function snoozeReminder(
  userId: string,
  reminderId: string,
  duration: number,
): Promise<ReminderSnoozeResult> {
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
    select: { userId: true, snoozedCount: true, remindAt: true, originalRemindAt: true },
  });
  if (!reminder || reminder.userId !== userId) return { ok: false };

  const prefs = await getPrefs(userId);
  const newCount = (reminder.snoozedCount ?? 0) + 1;
  if (newCount > prefs.maxSnoozeCount) {
    return { ok: false, capped: true };
  }

  const snoozedUntil = new Date(Date.now() + duration);
  const updated = await db.reminder.update({
    where: { id: reminderId },
    data: {
      snoozedUntil,
      snoozedCount: newCount,
      lastActionAt: new Date(),
      // Preserve original remindAt the first time only
      originalRemindAt: reminder.originalRemindAt ?? reminder.remindAt,
    },
  });
  return { ok: true, reminder: updated };
}

export async function rescheduleReminder(
  userId: string,
  reminderId: string,
  newTime: Date,
): Promise<ReminderRescheduleResult> {
  const reminder = await db.reminder.findUnique({ where: { id: reminderId }, select: { userId: true, remindAt: true, originalRemindAt: true } });
  if (!reminder || reminder.userId !== userId) return { ok: false };
  const updated = await db.reminder.update({
    where: { id: reminderId },
    data: {
      remindAt: newTime,
      snoozedUntil: newTime,
      lastActionAt: new Date(),
      originalRemindAt: reminder.originalRemindAt ?? reminder.remindAt,
    },
  });
  return { ok: true, reminder: updated };
}

export async function completeReminder(
  userId: string,
  reminderId: string,
): Promise<{ ok: boolean; reminder?: ReminderUpdate }> {
  const reminder = await db.reminder.findUnique({ where: { id: reminderId }, select: { userId: true } });
  if (!reminder || reminder.userId !== userId) return { ok: false };
  const updated = await db.reminder.update({
    where: { id: reminderId },
    data: {
      completed: true,
      completedAt: new Date(),
      lastActionAt: new Date(),
    },
  });
  return { ok: true, reminder: updated };
}

// ============================================================
// NOTIFICATION SCHEDULER (Prompt 08 §13, §20, §67, §68 + Prompt 10)
// ============================================================

export async function runScheduler(userId: string, locale: Locale, now: Date = new Date()): Promise<{ created: number; suppressed: number }> {
  const prefs = await getPrefs(userId);
  if (!prefs.notificationsEnabled) return { created: 0, suppressed: 0 };

  let created = 0;
  let suppressed = 0;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dateStr = dayStart.toISOString().slice(0, 10);

  // 1. Overdue tasks (Prompt 08 §22 — conservative, non-repeating).
  if (prefs.notifyTaskOverdue) {
    const overdueTasks = await db.task.findMany({
      where: { userId, dueAt: { lt: now }, status: { notIn: ["completed", "archived", "done"] } },
      select: { id: true, title: true, dueAt: true, priority: true }, take: 5,
    });
    for (const task of overdueTasks) {
      const dedupKey = `overdue-${userId}-${task.id}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.TASK_OVERDUE,
        title: msg("taskOverdue", locale), body: `${task.title} — ${msg("overdueBody", locale)}`,
        entityType: "task", entityId: task.id, priority: "normal", dedupKey,
        metadata: { taskId: task.id, taskTitle: task.title },
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 2. Tasks due soon (within 24 hours — Prompt 08 §21).
  if (prefs.notifyTaskDue) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dueSoon = await db.task.findMany({
      where: { userId, dueAt: { gte: now, lt: tomorrow }, status: { notIn: ["completed", "archived", "done"] } },
      select: { id: true, title: true, dueAt: true }, take: 5,
    });
    for (const task of dueSoon) {
      const dedupKey = `due-soon-${userId}-${task.id}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.TASK_DUE,
        title: msg("taskDueSoon", locale), body: task.title,
        entityType: "task", entityId: task.id, priority: "normal", dedupKey,
        metadata: { taskId: task.id, dueAt: task.dueAt?.toISOString() },
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 3. Missed planned time blocks (Prompt 08 §23 — one recovery notification).
  if (prefs.notifyPlanner) {
    const missedBlocks = await db.timeBlock.findMany({
      where: { userId, startAt: { lt: now }, status: "scheduled", endAt: { lt: now } },
      select: { id: true, startAt: true, task: { select: { title: true } } }, take: 10,
    });
    if (missedBlocks.length > 0) {
      const dedupKey = `missed-plan-${userId}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.MISSED_PLAN,
        title: msg("planChanged", locale), body: msg("missedPlanBody", locale),
        entityType: "time_block", entityId: missedBlocks[0].id, priority: "normal", dedupKey,
        metadata: { missedCount: missedBlocks.length },
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 4. Focus start reminder (if enabled — Prompt 08 §24).
  if (prefs.notifyFocusStart) {
    const upcomingBlock = await db.timeBlock.findFirst({
      where: { userId, startAt: { gte: now, lt: new Date(now.getTime() + 15 * 60000) }, status: "scheduled", type: "focus" },
      include: { task: { select: { title: true } } },
    });
    if (upcomingBlock) {
      const dedupKey = `focus-start-${userId}-${upcomingBlock.id}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.FOCUS_START,
        title: msg("focusStarting", locale), body: upcomingBlock.task?.title ?? msg("focusDefault", locale),
        entityType: "time_block", entityId: upcomingBlock.id, priority: "normal", dedupKey,
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 5. Prompt 10 — Habit reminders (daily habits not yet done today).
  if (prefs.notifyHabits) {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeHabits = await db.habit.findMany({
      where: { userId, archived: false, frequency: "daily" },
      select: { id: true, name: true, cue: true, entries: { where: { date: { gte: dayAgo } }, select: { id: true, completed: true } } },
    });
    for (const habit of activeHabits) {
      const doneToday = habit.entries.some((e) => e.completed);
      if (!doneToday) {
        const dedupKey = `habit-${userId}-${habit.id}-${dateStr}`;
        const body = habit.cue ? `${habit.name} — ${habit.cue}` : habit.name;
        const notif = await createNotification({
          userId, type: NOTIFICATION_TYPES.HABIT_REMINDER,
          title: msg("habitReminder", locale), body,
          entityType: "habit", entityId: habit.id, priority: "normal", dedupKey,
          metadata: { habitId: habit.id, habitName: habit.name },
        });
        if (notif) created++; else suppressed++;
      }
    }
  }

  // 6. Prompt 10 — Calendar events starting soon (within 15 minutes).
  if (prefs.notifyCalendar) {
    const soonEnd = new Date(now.getTime() + 15 * 60 * 1000);
    const upcoming = await db.calendarEvent.findMany({
      where: { userId, startsAt: { gte: now, lt: soonEnd } },
      select: { id: true, title: true, startsAt: true, location: true }, take: 3,
    });
    for (const event of upcoming) {
      const dedupKey = `calendar-${userId}-${event.id}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.CALENDAR_EVENT,
        title: msg("calendarSoon", locale), body: event.title,
        entityType: "calendar_event", entityId: event.id, priority: "normal", dedupKey,
        metadata: { eventId: event.id, startsAt: event.startsAt.toISOString() },
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 7. Prompt 10 — Bills due soon (within 3 days).
  if (prefs.notifyBills) {
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dueBills = await db.bill.findMany({
      where: { userId, paid: false, dueAt: { gte: now, lt: threeDays } },
      select: { id: true, name: true, amount: true, currency: true, dueAt: true }, take: 5,
    });
    for (const bill of dueBills) {
      const dedupKey = `bill-${userId}-${bill.id}-${dateStr}`;
      const body = `${bill.name} — ${bill.amount} ${bill.currency}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.BILL_DUE,
        title: msg("billDueSoon", locale), body,
        entityType: "bill", entityId: bill.id, priority: "normal", dedupKey,
        metadata: { billId: bill.id, amount: bill.amount, currency: bill.currency },
      });
      if (notif) created++; else suppressed++;
    }
  }

  // 8. Prompt 10 — Routine reminders (one per active routine, deduped per day).
  if (prefs.notifyRoutines) {
    const activeRoutines = await db.routine.findMany({
      where: { userId, active: true },
      select: { id: true, name: true, timeOfDay: true },
    });
    const hour = now.getHours();
    for (const routine of activeRoutines) {
      // Only fire at the appropriate time window for the time-of-day
      const isMorning = hour >= 6 && hour < 12;
      const isAfternoon = hour >= 12 && hour < 18;
      const isEvening = hour >= 18 || hour < 6;
      const matches =
        (routine.timeOfDay === "morning" && isMorning) ||
        (routine.timeOfDay === "afternoon" && isAfternoon) ||
        (routine.timeOfDay === "evening" && isEvening) ||
        routine.timeOfDay === "anytime";
      if (!matches) continue;

      const dedupKey = `routine-${userId}-${routine.id}-${dateStr}`;
      const notif = await createNotification({
        userId, type: NOTIFICATION_TYPES.ROUTINE_REMINDER,
        title: msg("routineTime", locale), body: routine.name,
        entityType: "routine", entityId: routine.id, priority: "normal", dedupKey,
        metadata: { routineId: routine.id },
      });
      if (notif) created++; else suppressed++;
    }
  }

  return { created, suppressed };
}

// ============================================================
// HELPER: Get preferences (now with Prompt 10 extensions)
// ============================================================

async function getPrefs(userId: string): Promise<NotificationPrefs> {
  const prefs = await db.preferences.findUnique({ where: { userId } });
  if (!prefs) return DEFAULT_PREFS;
  return {
    notificationsEnabled: prefs.notificationsEnabled,
    notificationFrequency: (prefs.notificationFrequency as "minimal" | "balanced" | "more") ?? "balanced",
    quietHoursStart: prefs.quietHoursStart, quietHoursEnd: prefs.quietHoursEnd,
    quietHoursEnabled: prefs.quietHoursEnabled, dailyNotificationBudget: prefs.dailyNotificationBudget,
    notifyTaskDue: prefs.notifyTaskDue, notifyTaskOverdue: prefs.notifyTaskOverdue,
    notifyFocusStart: prefs.notifyFocusStart, notifyFocusEnd: prefs.notifyFocusEnd,
    notifyPlanner: prefs.notifyPlanner, notifyMilestones: prefs.notifyMilestones,
    notifyAINudges: prefs.notifyAINudges,
    notifyHabits: prefs.notifyHabits ?? true,
    notifyCalendar: prefs.notifyCalendar ?? true,
    notifyBills: prefs.notifyBills ?? true,
    notifyRoutines: prefs.notifyRoutines ?? true,
    maxSnoozeCount: prefs.maxSnoozeCount ?? 3,
    timezone: prefs.timezone,
  };
}

// ============================================================
// LOCALIZED MESSAGES (Prompt 08 §14 — no shame language + Prompt 10)
// ============================================================

function msg(type: string, locale: Locale): string {
  const m: Record<string, Record<Locale, string>> = {
    taskOverdue: { en: "Task needs attention", ar: "مهمة تحتاج اهتمامًا", fr: "Tâche à revoir", zh: "任务需要关注" },
    overdueBody: { en: "Would you like to reschedule or complete this?", ar: "هل تريد إعادة جدولتها أو إكمالها؟", fr: "Souhaites-tu la replanifier ou la terminer ?", zh: "想重新安排还是完成它？" },
    taskDueSoon: { en: "Coming up soon", ar: "قريبًا", fr: "Bientôt", zh: "即将到来" },
    planChanged: { en: "Your plan changed", ar: "تغير خطكك", fr: "Ton plan a changé", zh: "你的计划变了" },
    missedPlanBody: { en: "Your plan shifted. Want to recover the rest of the day?", ar: "تغير خطكك. هل تريد استعادة بقية اليوم؟", fr: "Ton plan a changé. Veux-tu récupérer le reste de la journée ?", zh: "你的计划变了。想恢复今天剩下时间吗？" },
    focusStarting: { en: "Focus starts soon", ar: "يبدأ التركيز قريبًا", fr: "Le focus commence bientôt", zh: "专注即将开始" },
    focusDefault: { en: "Focus session", ar: "جلسة تركيز", fr: "Session de focus", zh: "专注会话" },
    habitReminder: { en: "Gentle nudge", ar: "تذكير لطيف", fr: "Petit rappel", zh: "温柔提醒" },
    calendarSoon: { en: "Event coming up", ar: "حدث قادم", fr: "Événement à venir", zh: "即将开始的事件" },
    billDueSoon: { en: "Bill coming due", ar: "فاتورة مستحقة قريبًا", fr: "Facture à venir", zh: "账单即将到期" },
    routineTime: { en: "Time for your routine", ar: "حان وقت روتينك", fr: "C'est l'heure de ta routine", zh: "例行程序时间到了" },
  };
  return m[type]?.[locale] ?? m[type]?.en ?? type;
}

// ============================================================
// NOTIFICATION RETENTION (Prompt 08 §46)
// ============================================================

export async function cleanupOldNotifications(userId: string, daysToKeep: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const result = await db.notification.deleteMany({
    where: { userId, createdAt: { lt: cutoff }, OR: [{ readAt: { not: null } }, { dismissedAt: { not: null } }] },
  });
  return result.count;
}
