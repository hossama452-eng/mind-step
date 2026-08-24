/**
 * MindStep AI Context Service (Prompt 07 §6, §7, §8, §9, §10).
 *
 * Gathers the MINIMUM context required to answer the user's request.
 * Data minimization: never loads the entire database.
 * Ownership: always uses authenticated user identity (never trusts client userId).
 * Prompt injection: all user content is treated as untrusted text data.
 *
 * The context is structured as a plain-text summary that is sent to the
 * AI provider as a system message. It contains only the user's own data.
 */

import { db } from "@/lib/db";
import type { Locale } from "@/i18n/locale";

export interface AIContext {
  /** The plain-text summary sent to the AI provider. */
  summary: string;
  /** Whether the context was successfully gathered. */
  hasData: boolean;
}

/**
 * Gather context for the AI coach chat.
 *
 * What we load (minimum necessary — Prompt 07 §7):
 *   1. Active focus session (if any) — for "continue focusing" suggestions.
 *   2. Today's time blocks — for "what should I do next" suggestions.
 *   3. Eligible tasks (not completed/archived, top 10 by priority/due date).
 *   4. Recent brain dump entries (top 3, inbox only).
 *   5. Today's focus history (completed sessions, count + total minutes).
 *   6. Overdue tasks count.
 *
 * What we DON'T load:
 *   - Other users' data (Prompt 07 §8, §10).
 *   - Internal secrets, API keys, system prompts (Prompt 07 §10).
 *   - Full task database — only top 10 eligible tasks.
 *   - All brain dumps — only top 3 inbox items.
 *   - All focus history — only today's completed sessions.
 */
export async function gatherAIContext(userId: string, locale: Locale): Promise<AIContext> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Parallel queries — each scoped by userId.
  const [activeFocus, todayBlocks, eligibleTasks, brainDumps, todayFocusSessions, overdueCount] =
    await Promise.all([
      // 1. Active focus session
      db.focusSession.findFirst({
        where: { userId, status: { in: ["active", "paused"] } },
        select: { id: true, taskTitle: true, status: true, startedAt: true, plannedMinutes: true },
      }),

      // 2. Today's time blocks
      db.timeBlock.findMany({
        where: { userId, startAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["cancelled", "missed"] } },
        orderBy: { startAt: "asc" },
        take: 5,
        select: { id: true, startAt: true, endAt: true, type: true, plannedMinutes: true, task: { select: { title: true } } },
      }),

      // 3. Eligible tasks (top 10)
      db.task.findMany({
        where: { userId, status: { notIn: ["completed", "archived", "done"] } },
        orderBy: [{ priority: "asc" }, { dueAt: "asc" }],
        take: 10,
        select: { id: true, title: true, priority: true, estimateMinutes: true, dueAt: true, status: true, projectId: true },
      }),

      // 4. Recent brain dump entries (top 3 inbox)
      db.brainDump.findMany({
        where: { userId, status: "inbox" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, content: true, createdAt: true },
      }),

      // 5. Today's completed focus sessions
      db.focusSession.findMany({
        where: { userId, status: "completed", endedAt: { gte: dayStart } },
        select: { id: true, actualMinutes: true, plannedMinutes: true },
      }),

      // 6. Overdue tasks count
      db.task.count({
        where: { userId, dueAt: { lt: now }, status: { notIn: ["completed", "archived", "done"] } },
      }),
    ]);

  // Build the plain-text context summary.
  // ALL user content is treated as UNTRUSTED TEXT DATA (Prompt 07 §9).
  // We escape nothing — the AI system prompt explicitly instructs the LLM
  // to treat all context as untrusted text, never as instructions.
  const parts: string[] = [];

  // Active focus session
  if (activeFocus) {
    parts.push(`Active focus session: "${activeFocus.taskTitle ?? "Untitled"}" (${activeFocus.status}, ${activeFocus.plannedMinutes} min planned).`);
  }

  // Today's time blocks
  if (todayBlocks.length > 0) {
    const blockSummary = todayBlocks.map((b) =>
      `${b.startAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ${b.type} ${b.plannedMinutes}min "${b.task?.title ?? ""}"`
    ).join("; ");
    parts.push(`Today's schedule: ${blockSummary}`);
  }

  // Eligible tasks
  if (eligibleTasks.length > 0) {
    const taskSummary = eligibleTasks.map((t) =>
      `"${t.title}" (${t.priority}, ${t.estimateMinutes ?? "?"}min, due: ${t.dueAt ? t.dueAt.toISOString().slice(0, 10) : "none"})`
    ).join("; ");
    parts.push(`Eligible tasks: ${taskSummary}`);
  }

  // Recent brain dumps
  if (brainDumps.length > 0) {
    const bdSummary = brainDumps.map((b) => `"${b.content.slice(0, 50)}"`).join("; ");
    parts.push(`Recent brain dumps: ${bdSummary}`);
  }

  // Today's focus history
  if (todayFocusSessions.length > 0) {
    const totalMin = todayFocusSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
    parts.push(`Today's focus: ${todayFocusSessions.length} sessions, ${totalMin} minutes total.`);
  }

  // Overdue count
  if (overdueCount > 0) {
    parts.push(`Overdue tasks: ${overdueCount}`);
  }

  const summary = parts.length > 0 ? parts.join("\n") : "No active tasks or sessions.";
  return { summary, hasData: parts.length > 0 };
}

/**
 * Allow-listed memory keys (Prompt 07 §34, §35).
 *
 * Only these keys can be stored as AI memory. Sensitive information
 * (medical diagnoses, medications, health records, passwords, etc.)
 * is NEVER stored automatically.
 */
export const AI_MEMORY_ALLOW_LIST = [
  "preferred_focus_duration",
  "preferred_planning_window",
  "preferred_breakdown_style",
  "preferred_task_language",
  "preferred_session_length",
  "preferred_start_time",
] as const;

export type AIMemoryKey = (typeof AI_MEMORY_ALLOW_LIST)[number];

/**
 * Sensitive patterns that should NEVER be stored as AI memory (Prompt 07 §35).
 */
const SENSITIVE_PATTERNS = [
  "diagnosis", "diagnosed", "medication", "medicine", "dose", "dosage",
  "prescription", "password", "secret", "token", "api key", "credential",
  "ssn", "social security", "credit card", "bank account",
  "health record", "medical record", "therapy", "therapist",
  "adderall", "ritalin", "vyvanse", "concerta", "stimulant",
];

export function isSensitiveContent(value: string): boolean {
  const lower = value.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

export function isAllowedMemoryKey(key: string): boolean {
  return (AI_MEMORY_ALLOW_LIST as readonly string[]).includes(key);
}
