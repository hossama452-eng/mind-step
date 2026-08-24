import { z } from "zod";

/**
 * MindStep validation schemas.
 * These schemas are used both for client-side form validation
 * and server-side input validation. Never trust client input —
 * always re-validate on the server.
 */

// ============================================================
// CORE
// ============================================================

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email")
  .max(254, "Email too long");

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password too long");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name required")
  .max(60, "Display name too long");

export const localeSchema = z.enum(["en", "ar", "fr", "zh"]);
export const themeSchema = z.enum(["light", "dark", "system"]);
export const textScaleSchema = z.enum(["small", "normal", "large", "xlarge"]);

// ============================================================
// PRODUCTIVITY
// ============================================================

export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskEnergySchema = z.enum(["low", "medium", "high"]);
// New lifecycle per Prompt 04 §2: inbox → planned → in_progress → completed → archived.
// Legacy values `todo`, `done`, `snoozed` are accepted on input for backwards compatibility
// and normalized to the new lifecycle in the API layer.
export const taskStatusSchema = z.enum([
  "inbox",
  "planned",
  "in_progress",
  "completed",
  "archived",
  // Legacy values (mapped on read):
  "todo",
  "done",
  "snoozed",
]);

export const projectStatusSchema = z.enum(["active", "completed", "archived"]);
export const milestoneStatusSchema = z.enum(["active", "completed", "archived"]);
export const brainDumpStatusSchema = z.enum(["inbox", "converted", "archived"]);
export const brainDumpCategorySchema = z.enum([
  "task",
  "idea",
  "reminder",
  "uncategorized",
]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: taskStatusSchema.default("inbox"),
  priority: taskPrioritySchema.default("normal"),
  energy: taskEnergySchema.default("medium"),
  estimateMinutes: z.number().int().min(1).max(480).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/i, "validation.invalidTime")
    .optional()
    .nullable(),
  projectId: z.string().cuid().optional().nullable(),
  milestoneId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().cuid(),
  status: taskStatusSchema.optional(),
  actualMinutes: z.number().int().min(0).max(480).optional().nullable(),
});

export const taskSearchSchema = z.object({
  q: z.string().trim().max(200),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  projectId: z.string().cuid().optional(),
  milestoneId: z.string().cuid().optional(),
  overdue: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const createSubtaskSchema = z.object({
  taskId: z.string().cuid(),
  title: z.string().trim().min(1).max(200),
});

export const updateSubtaskSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderSubtasksSchema = z.object({
  taskId: z.string().cuid(),
  orderedIds: z.array(z.string().cuid()).min(1),
});

export const createBrainDumpSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  category: brainDumpCategorySchema.default("uncategorized"),
});

export const convertBrainDumpSchema = z.object({
  id: z.string().cuid(),
  target: z.enum(["task", "reminder"]),
  // For task conversion:
  title: z.string().trim().min(1).max(200).optional(),
  priority: taskPrioritySchema.optional(),
  projectId: z.string().cuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  // For reminder conversion:
  remindAt: z.string().datetime().optional().nullable(),
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c9885"),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().cuid(),
  status: projectStatusSchema.optional(),
});

export const createMilestoneSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial().extend({
  id: z.string().cuid(),
  status: milestoneStatusSchema.optional(),
});

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  remindAt: z.string().datetime(),
  taskId: z.string().cuid().optional().nullable(),
});

export const updateReminderSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(200).optional(),
  remindAt: z.string().datetime().optional(),
  completed: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

export const smartBreakdownSuggestSchema = z.object({
  taskTitle: z.string().trim().min(1).max(500),
  taskDescription: z.string().max(2000).optional().nullable(),
  // Optional locale hint for the deterministic algorithm to pick the right language.
  locale: z.enum(["en", "ar", "fr", "zh"]).default("en"),
});

export const smartBreakdownApproveSchema = z.object({
  taskId: z.string().cuid(),
  // The user-edited list of subtask titles to persist.
  subtasks: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
});

// ============================================================
// FOCUS
// ============================================================

export const focusPresetSchema = z.enum(["focus5", "focus10", "focus15", "focus25", "focus30", "focus45", "focus60", "focus90"]);
export const focusSessionStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);

export const startFocusSessionSchema = z.object({
  taskId: z.string().cuid().optional().nullable(),
  subtaskId: z.string().cuid().optional().nullable(),
  plannedMinutes: z.number().int().min(1).max(480),
  taskTitle: z.string().trim().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const endFocusSessionSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

export const createDistractionSchema = z.object({
  focusSessionId: z.string().cuid().optional().nullable(),
  content: z.string().trim().min(1).max(500),
  category: z.enum(["thought", "interruption", "urge"]).default("thought"),
});

// ============================================================
// PLANNER
// ============================================================

export const timeBlockTypeSchema = z.enum(["focus", "break", "buffer", "personal", "blocked"]);
export const timeBlockStatusSchema = z.enum(["scheduled", "in_progress", "completed", "cancelled", "missed"]);

export const createTimeBlockSchema = z.object({
  taskId: z.string().cuid().optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  plannedMinutes: z.number().int().min(1).max(480),
  type: timeBlockTypeSchema.default("focus"),
});

export const updateTimeBlockSchema = z.object({
  id: z.string().cuid(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  status: timeBlockStatusSchema.optional(),
  type: timeBlockTypeSchema.optional(),
});

export const moveTimeBlockSchema = z.object({
  id: z.string().cuid(),
  newStartAt: z.string().datetime(),
});

export const generatePlanSchema = z.object({
  date: z.string().datetime().optional(),
  // Optional: limit to specific task IDs (e.g., for Minimum Viable Day)
  taskIds: z.array(z.string().cuid()).optional(),
  // Optional: override buffer percentage
  bufferPercentage: z.number().min(0).max(0.5).optional(),
});

export const approvePlanSchema = z.object({
  blocks: z.array(z.object({
    taskId: z.string().cuid().optional().nullable(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    plannedMinutes: z.number().int().min(1).max(480),
    type: timeBlockTypeSchema.default("focus"),
  })).min(1),
  // Idempotency key — the client sends a hash of the generated plan
  // to prevent duplicate approvals from creating duplicate blocks.
  idempotencyKey: z.string().min(1).max(200),
});

export const planningPreferencesSchema = z.object({
  bufferPercentage: z.number().min(0).max(0.5).optional(),
  maxDailyFocusMinutes: z.number().int().min(30).max(600).optional(),
  preferredFocusDuration: z.number().int().min(5).max(90).optional(),
  includeBreaks: z.boolean().optional(),
  energyPreference: z.enum(["low", "medium", "high"]).optional(),
  timezone: z.string().max(100).optional(),
  dailyStartMinutes: z.number().int().min(0).max(1439).optional(),
  dailyEndMinutes: z.number().int().min(0).max(1439).optional(),
});

export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>;
export type UpdateTimeBlockInput = z.infer<typeof updateTimeBlockSchema>;
export type MoveTimeBlockInput = z.infer<typeof moveTimeBlockSchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
export type ApprovePlanInput = z.infer<typeof approvePlanSchema>;
export type PlanningPreferencesInput = z.infer<typeof planningPreferencesSchema>;

// ============================================================
// LIFE
// ============================================================

export const habitFrequencySchema = z.enum(["daily", "weekly", "custom"]);

export const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cue: z.string().max(300).optional().nullable(),
  routine: z.string().max(300).optional().nullable(),
  reward: z.string().max(300).optional().nullable(),
  frequency: habitFrequencySchema.default("daily"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c9885"),
});

export const createHabitEntrySchema = z.object({
  habitId: z.string().cuid(),
  date: z.string().datetime(),
  completed: z.boolean().default(true),
  note: z.string().max(500).optional().nullable(),
});

export const moodSchema = z.enum([
  "calm",
  "focused",
  "overwhelmed",
  "anxious",
  "happy",
  "tired",
  "irritable",
]);

export const createMoodEntrySchema = z.object({
  mood: moodSchema,
  intensity: z.number().int().min(1).max(5).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const createEnergyEntrySchema = z.object({
  level: z.number().int().min(1).max(5),
  note: z.string().max(500).optional().nullable(),
});

export const createSleepEntrySchema = z.object({
  date: z.string().datetime(),
  bedTime: z.string().datetime().optional().nullable(),
  wakeTime: z.string().datetime().optional().nullable(),
  durationMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  quality: z.number().int().min(1).max(5).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

// ============================================================
// AI DOMAIN
// ============================================================

export const aiContextSchema = z.enum([
  "general",
  "task_breakdown",
  "day_rebuilder",
  "decision",
  "overwhelm",
]);

export const createAIConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  context: aiContextSchema.default("general"),
});

export const createAIMessageSchema = z.object({
  conversationId: z.string().cuid(),
  content: z.string().trim().min(1).max(4000),
});

// ============================================================
// PI / PAYMENTS
// ============================================================

export const piPaymentStatusSchema = z.enum([
  "pending",
  "approved",
  "completed",
  "cancelled",
  "failed",
]);

export const verifyPiPaymentSchema = z.object({
  paymentId: z.string().min(1).max(200),
  piPaymentId: z.string().min(1).max(200),
  txid: z.string().max(200).optional().nullable(),
  amount: z.number().positive(),
  product: z.string().min(1).max(200),
});

// ============================================================
// Type exports
// ============================================================

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskSearchInput = z.infer<typeof taskSearchSchema>;
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
export type ReorderSubtasksInput = z.infer<typeof reorderSubtasksSchema>;
export type CreateBrainDumpInput = z.infer<typeof createBrainDumpSchema>;
export type ConvertBrainDumpInput = z.infer<typeof convertBrainDumpSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type SmartBreakdownSuggestInput = z.infer<typeof smartBreakdownSuggestSchema>;
export type SmartBreakdownApproveInput = z.infer<typeof smartBreakdownApproveSchema>;
export type StartFocusSessionInput = z.infer<typeof startFocusSessionSchema>;
export type CreateDistractionInput = z.infer<typeof createDistractionSchema>;
export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type CreateHabitEntryInput = z.infer<typeof createHabitEntrySchema>;
export type CreateMoodEntryInput = z.infer<typeof createMoodEntrySchema>;
export type CreateEnergyEntryInput = z.infer<typeof createEnergyEntrySchema>;
export type CreateSleepEntryInput = z.infer<typeof createSleepEntrySchema>;
export type CreateAIConversationInput = z.infer<typeof createAIConversationSchema>;
export type CreateAIMessageInput = z.infer<typeof createAIMessageSchema>;
export type VerifyPiPaymentInput = z.infer<typeof verifyPiPaymentSchema>;
