/**
 * MindStep Insights Engine — Time Patterns (Prompt 11 — Time Patterns).
 *
 * Identifies descriptive time-of-day patterns:
 *   "Your completed tasks are more frequent in the morning."
 *
 * AVOIDS claiming causation. Cautious language per Prompt 11 §Time Patterns.
 * Never "Your brain works best..." — always "Your data shows...".
 */

import type { Locale } from "@/i18n/locale";

export interface TaskTimeData {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  status: string;
}

export interface TimePatternInsight {
  id: string;
  kind: "observation" | "pattern" | "suggestion";
  category: "time";
  title: string;
  body: string;
  data?: {
    chartType?: "bar";
    chartData?: Array<{ label: string; value: number }>;
    chartCaption?: string;
    metrics?: Record<string, number | string>;
  };
}

const MIN_TASKS_FOR_PATTERN = 5;

// ============================================================
// TIME PATTERNS
// ============================================================

export function generateTimePatternInsights(
  tasks: TaskTimeData[],
  locale: Locale,
): TimePatternInsight[] {
  const insights: TimePatternInsight[] = [];

  // Filter to completed tasks with a completion timestamp.
  const completed = tasks.filter((t) => (t.status === "completed" || t.status === "done") && t.completedAt);
  if (completed.length === 0) {
    insights.push({
      id: "time-empty",
      kind: "suggestion",
      category: "time",
      title: msg("emptyTitle", locale),
      body: msg("emptyBody", locale),
    });
    return insights;
  }

  if (completed.length < MIN_TASKS_FOR_PATTERN) {
    insights.push({
      id: "time-insufficient",
      kind: "suggestion",
      category: "time",
      title: msg("insufficientTitle", locale),
      body: msg("insufficientBody", locale, { current: completed.length, needed: MIN_TASKS_FOR_PATTERN }),
    });
    return insights;
  }

  // Bucket by hour-of-day.
  const periodCounts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const t of completed) {
    const hour = t.completedAt!.getHours();
    if (hour >= 5 && hour < 12) periodCounts.morning++;
    else if (hour >= 12 && hour < 18) periodCounts.afternoon++;
    else if (hour >= 18 && hour < 23) periodCounts.evening++;
    else periodCounts.night++;
  }
  const total = completed.length;

  // Determine the dominant period.
  const periodKeys = ["morning", "afternoon", "evening", "night"] as const;
  const ranked = periodKeys
    .map((k) => ({ key: k, count: periodCounts[k] }))
    .sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const secondTop = ranked[1];

  // Only surface if the top period has a clear plurality (>40% and not tied).
  const topRatio = top.count / total;
  if (topRatio >= 0.4 && top.count > secondTop.count) {
    insights.push({
      id: "time-dominant-period",
      kind: "observation",
      category: "time",
      title: msg("dominantTitle", locale),
      body: msg("dominantBody", locale, {
        period: msg(`period.${top.key}`, locale),
        count: top.count,
        total,
        percent: Math.round(topRatio * 100),
      }),
      data: {
        chartType: "bar",
        chartData: periodKeys.map((k) => ({
          label: msg(`period.${k}`, locale),
          value: periodCounts[k],
        })),
        chartCaption: msg("dominantCaption", locale),
        metrics: {
          dominantPeriod: top.key,
          dominantCount: top.count,
          dominantPercent: Math.round(topRatio * 100),
          totalCompleted: total,
        },
      },
    });
  } else {
    // No clear dominant period — honest about it.
    insights.push({
      id: "time-balanced",
      kind: "pattern",
      category: "time",
      title: msg("balancedTitle", locale),
      body: msg("balancedBody", locale, { total }),
      data: {
        chartType: "bar",
        chartData: periodKeys.map((k) => ({
          label: msg(`period.${k}`, locale),
          value: periodCounts[k],
        })),
        chartCaption: msg("balancedCaption", locale),
        metrics: { totalCompleted: total },
      },
    });
  }

  // Day-of-week pattern.
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  for (const t of completed) {
    dayCounts[t.completedAt!.getDay()]++;
  }
  const dayNames = periodKeys; // unused but keeps type-check happy
  void dayNames;
  const dayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const totalDayCompleted = dayCounts.reduce((a, b) => a + b, 0);
  const mostProductiveDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  if (totalDayCompleted >= MIN_TASKS_FOR_PATTERN && dayCounts[mostProductiveDayIdx] > 0) {
    const dayName = msg(`day.${dayLabels[mostProductiveDayIdx]}`, locale);
    insights.push({
      id: "time-day-of-week",
      kind: "observation",
      category: "time",
      title: msg("dayOfWeekTitle", locale),
      body: msg("dayOfWeekBody", locale, {
        day: dayName,
        count: dayCounts[mostProductiveDayIdx],
        total: totalDayCompleted,
      }),
      data: {
        chartType: "bar",
        chartData: dayLabels.map((dl, i) => ({
          label: msg(`day.${dl}`, locale),
          value: dayCounts[i],
        })),
        chartCaption: msg("dayOfWeekCaption", locale),
        metrics: {
          mostProductiveDay: dayLabels[mostProductiveDayIdx],
          dayCount: dayCounts[mostProductiveDayIdx],
        },
      },
    });
  }

  return insights;
}

// ============================================================
// LOCALIZED MESSAGES — cautious, descriptive.
// ============================================================

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    emptyTitle: { en: "No completed tasks yet", ar: "لا مهام مكتملة بعد", fr: "Aucune tâche terminée", zh: "暂无已完成的任务" },
    emptyBody: {
      en: "Complete a few tasks to see patterns about when you tend to finish them.",
      ar: "أكمل بعض المهام لرؤية أنماط حول متى تميل إلى إنهائها.",
      fr: "Termine quelques tâches pour voir des patterns sur les moments où tu as tendance à les finir.",
      zh: "完成一些任务，就能看到你倾向于何时完成它们的模式。",
    },
    insufficientTitle: { en: "Not enough data yet", ar: "لا توجد بيانات كافية بعد", fr: "Pas assez de données", zh: "数据还不足" },
    insufficientBody: {
      en: "You have {current} completed task(s). Complete at least {needed} to identify a reliable time pattern.",
      ar: "لديك {current} مهمة مكتملة. أكمل على الأقل {needed} لتحديد نمط زمني موثوق.",
      fr: "Tu as {current} tâche(s) terminée(s). Complète-en au moins {needed} pour identifier un pattern temporel fiable.",
      zh: "你有 {current} 个已完成任务。完成至少 {needed} 个才能识别可靠的时间模式。",
    },
    dominantTitle: { en: "When you tend to complete tasks", ar: "متى تميل إلى إكمال المهام", fr: "Quand tu as tendance à terminer les tâches", zh: "你倾向于何时完成任务" },
    dominantBody: {
      en: "Your data shows your completed tasks are more frequent in the {period} — {count} of {total} ({percent}%). This is descriptive, not prescriptive.",
      ar: "بياناتك تظهر أن مهامك المكتملة أكثر تكرارًا في الـ{period} — {count} من {total} ({percent}٪). هذا وصفي، ليس إلزاميًا.",
      fr: "Tes données montrent que tes tâches terminées sont plus fréquentes le {period} — {count} sur {total} ({percent} %). C'est descriptif, pas normatif.",
      zh: "你的数据显示你已完成的任务在{period}更频繁——{total} 个中的 {count} 个（{percent}%）。这是描述，不是规定。",
    },
    dominantCaption: {
      en: "Each bar is one part of the day. Taller bars mean more tasks completed in that period. This is an observation, not a goal.",
      ar: "كل عمود يمثل جزءًا من اليوم. الأعمدة الأطول تعني مهام أكثر اكتملت في تلك الفترة. هذا ملاحظة، وليس هدفًا.",
      fr: "Chaque barre est une partie de la journée. Les barres plus hautes signifient plus de tâches terminées dans cette période. C'est une observation, pas un objectif.",
      zh: "每个柱代表一天中的一段。较高的柱表示该时段完成了更多任务。这是观察，不是目标。",
    },
    balancedTitle: { en: "Spread across the day", ar: "موزعة عبر اليوم", fr: "Réparties dans la journée", zh: "全天分布" },
    balancedBody: {
      en: "Your data shows your {total} completed task(s) are spread fairly evenly across the day — no single period dominates.",
      ar: "بياناتك تظهر أن مهامك الـ{total} المكتملة موزعة بالتساوي عبر اليوم — لا فترة واحدة تهيمن.",
      fr: "Tes données montrent que tes {total} tâche(s) terminée(s) sont réparties assez uniformément dans la journée — aucune période ne domine.",
      zh: "你的数据显示你 {total} 个已完成任务在一天中分布均匀——没有哪个时段占主导。",
    },
    balancedCaption: {
      en: "Each bar is one part of the day. Even bars mean you complete tasks at many times — that's flexible.",
      ar: "كل عمود يمثل جزءًا من اليوم. الأعمدة المتساوية تعني أنك تكمل المهام في أوقات متعددة — هذا مرن.",
      fr: "Chaque barre est une partie de la journée. Des barres égales signifient que tu termines des tâches à différents moments — c'est flexible.",
      zh: "每个柱代表一天中的一段。均匀的柱表示你在多个时间完成任务——这很灵活。",
    },
    dayOfWeekTitle: { en: "Most productive day of week", ar: "أكثر أيام الأسبوع إنتاجية", fr: "Jour le plus productif de la semaine", zh: "一周中最有效率的一天" },
    dayOfWeekBody: {
      en: "Your data shows {count} of your {total} completed task(s) were finished on {day}.",
      ar: "بياناتك تظهر أن {count} من {total} من مهامك المكتملة تم إنهاؤها يوم {day}.",
      fr: "Tes données montrent que {count} sur {total} de tes tâches terminées l'ont été le {day}.",
      zh: "你的数据显示 {total} 个已完成任务中有 {count} 个是在{day}完成的。",
    },
    dayOfWeekCaption: {
      en: "Each bar is one day of the week. Taller bars mean more tasks completed on that day.",
      ar: "كل عمود يمثل يومًا من الأسبوع. الأعمدة الأطول تعني مهام أكثر اكتملت ذلك اليوم.",
      fr: "Chaque barre est un jour de la semaine. Les barres plus hautes signifient plus de tâches terminées ce jour-là.",
      zh: "每个柱代表一周中的一天。较高的柱表示当天完成了更多任务。",
    },
    "period.morning": { en: "morning", ar: "الصباح", fr: "matin", zh: "上午" },
    "period.afternoon": { en: "afternoon", ar: "بعد الظهر", fr: "après-midi", zh: "下午" },
    "period.evening": { en: "evening", ar: "المساء", fr: "soir", zh: "晚上" },
    "period.night": { en: "late night", ar: "الليل", fr: "nuit", zh: "深夜" },
    "day.sun": { en: "Sunday", ar: "الأحد", fr: "dimanche", zh: "周日" },
    "day.mon": { en: "Monday", ar: "الإثنين", fr: "lundi", zh: "周一" },
    "day.tue": { en: "Tuesday", ar: "الثلاثاء", fr: "mardi", zh: "周二" },
    "day.wed": { en: "Wednesday", ar: "الأربعاء", fr: "mercredi", zh: "周三" },
    "day.thu": { en: "Thursday", ar: "الخميس", fr: "jeudi", zh: "周四" },
    "day.fri": { en: "Friday", ar: "الجمعة", fr: "vendredi", zh: "周五" },
    "day.sat": { en: "Saturday", ar: "السبت", fr: "samedi", zh: "周六" },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ""));
}
