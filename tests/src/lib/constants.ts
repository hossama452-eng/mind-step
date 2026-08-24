/**
 * MindStep application constants.
 */

export const APP_NAME = "MindStep";
export const APP_TAGLINE = "One Step. One Focus. One Day.";

/** Default focus session length in minutes (Pomodoro). */
export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_SHORT_BREAK_MINUTES = 5;
export const DEFAULT_LONG_BREAK_MINUTES = 15;

/** Focus session presets shown on the Focus screen. */
export const FOCUS_PRESETS = [
  { key: "focus15", minutes: 15, labelKey: "focus.preset.focus15" },
  { key: "focus25", minutes: 25, labelKey: "focus.preset.focus25" },
  { key: "focus45", minutes: 45, labelKey: "focus.preset.focus45" },
  { key: "focus90", minutes: 90, labelKey: "focus.preset.focus90" },
] as const;

/** Maximum lengths — enforced by both zod schemas and DB constraints. */
export const LIMITS = {
  taskTitle: 200,
  taskNotes: 2000,
  brainDump: 1000,
  habitName: 120,
  aiMessage: 4000,
  routineName: 120,
  projectTitle: 120,
} as const;

/** Default pagination for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Default brand palette — calm sage / warm sand / clay accents. */
export const BRAND_COLORS = {
  sage: "#7c9885",
  sand: "#e8d9b5",
  clay: "#c47a52",
  stone: "#6b6960",
  cream: "#faf6ef",
  ink: "#2b2a26",
} as const;

/** ADHD-support "Minimum Viable Day" defaults — three slots. */
export const MINIMUM_VIABLE_DAY_SLOTS = 3;

/** Audit log action codes — extendable, never reuse values. */
export const AUDIT_ACTIONS = {
  USER_SIGNED_IN: "user.signed_in",
  USER_SIGNED_OUT: "user.signed_out",
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  FOCUS_SESSION_STARTED: "focus_session.started",
  FOCUS_SESSION_COMPLETED: "focus_session.completed",
  AI_CONVERSATION_CREATED: "ai_conversation.created",
  AI_MESSAGE_SENT: "ai_message.sent",
  PI_PAYMENT_INITIATED: "pi_payment.initiated",
  PI_PAYMENT_VERIFIED: "pi_payment.verified",
  PREFERENCES_UPDATED: "preferences.updated",
} as const;

/** Feature flags for the foundation phase. */
export const FEATURES = {
  auth: false,             // Phase 2 — NextAuth credentials + email magic-link
  aiCoach: true,           // available immediately via z-ai-web-dev-sdk
  piPayments: false,       // Phase 2 — sandbox integration
  familyMode: false,       // Phase 3
  professionalMode: false, // Phase 3
} as const;

/** Medical disclaimer — must appear wherever AI Coach surfaces. */
export const MEDICAL_DISCLAIMER =
  "MindStep is not a medical or diagnostic tool. It cannot diagnose ADHD, prescribe medication, recommend dosage changes, or replace professional care.";
