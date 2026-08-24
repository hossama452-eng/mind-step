/**
 * MindStep Personal Experiments (Prompt 11 — Personal Experiments).
 *
 * Lets the user test a change (shorter focus sessions, different reminder
 * timing, etc.) and track before/after metrics.
 *
 * Flow:
 *   1. User starts an experiment → MindStep captures a baseline snapshot
 *      (avgFocusMinutes, completionRate, interruptionsPerSession over the
 *      prior 7 days).
 *   2. User changes their behavior (MindStep doesn't enforce this — it's
 *      their own experiment).
 *   3. User ends the experiment → MindStep captures a post snapshot
 *      (same metrics, last 7 days).
 *   4. MindStep computes the delta and shows a descriptive comparison.
 *
 * IMPORTANT: experiments are USER-OWNED. The user can abandon them at any
 * time. Metrics are descriptive — never "you failed" if results don't improve.
 *
 * SERVER-ONLY BOUNDARY:
 *   This module imports `@/lib/db` (which imports `@prisma/client`) and is
 *   therefore strictly server-side. The `import "server-only"` statement
 *   below makes any Client Component that (transitively) imports this file
 *   fail at build time with a clear, actionable error — instead of silently
 *   pulling Prisma into the browser bundle and breaking the Vercel build
 *   with "Module not found: Can't resolve '.prisma/client/index-browser'".
 *
 *   Pure types/constants live in `./personal-experiments-types` so Client
 *   Components can import them without dragging Prisma along. This file
 *   re-exports them so existing server-side imports keep working.
 */

import "server-only";

import { db } from "@/lib/db";
import type { Locale } from "@/i18n/locale";

// Re-export client-safe constants/types so existing server-side imports of
// this module (e.g. `import { EXPERIMENT_TYPES, type ExperimentType } from
// "@/lib/insights/personal-experiments"`) continue to work unchanged.
export {
  EXPERIMENT_TYPES,
  type ExperimentType,
  type ExperimentMetrics,
  type MetricDelta,
  type ExperimentDelta,
} from "./personal-experiments-types";

// Pull the symbols we use internally so the rest of this file compiles.
import type {
  ExperimentType,
  ExperimentMetrics,
  ExperimentDelta,
  MetricDelta,
} from "./personal-experiments-types";

export async function computeMetricsSnapshot(
  userId: string,
  days: number = 7,
  endAt: Date = new Date(),
): Promise<ExperimentMetrics> {
  const startAt = new Date(endAt);
  startAt.setDate(startAt.getDate() - days);

  const [sessions, tasks, energyEntries] = await Promise.all([
    db.focusSession.findMany({
      where: { userId, startedAt: { gte: startAt, lt: endAt } },
      select: { id: true, status: true, actualMinutes: true, plannedMinutes: true, interruptions: true, startedAt: true },
    }),
    db.task.findMany({
      where: { userId, completedAt: { gte: startAt, lt: endAt } },
      select: { id: true, status: true, completedAt: true },
    }),
    db.energyEntry.findMany({
      where: { userId, timestamp: { gte: startAt, lt: endAt } },
      select: { id: true, level: true, timestamp: true },
    }),
  ]);

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const cancelledSessions = sessions.filter((s) => s.status === "cancelled");
  const totalFocusMinutes = completedSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  const completionRate = sessions.length > 0 ? (completedSessions.length / sessions.length) * 100 : 0;
  const avgSessionMinutes = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0) / completedSessions.length
    : 0;
  const totalInterruptions = sessions.reduce((sum, s) => sum + (s.interruptions ?? 0), 0);
  const interruptionsPerSession = completedSessions.length > 0 ? totalInterruptions / completedSessions.length : 0;
  const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "done").length;
  const avgEnergy = energyEntries.length > 0
    ? energyEntries.reduce((sum, e) => sum + e.level, 0) / energyEntries.length
    : null;

  return {
    totalFocusMinutes,
    completedSessions: completedSessions.length,
    cancelledSessions: cancelledSessions.length,
    completionRate: Math.round(completionRate),
    avgSessionMinutes: Math.round(avgSessionMinutes),
    interruptionsPerSession: Number(interruptionsPerSession.toFixed(2)),
    completedTasks,
    avgEnergy: avgEnergy ? Number(avgEnergy.toFixed(2)) : null,
    sampleDays: days,
    capturedAt: endAt.toISOString(),
  };
}

// ============================================================
// COMPUTE DELTA (baseline vs post)
// ============================================================

export function computeDelta(baseline: ExperimentMetrics, post: ExperimentMetrics): ExperimentDelta {
  const calc = (key: keyof ExperimentMetrics): MetricDelta => {
    const b = baseline[key] as number | null;
    const p = post[key] as number | null;
    if (b === null || p === null) return { baseline: b, post: p, delta: null, pctChange: null };
    const delta = p - b;
    const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : null;
    return {
      baseline: Number(b.toFixed(2)),
      post: Number(p.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      pctChange: pct !== null ? Number(pct.toFixed(1)) : null,
    };
  };
  return {
    totalFocusMinutes: calc("totalFocusMinutes"),
    completedSessions: calc("completedSessions"),
    completionRate: calc("completionRate"),
    avgSessionMinutes: calc("avgSessionMinutes"),
    interruptionsPerSession: calc("interruptionsPerSession"),
    completedTasks: calc("completedTasks"),
    avgEnergy: calc("avgEnergy"),
  };
}

// ============================================================
// LOCALIZED DELTA DESCRIPTION
// ============================================================

export function describeDelta(
  type: ExperimentType,
  delta: ExperimentDelta,
  locale: Locale,
): string {
  // Pick the metric most relevant for the experiment type.
  const metricForType: Record<ExperimentType, keyof ExperimentDelta> = {
    shorter_focus: "avgSessionMinutes",
    longer_focus: "avgSessionMinutes",
    morning_planning: "completedTasks",
    evening_planning: "completedTasks",
    smaller_steps: "completedTasks",
    different_reminder_timing: "completedTasks",
    earlier_breaks: "avgEnergy",
    later_breaks: "avgEnergy",
  };
  const metricKey = metricForType[type];
  const m = delta[metricKey];
  if (m.delta === null || m.baseline === null || m.post === null) {
    return msg("noData", locale);
  }
  if (Math.abs(m.delta) < 0.01) {
    return msg("stable", locale, { metric: metricLabel(metricKey, locale), baseline: m.baseline, post: m.post });
  }
  const improved = m.delta > 0;
  // For interruptionsPerSession, lower is better.
  const positiveDirection = metricKey === "interruptionsPerSession" ? !improved : improved;
  if (positiveDirection) {
    return msg("improved", locale, {
      metric: metricLabel(metricKey, locale),
      baseline: m.baseline,
      post: m.post,
      delta: Math.abs(m.delta),
    });
  }
  return msg("declined", locale, {
    metric: metricLabel(metricKey, locale),
    baseline: m.baseline,
    post: m.post,
    delta: Math.abs(m.delta),
  });
}

function metricLabel(key: keyof ExperimentDelta, locale: Locale): string {
  const m: Record<string, Record<Locale, string>> = {
    totalFocusMinutes: { en: "total focus minutes", ar: "إجمالي دقائق التركيز", fr: "minutes de focus totales", zh: "总专注分钟" },
    completedSessions: { en: "completed sessions", ar: "الجلسات المكتملة", fr: "sessions terminées", zh: "完成的会话" },
    completionRate: { en: "completion rate", ar: "معدل الإكمال", fr: "taux d'achèvement", zh: "完成率" },
    avgSessionMinutes: { en: "average session minutes", ar: "متوسط دقائق الجلسة", fr: "minutes moyennes par session", zh: "平均会话分钟" },
    interruptionsPerSession: { en: "interruptions per session", ar: "المقاطعات لكل جلسة", fr: "interruptions par session", zh: "每次会话中断" },
    completedTasks: { en: "completed tasks", ar: "المهام المكتملة", fr: "tâches terminées", zh: "完成的任务" },
    avgEnergy: { en: "average energy", ar: "متوسط الطاقة", fr: "énergie moyenne", zh: "平均能量" },
  };
  return m[key]?.[locale] ?? m[key]?.en ?? key;
}

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    noData: {
      en: "Not enough data to compare yet — try the experiment for a few more days.",
      ar: "لا توجد بيانات كافية للمقارنة بعد — جرّب التجربة لبضعة أيام أخرى.",
      fr: "Pas assez de données pour comparer pour l'instant — essaie l'expérience quelques jours de plus.",
      zh: "暂无足够数据可比较——再多试几天。",
    },
    stable: {
      en: "Your {metric} stayed about the same ({baseline} → {post}). This is descriptive — stability is fine.",
      ar: "الـ{metric} الخاص بك بقي تقريبًا نفسه ({baseline} → {post}). هذا وصفي — الاستقرار جيد.",
      fr: "Ton {metric} est resté à peu près le même ({baseline} → {post}). C'est descriptif — la stabilité est correcte.",
      zh: "你的{metric}大致保持不变（{baseline} → {post}）。这是描述——稳定就好。",
    },
    improved: {
      en: "Your {metric} went from {baseline} to {post} (+{delta}). Your data shows the experiment direction may have helped — keep observing.",
      ar: "الـ{metric} الخاص بك ارتفع من {baseline} إلى {post} (+{delta}). بياناتك تظهر أن اتجاه التجربة قد ساعد — استمر بالملاحظة.",
      fr: "Ton {metric} est passé de {baseline} à {post} (+{delta}). Tes données montrent que l'expérience a peut-être aidé — continue d'observer.",
      zh: "你的{metric}从 {baseline} 变为 {post}（+{delta}）。数据显示实验方向可能有效——继续观察。",
    },
    declined: {
      en: "Your {metric} went from {baseline} to {post} (-{delta}). This is descriptive — small samples are noisy. The experiment didn't fit, and that's useful to know.",
      ar: "الـ{metric} الخاص بك انخفض من {baseline} إلى {post} (-{delta}). هذا وصفي — العينات الصغيرة مشوشة. التجربة لم تناسب، وهذا مفيد لمعرفته.",
      fr: "Ton {metric} est passé de {baseline} à {post} (-{delta}). C'est descriptif — les petits échantillons sont bruités. L'expérience ne te convenait pas, et c'est utile à savoir.",
      zh: "你的{metric}从 {baseline} 变为 {post}（-{delta}）。这是描述——小样本有噪音。实验不适合，知道这一点很有用。",
    },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ""));
}
