/**
 * MindStep Personal Experiments — Client-Safe Types & Constants.
 *
 * This module is INTENTIONALLY free of any `@/lib/db`, `@prisma/client`,
 * or `server-only` imports. It contains only pure constants, types and
 * pure functions that are safe to import from Client Components.
 *
 * Server-only modules (e.g. `./personal-experiments`) re-export these
 * symbols so existing server-side imports keep working unchanged.
 *
 * Why this file exists:
 *   Next.js bundlers cannot reliably tree-shake transitive server-only
 *   imports out of a Client Component's bundle. If a `"use client"` file
 *   imports even a single constant from a module that transitively
 *   imports `@prisma/client`, the whole Prisma client gets pulled into
 *   the browser bundle and the Vercel build fails with:
 *     "Module not found: Can't resolve '.prisma/client/index-browser'"
 *   Keeping the client-safe surface in its own module prevents that.
 */

// ============================================================
// ALLOWED EXPERIMENT TYPES
// ============================================================

export const EXPERIMENT_TYPES = [
  "shorter_focus",
  "longer_focus",
  "morning_planning",
  "evening_planning",
  "smaller_steps",
  "different_reminder_timing",
  "earlier_breaks",
  "later_breaks",
] as const;

export type ExperimentType = (typeof EXPERIMENT_TYPES)[number];

// ============================================================
// METRICS SNAPSHOT SHAPE
// ============================================================

export interface ExperimentMetrics {
  totalFocusMinutes: number;
  completedSessions: number;
  cancelledSessions: number;
  completionRate: number; // 0-100
  avgSessionMinutes: number;
  interruptionsPerSession: number;
  completedTasks: number;
  avgEnergy: number | null;
  sampleDays: number;
  capturedAt: string; // ISO
}

// ============================================================
// DELTA SHAPE
// ============================================================

export interface MetricDelta {
  baseline: number | null;
  post: number | null;
  delta: number | null; // post - baseline
  pctChange: number | null; // percentage change (null if baseline is 0)
}

export interface ExperimentDelta {
  totalFocusMinutes: MetricDelta;
  completedSessions: MetricDelta;
  completionRate: MetricDelta;
  avgSessionMinutes: MetricDelta;
  interruptionsPerSession: MetricDelta;
  completedTasks: MetricDelta;
  avgEnergy: MetricDelta;
}
