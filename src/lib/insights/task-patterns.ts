/**
 * MindStep Insights Engine — Task Patterns (Prompt 11 — Task Patterns).
 *
 * Identifies:
 *   - Frequently postponed tasks (tasks that have been snoozed/rescheduled many times)
 *   - Typical task duration (based on estimates of completed tasks)
 *   - High-friction categories (projects/tags with low completion rate)
 *   - Completion trends (week-over-week)
 *
 * Descriptive language only — never "you're bad at X", always
 * "your data shows X pattern".
 */

import type { Locale } from "@/i18n/locale";

export interface TaskPatternData {
  id: string;
  status: string; // inbox | planned | in_progress | completed | archived
  priority: string;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  projectId: string | null;
  tags: string; // JSON array string
  snoozedCount: number; // derived — counts of reminder snoozes for this task
  title: string;
}

export interface TaskPatternInsight {
  id: string;
  kind: "pattern" | "observation" | "warning" | "celebration" | "suggestion";
  category: "task";
  title: string;
  body: string;
  data?: {
    chartType?: "bar";
    chartData?: Array<{ label: string; value: number }>;
    chartCaption?: string;
    metrics?: Record<string, number | string>;
    // For high-friction list — items to render as a list, not chart
    items?: Array<{ label: string; value: number }>;
  };
}

const MIN_TASKS_FOR_PATTERN = 5;
const MIN_POSTPONED_THRESHOLD = 2; // Tasks snoozed >=2 times are "frequently postponed"

// ============================================================
// TASK PATTERNS
// ============================================================

export function generateTaskPatternInsights(
  tasks: TaskPatternData[],
  locale: Locale,
): TaskPatternInsight[] {
  const insights: TaskPatternInsight[] = [];

  if (tasks.length === 0) {
    insights.push({
      id: "task-empty",
      kind: "suggestion",
      category: "task",
      title: msg("emptyTitle", locale),
      body: msg("emptyBody", locale),
    });
    return insights;
  }

  const completed = tasks.filter((t) => t.status === "completed" || t.status === "done");

  // --- 1. Frequently postponed tasks ---
  const postponed = tasks
    .filter((t) => t.snoozedCount >= MIN_POSTPONED_THRESHOLD)
    .map((t) => ({ id: t.id, title: t.title, snoozedCount: t.snoozedCount, status: t.status }))
    .sort((a, b) => b.snoozedCount - a.snoozedCount)
    .slice(0, 5);

  if (postponed.length > 0) {
    const totalPostponedCount = postponed.reduce((sum, t) => sum + t.snoozedCount, 0);
    insights.push({
      id: "task-frequently-postponed",
      kind: "observation",
      category: "task",
      title: msg("postponedTitle", locale),
      body: msg("postponedBody", locale, { count: postponed.length, totalPostpones: totalPostponedCount }),
      data: {
        items: postponed.map((p) => ({ label: p.title, value: p.snoozedCount })),
        chartType: "bar",
        chartData: postponed.map((p) => ({ label: p.title.slice(0, 20) + (p.title.length > 20 ? "…" : ""), value: p.snoozedCount })),
        chartCaption: msg("postponedCaption", locale),
        metrics: { postponedTaskCount: postponed.length, totalPostpones: totalPostponedCount },
      },
    });
  }

  // --- 2. Typical task duration ---
  if (completed.length >= MIN_TASKS_FOR_PATTERN) {
    const withEstimates = completed.filter((t) => t.estimateMinutes);
    if (withEstimates.length > 0) {
      const avgEstimate = withEstimates.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0) / withEstimates.length;
      const sorted = withEstimates.map((t) => t.estimateMinutes ?? 0).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      insights.push({
        id: "task-typical-duration",
        kind: "observation",
        category: "task",
        title: msg("typicalDurationTitle", locale),
        body: msg("typicalDurationBody", locale, {
          avg: Math.round(avgEstimate),
          median,
          count: withEstimates.length,
        }),
        data: {
          metrics: {
            avgEstimateMinutes: Math.round(avgEstimate),
            medianEstimateMinutes: median,
            sampleSize: withEstimates.length,
          },
        },
      });
    }
  }

  // --- 3. High-friction categories (projects with low completion rate) ---
  if (tasks.length >= MIN_TASKS_FOR_PATTERN) {
    // Group by projectId (null = "no project").
    const byProject: Record<string, { total: number; completed: number }> = {};
    for (const t of tasks) {
      const key = t.projectId ?? "no-project";
      byProject[key] ??= { total: 0, completed: 0 };
      byProject[key].total++;
      if (t.status === "completed" || t.status === "done") byProject[key].completed++;
    }
    // Only consider projects with >=3 tasks (statistical significance).
    const highFriction = Object.entries(byProject)
      .filter(([_, stats]) => stats.total >= 3)
      .map(([key, stats]) => ({
        key,
        total: stats.total,
        completed: stats.completed,
        rate: stats.completed / stats.total,
      }))
      .filter((p) => p.rate < 0.4) // <40% completion = high friction
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3);

    if (highFriction.length > 0) {
      insights.push({
        id: "task-high-friction",
        kind: "observation",
        category: "task",
        title: msg("highFrictionTitle", locale),
        body: msg("highFrictionBody", locale, { count: highFriction.length }),
        data: {
          items: highFriction.map((p) => ({
            label: p.key === "no-project" ? msg("noProject", locale) : p.key.slice(0, 12),
            value: Math.round(p.rate * 100),
          })),
          chartType: "bar",
          chartData: highFriction.map((p) => ({
            label: p.key === "no-project" ? msg("noProject", locale) : p.key.slice(0, 12),
            value: Math.round(p.rate * 100),
          })),
          chartCaption: msg("highFrictionCaption", locale),
          metrics: { highFrictionProjectCount: highFriction.length },
        },
      });
    }
  }

  // --- 4. Completion trend (week-over-week) ---
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const thisWeek = completed.filter((t) => t.completedAt && t.completedAt >= weekAgo).length;
  const lastWeek = completed.filter((t) => t.completedAt && t.completedAt >= twoWeeksAgo && t.completedAt < weekAgo).length;

  if (thisWeek + lastWeek >= MIN_TASKS_FOR_PATTERN) {
    if (lastWeek === 0 && thisWeek > 0) {
      insights.push({
        id: "task-trend-new",
        kind: "celebration",
        category: "task",
        title: msg("trendUpTitle", locale),
        body: msg("trendUpBody", locale, { count: thisWeek }),
        data: {
          chartType: "bar",
          chartData: [
            { label: msg("lastWeek", locale), value: lastWeek },
            { label: msg("thisWeek", locale), value: thisWeek },
          ],
          chartCaption: msg("trendCaption", locale),
          metrics: { thisWeek, lastWeek },
        },
      });
    } else if (lastWeek > 0) {
      const delta = thisWeek - lastWeek;
      if (delta > 0) {
        insights.push({
          id: "task-trend-up",
          kind: "celebration",
          category: "task",
          title: msg("trendUpTitle", locale),
          body: msg("trendUpBody", locale, { count: thisWeek }),
          data: {
            chartType: "bar",
            chartData: [
              { label: msg("lastWeek", locale), value: lastWeek },
              { label: msg("thisWeek", locale), value: thisWeek },
            ],
            chartCaption: msg("trendCaption", locale),
            metrics: { thisWeek, lastWeek, delta },
          },
        });
      } else if (delta < 0) {
        insights.push({
          id: "task-trend-down",
          kind: "observation",
          category: "task",
          title: msg("trendDownTitle", locale),
          body: msg("trendDownBody", locale, { thisWeek, lastWeek }),
          data: {
            chartType: "bar",
            chartData: [
              { label: msg("lastWeek", locale), value: lastWeek },
              { label: msg("thisWeek", locale), value: thisWeek },
            ],
            chartCaption: msg("trendCaption", locale),
            metrics: { thisWeek, lastWeek, delta },
          },
        });
      } else {
        insights.push({
          id: "task-trend-stable",
          kind: "observation",
          category: "task",
          title: msg("trendStableTitle", locale),
          body: msg("trendStableBody", locale, { count: thisWeek }),
          data: {
            chartType: "bar",
            chartData: [
              { label: msg("lastWeek", locale), value: lastWeek },
              { label: msg("thisWeek", locale), value: thisWeek },
            ],
            chartCaption: msg("trendCaption", locale),
            metrics: { thisWeek, lastWeek },
          },
        });
      }
    }
  } else if (completed.length > 0 && completed.length < MIN_TASKS_FOR_PATTERN) {
    insights.push({
      id: "task-insufficient",
      kind: "suggestion",
      category: "task",
      title: msg("insufficientTitle", locale),
      body: msg("insufficientBody", locale, { current: completed.length, needed: MIN_TASKS_FOR_PATTERN }),
    });
  }

  return insights;
}

// ============================================================
// LOCALIZED MESSAGES — descriptive, never judgmental.
// ============================================================

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    emptyTitle: { en: "No tasks yet", ar: "لا مهام بعد", fr: "Aucune tâche", zh: "暂无任务" },
    emptyBody: {
      en: "Add a few tasks and complete them to see patterns about your typical task duration and completion trends.",
      ar: "أضف بعض المهام وأكملها لرؤية أنماط حول مدة المهام النموذجية واتجاهات الإكمال.",
      fr: "Ajoute quelques tâches et termine-les pour voir des patterns sur ta durée typique de tâche et tes tendances d'achèvement.",
      zh: "添加一些任务并完成它们，就能看到你典型任务时长和完成趋势的模式。",
    },
    insufficientTitle: { en: "Not enough task data yet", ar: "لا توجد بيانات كافية للمهام", fr: "Pas assez de données de tâches", zh: "任务数据还不足" },
    insufficientBody: {
      en: "You have {current} completed task(s). Complete at least {needed} to identify task patterns.",
      ar: "لديك {current} مهمة مكتملة. أكمل على الأقل {needed} لتحديد أنماط المهام.",
      fr: "Tu as {current} tâche(s) terminée(s). Complète-en au moins {needed} pour identifier des patterns de tâches.",
      zh: "你有 {current} 个已完成任务。完成至少 {needed} 个才能识别任务模式。",
    },
    postponedTitle: { en: "Frequently postponed tasks", ar: "مهام تؤجل كثيرًا", fr: "Tâches souvent reportées", zh: "经常推迟的任务" },
    postponedBody: {
      en: "Your data shows {count} task(s) have been postponed {totalPostpones} time(s) in total. These might benefit from smaller steps or a different time.",
      ar: "بياناتك تظهر أن {count} مهمة تم تأجيلها {totalPostpones} مرة في المجموع. قد تستفيد هذه من خطوات أصغر أو وقت مختلف.",
      fr: "Tes données montrent que {count} tâche(s) ont été reportée(s) {totalPostpones} fois au total. Elles pourraient bénéficier de plus petites étapes ou d'un autre moment.",
      zh: "你的数据显示 {count} 个任务共被推迟了 {totalPostpones} 次。这些任务可能受益于更小的步骤或不同的时间。",
    },
    postponedCaption: {
      en: "Each bar is one task. Taller bars mean more postponements. This is an observation — postponing is a normal part of the process.",
      ar: "كل عمود يمثل مهمة. الأعمدة الأطول تعني تأجيلات أكثر. هذا ملاحظة — التأجيل جزء طبيعي من العملية.",
      fr: "Chaque barre est une tâche. Les barres plus hautes signifient plus de reports. C'est une observation — reporter est une partie normale du processus.",
      zh: "每个柱代表一个任务。较高的柱表示更多次推迟。这是观察——推迟是过程中的正常部分。",
    },
    typicalDurationTitle: { en: "Typical task duration", ar: "مدة المهام النموذجية", fr: "Durée typique de tâche", zh: "典型任务时长" },
    typicalDurationBody: {
      en: "Your data shows your completed tasks had an average estimate of {avg} minutes (median: {median} min). Tasks close to this length tend to get done.",
      ar: "بياناتك تظهر أن مهامك المكتملة كان لها متوسط تقدير {avg} دقيقة (الوسيط: {median} دقيقة). المهام القريبة من هذا الطول تميل إلى الإنجاز.",
      fr: "Tes données montrent que tes tâches terminées avaient une estimation moyenne de {avg} min (médiane : {median} min). Les tâches proches de cette longueur tendent à être terminées.",
      zh: "你的数据显示已完成的任务平均估计 {avg} 分钟（中位数：{median} 分钟）。接近此时长的任务倾向于被完成。",
    },
    highFrictionTitle: { en: "High-friction areas", ar: "مجالات عالية الاحتكاك", fr: "Zones à forte friction", zh: "高摩擦区域" },
    highFrictionBody: {
      en: "Your data shows {count} project(s)/area(s) with a completion rate below 40%. These might benefit from smaller steps or different timing.",
      ar: "بياناتك تظهر {count} مشروع/مجال بمعدل إكمال أقل من 40٪. قد تستفيد هذه من خطوات أصغر أو توقيت مختلف.",
      fr: "Tes données montrent {count} projet(s)/zone(s) avec un taux d'achèvement sous 40 %. Ils pourraient bénéficier de plus petites étapes ou d'un autre timing.",
      zh: "你的数据显示 {count} 个项目/区域完成率低于 40%。这些可能受益于更小的步骤或不同的时间安排。",
    },
    highFrictionCaption: {
      en: "Each bar is one project/area. The bar shows the completion rate (%) — taller is better. Lower bars mean more friction.",
      ar: "كل عمود يمثل مشروع/مجال. يُظهر العمود معدل الإكمال (٪) — الأطول أفضل. الأعمدة الأقصر تعني احتكاكًا أكثر.",
      fr: "Chaque barre est un projet/zone. La barre montre le taux d'achèvement (%) — plus haut c'est mieux. Les barres plus basses signifient plus de friction.",
      zh: "每个柱代表一个项目/区域。柱表示完成率(%)——越高越好。较低的柱表示更多摩擦。",
    },
    noProject: { en: "(no project)", ar: "(لا مشروع)", fr: "(aucun projet)", zh: "（无项目）" },
    trendUpTitle: { en: "Completion trending up", ar: "الإكمال يتزايد", fr: "Achèvement en hausse", zh: "完成趋势上升" },
    trendUpBody: {
      en: "Your data shows you completed {count} task(s) this week — more than last week.",
      ar: "بياناتك تظهر أنك أكملت {count} مهمة هذا الأسبوع — أكثر من الأسبوع الماضي.",
      fr: "Tes données montrent que tu as terminé {count} tâche(s) cette semaine — plus que la semaine dernière.",
      zh: "你的数据显示你本周完成了 {count} 个任务——比上周多。",
    },
    trendDownTitle: { en: "Completion trending down", ar: "الإكمال يتناقص", fr: "Achèvement en baisse", zh: "完成趋势下降" },
    trendDownBody: {
      en: "Your data shows you completed {thisWeek} task(s) this week, down from {lastWeek} last week. This is descriptive — weeks naturally vary.",
      ar: "بياناتك تظهر أنك أكملت {thisWeek} مهمة هذا الأسبوع، انخفاضًا من {lastWeek} الأسبوع الماضي. هذا وصفي — الأسابيع تختلف طبيعيًا.",
      fr: "Tes données montrent que tu as terminé {thisWeek} tâche(s) cette semaine, en baisse par rapport à {lastWeek} la semaine dernière. C'est descriptif — les semaines varient naturellement.",
      zh: "你的数据显示你本周完成了 {thisWeek} 个任务，比上周的 {lastWeek} 少。这是描述——每周自然有波动。",
    },
    trendStableTitle: { en: "Stable completion", ar: "إكمال مستقر", fr: "Achèvement stable", zh: "完成稳定" },
    trendStableBody: {
      en: "Your data shows you completed {count} task(s) this week — similar to last week.",
      ar: "بياناتك تظهر أنك أكملت {count} مهمة هذا الأسبوع — مشابه للأسبوع الماضي.",
      fr: "Tes données montrent que tu as terminé {count} tâche(s) cette semaine — similaire à la semaine dernière.",
      zh: "你的数据显示你本周完成了 {count} 个任务——与上周相似。",
    },
    trendCaption: {
      en: "Two bars: last week vs this week. Both are real counts of completed tasks.",
      ar: "عمودان: الأسبوع الماضي مقابل هذا الأسبوع. كلاهما عدد حقيقي للمهام المكتملة.",
      fr: "Deux barres : semaine dernière vs cette semaine. Les deux sont des comptes réels de tâches terminées.",
      zh: "两个柱：上周对比本周。两者都是真实完成的任务数。",
    },
    lastWeek: { en: "Last week", ar: "الأسبوع الماضي", fr: "Semaine dernière", zh: "上周" },
    thisWeek: { en: "This week", ar: "هذا الأسبوع", fr: "Cette semaine", zh: "本周" },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ""));
}
