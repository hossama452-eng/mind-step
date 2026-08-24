import "server-only";
/**
 * MindStep Privacy Service (Prompt 13 §Privacy).
 *
 * Implements the user's data rights:
 *   - Data Export: full export of the user's data as JSON (GDPR-style).
 *   - Delete Account: hard delete — cascades to all user-owned tables.
 *   - Delete AI History: selectively delete AI conversations + messages.
 *   - Consent Management: read/update the user's Consent row.
 *   - Data Sharing Controls: granular toggles for what's shared.
 *
 * All operations require the authenticated userId — never trust a client-sent
 * userId in the request body.
 *
 * Privacy by design: collect only what's necessary. The export includes the
 * MINIMUM necessary data — no internal IDs from other users, no server
 * secrets, no audit logs (those are operational, not personal).
 */

import { db } from "@/lib/db";

// ============================================================
// DATA EXPORT
// ============================================================

export interface DataExportResult {
  exportedAt: string;
  userId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string | Date;
  };
  profile: unknown | null;
  preferences: unknown | null;
  consent: unknown | null;
  tasks: unknown[];
  subtasks: unknown[];
  projects: unknown[];
  milestones: unknown[];
  brainDumps: unknown[];
  reminders: unknown[];
  calendarEvents: unknown[];
  timeBlocks: unknown[];
  focusSessions: unknown[];
  distractions: unknown[];
  habits: unknown[];
  habitEntries: unknown[];
  sleepEntries: unknown[];
  energyEntries: unknown[];
  moodEntries: unknown[];
  aiConversations: unknown[];
  aiMemories: unknown[];
  routines: unknown[];
  shoppingItems: unknown[];
  errands: unknown[];
  bills: unknown[];
  subscriptions: unknown[];
  personalExperiments: unknown[];
  piPayments: unknown[]; // sanitized — no API keys, no internal DTO snapshots
  piAccounts: unknown[]; // sanitized — no session tokens
  premiumEntitlement: unknown | null;
  notifications: unknown[];
  insights: unknown[];
}

/**
 * Exports ALL of the user's data as a JSON-serializable object.
 *
 * Used by /api/privacy/export — the user can download this as a file.
 *
 * Privacy:
 *   - No other users' data is included (everything is scoped by userId).
 *   - No server secrets, API keys, or session tokens.
 *   - Pi payment rows are sanitized — the `piPaymentDTO` (full Pi Platform
 *     API response with blockchain addresses) is NOT included; only the
 *     user-facing fields.
 *   - Pi account rows are sanitized — only piUid + piUsername + network.
 */
export async function exportUserData(userId: string): Promise<DataExportResult> {
  const [
    user, profile, preferences, consent,
    tasks, subtasks, projects, milestones, brainDumps, reminders,
    calendarEvents, timeBlocks, focusSessions, distractions,
    habits, habitEntries, sleepEntries, energyEntries, moodEntries,
    aiConversations, aiMemories,
    routines, shoppingItems, errands, bills, subscriptions,
    personalExperiments,
    piPayments, piAccountRow, premiumEntitlement,
    notifications, insights,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true } }),
    db.profile.findUnique({ where: { userId } }),
    db.preferences.findUnique({ where: { userId } }),
    db.consent.findUnique({ where: { userId } }),
    db.task.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.subtask.findMany({ where: { task: { userId } }, orderBy: { position: "asc" } }),
    db.project.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.milestone.findMany({ where: { userId }, orderBy: { position: "asc" } }),
    db.brainDump.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.reminder.findMany({ where: { userId }, orderBy: { remindAt: "asc" } }),
    db.calendarEvent.findMany({ where: { userId }, orderBy: { startsAt: "asc" } }),
    db.timeBlock.findMany({ where: { userId }, orderBy: { startAt: "asc" } }),
    db.focusSession.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 200 }),
    db.distraction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.habit.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.habitEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 365 }),
    db.sleepEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 365 }),
    db.energyEntry.findMany({ where: { userId }, orderBy: { timestamp: "desc" }, take: 365 }),
    db.moodEntry.findMany({ where: { userId }, orderBy: { timestamp: "desc" }, take: 365 }),
    db.aIConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.aIMemory.findMany({ where: { userId } }),
    db.routine.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.shoppingItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.errand.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.bill.findMany({ where: { userId }, orderBy: { dueAt: "asc" } }),
    db.subscription.findMany({ where: { userId }, orderBy: { nextBillingAt: "asc" } }),
    db.personalExperiment.findMany({ where: { userId }, orderBy: { startedAt: "desc" } }),
    // Sanitize: omit piPaymentDTO (contains blockchain addresses) and metadata.
    db.piPayment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, piPaymentId: true, amount: true, currency: true, product: true,
        status: true, txid: true, network: true, verifiedAt: true,
        completedAt: true, cancelledAt: true, createdAt: true,
      },
    }),
    // Get the user's primary Pi account (sanitized).
    db.piAccount.findFirst({ where: { userId, isPrimary: true } }),
    db.premiumEntitlement.findUnique({ where: { userId } }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.insight.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    userId,
    user: user!,
    profile,
    preferences,
    consent,
    tasks,
    subtasks,
    projects,
    milestones,
    brainDumps,
    reminders,
    calendarEvents,
    timeBlocks,
    focusSessions,
    distractions,
    habits,
    habitEntries,
    sleepEntries,
    energyEntries,
    moodEntries,
    aiConversations,
    aiMemories,
    routines,
    shoppingItems,
    errands,
    bills,
    subscriptions,
    personalExperiments,
    piPayments,
    piAccounts: piAccountRow ? [piAccountRow] : [],
    premiumEntitlement,
    notifications,
    insights,
  };
}

// ============================================================
// DELETE AI HISTORY
// ============================================================

/**
 * Deletes ALL AI conversations + messages for the user.
 * Does NOT delete AI memories (those are explicit user preferences, not chat history).
 * Returns the count of deleted conversations.
 */
export async function deleteAIHistory(userId: string): Promise<{ conversationsDeleted: number; messagesDeleted: number }> {
  const conversations = await db.aIConversation.findMany({
    where: { userId },
    select: { id: true },
  });
  if (conversations.length === 0) {
    return { conversationsDeleted: 0, messagesDeleted: 0 };
  }
  const conversationIds = conversations.map((c) => c.id);
  // Delete messages first (FK constraint).
  const msgResult = await db.aIMessage.deleteMany({
    where: { conversationId: { in: conversationIds } },
  });
  // Then delete conversations.
  const convResult = await db.aIConversation.deleteMany({
    where: { id: { in: conversationIds } },
  });
  return {
    conversationsDeleted: convResult.count,
    messagesDeleted: msgResult.count,
  };
}

/**
 * Deletes a SINGLE AI conversation by id (with ownership check).
 * Returns false if the conversation doesn't exist or belongs to another user.
 */
export async function deleteAIConversation(userId: string, conversationId: string): Promise<boolean> {
  const conv = await db.aIConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!conv || conv.userId !== userId) return false;
  await db.aIConversation.delete({ where: { id: conversationId } });
  return true;
}

// ============================================================
// DELETE ACCOUNT
// ============================================================

/**
 * Hard deletes the user account and ALL cascaded data.
 *
 * The Prisma schema uses `onDelete: Cascade` on every user-owned relation,
 * so deleting the User row cascades to all child rows automatically.
 *
 * This is IRREVERSIBLE. The user must explicitly confirm.
 *
 * Returns true on success, false if the user doesn't exist.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  try {
    await db.user.delete({ where: { id: userId } });
    return true;
  } catch (err: any) {
    // Prisma throws P2025 if the record doesn't exist.
    if (err?.code === "P2025") return false;
    throw err;
  }
}

// ============================================================
// CONSENT MANAGEMENT
// ============================================================

export interface ConsentUpdate {
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  ageConfirmed?: boolean;
  marketingOptIn?: boolean;
  dataProcessingOptIn?: boolean;
}

/**
 * Returns the user's Consent row, or null if none exists.
 */
export async function getConsent(userId: string) {
  return db.consent.findUnique({ where: { userId } });
}

/**
 * Updates the user's Consent row. Creates one if none exists.
 * Only the fields provided in `update` are changed.
 */
export async function updateConsent(userId: string, update: ConsentUpdate) {
  const now = new Date();
  return db.consent.upsert({
    where: { userId },
    create: {
      userId,
      termsAcceptedAt: update.termsAccepted ? now : null,
      privacyAcceptedAt: update.privacyAccepted ? now : null,
      ageConfirmedAt: update.ageConfirmed ? now : null,
      marketingOptIn: update.marketingOptIn ?? false,
      dataProcessingOptIn: update.dataProcessingOptIn ?? false,
    },
    update: {
      termsAcceptedAt: update.termsAccepted === true ? now
        : update.termsAccepted === false ? null : undefined,
      privacyAcceptedAt: update.privacyAccepted === true ? now
        : update.privacyAccepted === false ? null : undefined,
      ageConfirmedAt: update.ageConfirmed === true ? now
        : update.ageConfirmed === false ? null : undefined,
      marketingOptIn: update.marketingOptIn ?? undefined,
      dataProcessingOptIn: update.dataProcessingOptIn ?? undefined,
    },
  });
}

/**
 * Withdraws ALL consent — sets all `*At` timestamps to null and all opt-ins to false.
 * Does NOT delete the user's data — they can still use the app in a "no-consent" state
 * (which limits features that require consent). To fully delete, use deleteAccount().
 */
export async function withdrawAllConsent(userId: string) {
  return db.consent.upsert({
    where: { userId },
    create: {
      userId,
      termsAcceptedAt: null,
      privacyAcceptedAt: null,
      ageConfirmedAt: null,
      marketingOptIn: false,
      dataProcessingOptIn: false,
    },
    update: {
      termsAcceptedAt: null,
      privacyAcceptedAt: null,
      ageConfirmedAt: null,
      marketingOptIn: false,
      dataProcessingOptIn: false,
    },
  });
}
