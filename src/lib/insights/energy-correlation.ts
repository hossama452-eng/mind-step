/**
 * MindStep Insights Engine — Energy Correlation (Prompt 11 — Energy Correlation).
 *
 * If sufficient data exists, shows ASSOCIATIONS (not causation) between
 * self-reported energy and task completion.
 *
 * CAUTIOUS LANGUAGE:
 *   "Your data shows..."
 *   NOT:
 *   "Your brain works best..."
 *   NOT:
 *   "You should..."
 *
 * Statistical caveats: small samples are unreliable; we always disclose N.
 */

import type { Locale } from "@/i18n/locale";

export interface EnergyEntryData {
  id: string;
  level: number; // 1-5
  timestamp: Date;
  note: string | null;
}

export interface TaskCompletionData {
  id: string;
  completedAt: Date | null;
  status: string;
}

export interface EnergyCorrelationInsight {
  id: string;
  kind: "pattern" | "observation" | "suggestion" | "correlation";
  category: "energy";
  title: string;
  body: string;
  data?: {
    chartType?: "bar" | "line";
    chartData?: Array<{ label: string; value: number }>;
    chartCaption?: string;
    metrics?: Record<string, number | string>;
  };
}

const MIN_ENTRIES = 5;
const MIN_TASKS = 5;

// ============================================================
// ENERGY CORRELATION
// ============================================================

export function generateEnergyCorrelationInsights(
  energy: EnergyEntryData[],
  tasks: TaskCompletionData[],
  locale: Locale,
): EnergyCorrelationInsight[] {
  const insights: EnergyCorrelationInsight[] = [];

  if (energy.length === 0) {
    insights.push({
      id: "energy-empty",
      kind: "suggestion",
      category: "energy",
      title: msg("emptyTitle", locale),
      body: msg("emptyBody", locale),
    });
    return insights;
  }

  if (energy.length < MIN_ENTRIES) {
    insights.push({
      id: "energy-insufficient",
      kind: "suggestion",
      category: "energy",
      title: msg("insufficientTitle", locale),
      body: msg("insufficientBody", locale, { current: energy.length, needed: MIN_ENTRIES }),
    });
    return insights;
  }

  // --- 1. Energy baseline (average) ---
  const avgLevel = energy.reduce((sum, e) => sum + e.level, 0) / energy.length;
  insights.push({
    id: "energy-baseline",
    kind: "observation",
    category: "energy",
    title: msg("baselineTitle", locale),
    body: msg("baselineBody", locale, { avg: avgLevel.toFixed(1), count: energy.length }),
    data: {
      metrics: { avgLevel: Number(avgLevel.toFixed(2)), sampleSize: energy.length },
    },
  });

  // --- 2. Energy by time-of-day (when does the user report higher energy?) ---
  const periodBuckets: Record<string, EnergyEntryData[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };
  for (const e of energy) {
    const hour = e.timestamp.getHours();
    if (hour >= 5 && hour < 12) periodBuckets.morning.push(e);
    else if (hour >= 12 && hour < 18) periodBuckets.afternoon.push(e);
    else if (hour >= 18 && hour < 23) periodBuckets.evening.push(e);
    else periodBuckets.night.push(e);
  }
  const periodKeys = ["morning", "afternoon", "evening", "night"] as const;
  const periodAverages = periodKeys.map((k) => ({
    key: k,
    count: periodBuckets[k].length,
    avg: periodBuckets[k].length > 0
      ? periodBuckets[k].reduce((sum, e) => sum + e.level, 0) / periodBuckets[k].length
      : 0,
  }));
  const withData = periodAverages.filter((p) => p.count > 0);
  if (withData.length >= 2) {
    const sorted = withData.slice().sort((a, b) => b.avg - a.avg);
    const top = sorted[0];
    insights.push({
      id: "energy-by-time",
      kind: "observation",
      category: "energy",
      title: msg("byTimeTitle", locale),
      body: msg("byTimeBody", locale, {
        period: msg(`period.${top.key}`, locale),
        avg: top.avg.toFixed(1),
        count: top.count,
      }),
      data: {
        chartType: "bar",
        chartData: periodAverages.map((p) => ({
          label: msg(`period.${p.key}`, locale),
          value: Number(p.avg.toFixed(1)),
        })),
        chartCaption: msg("byTimeCaption", locale),
        metrics: {
          topPeriod: top.key,
          topPeriodAvg: Number(top.avg.toFixed(2)),
        },
      },
    });
  }

  // --- 3. Recent trend (last 7 days vs all-time avg) ---
  if (energy.length >= MIN_ENTRIES) {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recent = energy.filter((e) => e.timestamp >= weekAgo);
    if (recent.length >= 3) {
      const recentAvg = recent.reduce((sum, e) => sum + e.level, 0) / recent.length;
      const delta = recentAvg - avgLevel;
      if (Math.abs(delta) >= 0.5) {
        insights.push({
          id: "energy-recent-trend",
          kind: delta > 0 ? "observation" : "observation",
          category: "energy",
          title: delta > 0 ? msg("trendUpTitle", locale) : msg("trendDownTitle", locale),
          body: msg(delta > 0 ? "trendUpBody" : "trendDownBody", locale, {
            recent: recentAvg.toFixed(1),
            overall: avgLevel.toFixed(1),
          }),
          data: {
            metrics: {
              recentAvg: Number(recentAvg.toFixed(2)),
              overallAvg: Number(avgLevel.toFixed(2)),
              delta: Number(delta.toFixed(2)),
            },
          },
        });
      } else {
        insights.push({
          id: "energy-stable",
          kind: "observation",
          category: "energy",
          title: msg("stableTitle", locale),
          body: msg("stableBody", locale, { avg: avgLevel.toFixed(1) }),
        });
      }
    }
  }

  // --- 4. Association between energy and task completion (CAUTIOUS) ---
  // We pair each task with the energy entry nearest its completion time,
  // then bucket: high-energy (4-5) vs low-energy (1-2) completion counts.
  const completedTasks = tasks.filter((t) => (t.status === "completed" || t.status === "done") && t.completedAt);
  if (energy.length >= MIN_ENTRIES && completedTasks.length >= MIN_TASKS) {
    // For each completed task, find the nearest energy entry within ±6h.
    type Paired = { taskEnergy: number };
    const paired: Paired[] = [];
    for (const task of completedTasks) {
      const ts = task.completedAt!.getTime();
      let nearest: EnergyEntryData | null = null;
      let nearestDist = 6 * 60 * 60 * 1000; // 6h max window
      for (const e of energy) {
        const dist = Math.abs(e.timestamp.getTime() - ts);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = e;
        }
      }
      if (nearest) paired.push({ taskEnergy: nearest.level });
    }
    if (paired.length >= MIN_TASKS) {
      const highEnergyCompletions = paired.filter((p) => p.taskEnergy >= 4).length;
      const lowEnergyCompletions = paired.filter((p) => p.taskEnergy <= 2).length;
      const total = paired.length;

      // Only surface if there's a clear pattern (>50% on one side AND both sides have data).
      if (highEnergyCompletions + lowEnergyCompletions >= 3) {
        insights.push({
          id: "energy-completion-correlation",
          kind: "correlation",
          category: "energy",
          title: msg("correlationTitle", locale),
          body: msg("correlationBody", locale, {
            high: highEnergyCompletions,
            low: lowEnergyCompletions,
            total,
            pctHigh: total > 0 ? Math.round((highEnergyCompletions / total) * 100) : 0,
          }),
          data: {
            chartType: "bar",
            chartData: [
              { label: msg("highEnergy", locale), value: highEnergyCompletions },
              { label: msg("lowEnergy", locale), value: lowEnergyCompletions },
            ],
            chartCaption: msg("correlationCaption", locale, { sampleSize: paired.length }),
            metrics: {
              highEnergyCompletions,
              lowEnergyCompletions,
              total: paired.length,
            },
          },
        });
      }
    }
  }

  return insights;
}

// ============================================================
// LOCALIZED MESSAGES — cautious, never diagnostic.
// ============================================================

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    emptyTitle: { en: "No energy check-ins yet", ar: "لا توجد تسجيلات طاقة بعد", fr: "Aucun check-in d'énergie", zh: "暂无能量打卡" },
    emptyBody: {
      en: "Log how you're feeling a few times to see patterns about your energy.",
      ar: "سجّل كيف تشعر بضع مرات لرؤية أنماط حول طاقتك.",
      fr: "Note comment tu te sens quelques fois pour voir des patterns sur ton énergie.",
      zh: "几次记录你的感受，就能看到你能量的模式。",
    },
    insufficientTitle: { en: "Not enough energy data yet", ar: "لا توجد بيانات طاقة كافية", fr: "Pas assez de données d'énergie", zh: "能量数据还不足" },
    insufficientBody: {
      en: "You have {current} check-in(s). Log at least {needed} to identify patterns.",
      ar: "لديك {current} تسجيل. سجّل على الأقل {needed} لتحديد الأنماط.",
      fr: "Tu as {current} check-in(s). Note-en au moins {needed} pour identifier des patterns.",
      zh: "你有 {current} 次打卡。至少 {needed} 次才能识别模式。",
    },
    baselineTitle: { en: "Your energy baseline", ar: "خط أساس طاقتك", fr: "Ta ligne de base d'énergie", zh: "你的能量基线" },
    baselineBody: {
      en: "Your data shows your average energy is {avg}/5 based on {count} check-in(s). This is a baseline, not a verdict.",
      ar: "بياناتك تظهر أن متوسط طاقتك هو {avg}/5 بناءً على {count} تسجيل. هذا خط أساس، وليس حكمًا.",
      fr: "Tes données montrent que ton énergie moyenne est de {avg}/5 basée sur {count} check-in(s). C'est une ligne de base, pas un verdict.",
      zh: "你的数据显示你平均能量是 {avg}/5，基于 {count} 次打卡。这是基线，不是定论。",
    },
    byTimeTitle: { en: "Energy by time of day", ar: "الطاقة حسب وقت اليوم", fr: "Énergie selon le moment de la journée", zh: "按时间段的能量" },
    byTimeBody: {
      en: "Your data shows you tend to report higher energy in the {period} (average {avg}/5, from {count} check-in).",
      ar: "بياناتك تظهر أنك تميل إلى الإبلاغ عن طاقة أعلى في الـ{period} (متوسط {avg}/5، من {count} تسجيل).",
      fr: "Tes données montrent que tu as tendance à rapporter une énergie plus élevée le {period} (moyenne {avg}/5, sur {count} check-in).",
      zh: "你的数据显示你倾向于在{period}报告较高的能量（平均 {avg}/5，来自 {count} 次打卡）。",
    },
    byTimeCaption: {
      en: "Each bar shows the average energy level reported in that time period. Taller = higher energy.",
      ar: "كل عمود يُظهر متوسط مستوى الطاقة المُبلّغ عنه في تلك الفترة. الأطول = طاقة أعلى.",
      fr: "Chaque barre montre le niveau d'énergie moyen rapporté dans cette période. Plus haut = plus d'énergie.",
      zh: "每个柱显示该时段报告的平均能量水平。越高 = 能量越高。",
    },
    trendUpTitle: { en: "Energy is up recently", ar: "الطاقة مرتفعة مؤخرًا", fr: "L'énergie est en hausse récemment", zh: "近期能量上升" },
    trendUpBody: {
      en: "Your data shows your recent energy (last 7 days) is {recent}/5, up from your overall average of {overall}/5.",
      ar: "بياناتك تظهر أن طاقتك الأخيرة (آخر 7 أيام) هي {recent}/5، ارتفاعًا من متوسطك العام {overall}/5.",
      fr: "Tes données montrent que ton énergie récente (7 derniers jours) est de {recent}/5, en hausse par rapport à ta moyenne globale de {overall}/5.",
      zh: "你的数据显示你近期（过去 7 天）能量是 {recent}/5，高于你总体平均的 {overall}/5。",
    },
    trendDownTitle: { en: "Energy is lower recently", ar: "الطاقة أقل مؤخرًا", fr: "L'énergie est plus basse récemment", zh: "近期能量较低" },
    trendDownBody: {
      en: "Your data shows your recent energy (last 7 days) is {recent}/5, down from your overall average of {overall}/5. This is descriptive — energy naturally varies.",
      ar: "بياناتك تظهر أن طاقتك الأخيرة (آخر 7 أيام) هي {recent}/5، انخفاضًا من متوسطك العام {overall}/5. هذا وصفي — الطاقة تختلف طبيعيًا.",
      fr: "Tes données montrent que ton énergie récente (7 derniers jours) est de {recent}/5, en baisse par rapport à ta moyenne globale de {overall}/5. C'est descriptif — l'énergie varie naturellement.",
      zh: "你的数据显示你近期（过去 7 天）能量是 {recent}/5，低于总体平均的 {overall}/5。这是描述——能量自然波动。",
    },
    stableTitle: { en: "Energy is stable", ar: "الطاقة مستقرة", fr: "L'énergie est stable", zh: "能量稳定" },
    stableBody: {
      en: "Your data shows your energy has been fairly stable recently — averaging {avg}/5.",
      ar: "بياناتك تظهر أن طاقتك كانت مستقرة إلى حد كبير مؤخرًا — بمتوسط {avg}/5.",
      fr: "Tes données montrent que ton énergie a été assez stable récemment — en moyenne {avg}/5.",
      zh: "你的数据显示你近期能量相当稳定——平均 {avg}/5。",
    },
    correlationTitle: { en: "Energy & task completion", ar: "الطاقة وإكمال المهام", fr: "Énergie et achèvement des tâches", zh: "能量与任务完成" },
    correlationBody: {
      en: "Your data shows {high} of your {total} completed task(s) were finished shortly after a high-energy check-in, and {low} after a low-energy check-in ({pctHigh}% high). This is an association, not a cause — many factors are at play.",
      ar: "بياناتك تظهر أن {high} من أصل {total} مهمة مكتملة تم إنجازها بعد فترة قصيرة من تسجيل طاقة عالية، و{low} بعد تسجيل طاقة منخفضة ({pctHigh}٪ عالية). هذا ارتباط، وليس سببًا — عوامل كثيرة تلعب دورًا.",
      fr: "Tes données montrent que {high} sur tes {total} tâche(s) terminée(s) l'ont été peu après un check-in d'énergie élevée, et {low} après un check-in d'énergie basse ({pctHigh}% élevée). C'est une association, pas une cause — de nombreux facteurs entrent en jeu.",
      zh: "你的数据显示 {total} 个已完成任务中有 {high} 个是在高能量打卡后不久完成的，{low} 个是在低能量打卡后（{pctHigh}% 高）。这是关联，不是因果——很多因素在起作用。",
    },
    correlationCaption: {
      en: "Two bars: tasks completed after high-energy check-ins vs low-energy. This is a sample of {sampleSize} pairings — small samples are noisy.",
      ar: "عمودان: مهام اكتملت بعد تسجيلات طاقة عالية مقابل منخفضة. هذه عينة من {sampleSize} اقتران — العينات الصغيرة مشوشة.",
      fr: "Deux barres : tâches terminées après check-ins d'énergie élevée vs basse. C'est un échantillon de {sampleSize} appariements — les petits échantillons sont bruités.",
      zh: "两个柱：高能量打卡后完成的任务 vs 低能量。这是 {sampleSize} 个配对的样本——小样本有噪音。",
    },
    highEnergy: { en: "High energy", ar: "طاقة عالية", fr: "Énergie élevée", zh: "高能量" },
    lowEnergy: { en: "Low energy", ar: "طاقة منخفضة", fr: "Énergie basse", zh: "低能量" },
    "period.morning": { en: "morning", ar: "الصباح", fr: "matin", zh: "上午" },
    "period.afternoon": { en: "afternoon", ar: "بعد الظهر", fr: "après-midi", zh: "下午" },
    "period.evening": { en: "evening", ar: "المساء", fr: "soir", zh: "晚上" },
    "period.night": { en: "late night", ar: "الليل", fr: "nuit", zh: "深夜" },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ""));
}
