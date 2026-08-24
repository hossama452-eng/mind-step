/**
 * MindStep Insights Engine — Focus Analytics (Prompt 11 — Focus Insights).
 *
 * Analyzes user-owned FocusSession data to surface:
 *   - Average focus duration (actual vs planned)
 *   - Best focus periods (which hours of the day have the most successful sessions)
 *   - Session completion rate
 *   - Interruptions per session (trend)
 *   - Task completion patterns
 *
 * ALL language is descriptive, not diagnostic. Never "You have ADHD",
 * always "Your data shows...". Cautious phrasing per Prompt 11 §Energy Correlation.
 */

import type { Locale } from "@/i18n/locale";

export interface FocusSessionData {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string; // active | paused | completed | cancelled
  interruptions: number;
  taskId: string | null;
  taskTitle: string | null;
}

export interface FocusInsight {
  id: string;
  kind: "pattern" | "observation" | "celebration" | "warning" | "suggestion";
  category: "focus";
  title: string;
  body: string;
  data?: {
    chartType?: "bar" | "line";
    chartData?: Array<{ label: string; value: number }>;
    chartCaption?: string;
    metrics?: Record<string, number | string>;
  };
}

// ============================================================
// THRESHOLDS — below these counts, we say "not enough data yet".
// ============================================================
export const MIN_SESSIONS_FOR_PATTERN = 3;
export const MIN_SESSIONS_FOR_BEST_PERIOD = 5;
export const MIN_SESSIONS_FOR_TREND = 4;

// ============================================================
// FOCUS INSIGHTS
// ============================================================

export function generateFocusInsights(
  sessions: FocusSessionData[],
  locale: Locale,
): FocusInsight[] {
  const insights: FocusInsight[] = [];

  if (sessions.length === 0) {
    insights.push({
      id: "focus-empty",
      kind: "suggestion",
      category: "focus",
      title: msg("emptyTitle", locale),
      body: msg("emptyBody", locale),
    });
    return insights;
  }

  // --- 1. Average focus duration (descriptive, not prescriptive) ---
  if (sessions.length >= MIN_SESSIONS_FOR_PATTERN) {
    const completed = sessions.filter((s) => s.status === "completed" && s.actualMinutes);
    if (completed.length > 0) {
      const avgActual = completed.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0) / completed.length;
      const avgPlanned = completed.reduce((sum, s) => sum + s.plannedMinutes, 0) / completed.length;
      const ratio = avgActual / avgPlanned;

      insights.push({
        id: "focus-average",
        kind: "observation",
        category: "focus",
        title: msg("avgDurationTitle", locale),
        body: msg("avgDurationBody", locale, {
          avgActual: Math.round(avgActual),
          avgPlanned: Math.round(avgPlanned),
          alignment: ratio < 0.8 ? "shorter" : ratio > 1.2 ? "longer" : "aligned",
        }),
        data: {
          chartType: "bar",
          chartData: [
            { label: msg("planned", locale), value: Math.round(avgPlanned) },
            { label: msg("actual", locale), value: Math.round(avgActual) },
          ],
          chartCaption: msg("avgDurationCaption", locale),
          metrics: {
            avgActualMinutes: Math.round(avgActual),
            avgPlannedMinutes: Math.round(avgPlanned),
            sessionCount: completed.length,
          },
        },
      });
    }
  } else {
    insights.push({
      id: "focus-insufficient",
      kind: "suggestion",
      category: "focus",
      title: msg("insufficientTitle", locale),
      body: msg("insufficientBody", locale, {
        current: sessions.length,
        needed: MIN_SESSIONS_FOR_PATTERN,
      }),
    });
  }

  // --- 2. Best focus periods (which hours work best) ---
  if (sessions.length >= MIN_SESSIONS_FOR_BEST_PERIOD) {
    const completed = sessions.filter((s) => s.status === "completed" && s.actualMinutes);
    if (completed.length > 0) {
      // Bucket sessions by hour-of-day (morning/afternoon/evening).
      const buckets: Record<string, FocusSessionData[]> = {
        morning: [], // 5-11
        afternoon: [], // 12-17
        evening: [], // 18-22
        night: [], // 23-4
      };
      for (const s of completed) {
        const hour = s.startedAt.getHours();
        if (hour >= 5 && hour < 12) buckets.morning.push(s);
        else if (hour >= 12 && hour < 18) buckets.afternoon.push(s);
        else if (hour >= 18 && hour < 23) buckets.evening.push(s);
        else buckets.night.push(s);
      }

      // Find the period with the most completed sessions (by count, then by avg minutes).
      const periodKeys = ["morning", "afternoon", "evening", "night"] as const;
      type PeriodKey = (typeof periodKeys)[number];
      const periodCounts = periodKeys.map((k) => ({
        key: k,
        sessions: buckets[k],
        count: buckets[k].length,
        avgMinutes: buckets[k].length > 0
          ? buckets[k].reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0) / buckets[k].length
          : 0,
      }));
      const top = periodCounts.slice().sort((a, b) => b.count - a.count || b.avgMinutes - a.avgMinutes)[0];

      if (top && top.count > 0) {
        const topKey = top.key as PeriodKey;
        insights.push({
          id: "focus-best-period",
          kind: "observation",
          category: "focus",
          title: msg("bestPeriodTitle", locale),
          body: msg("bestPeriodBody", locale, {
            period: msg(`period.${topKey}`, locale),
            count: top.count,
            avgMinutes: Math.round(top.avgMinutes),
          }),
          data: {
            chartType: "bar",
            chartData: periodCounts.map((p) => ({
              label: msg(`period.${p.key}`, locale),
              value: p.count,
            })),
            chartCaption: msg("bestPeriodCaption", locale),
            metrics: {
              topPeriod: topKey,
              topPeriodCount: top.count,
              topPeriodAvgMinutes: Math.round(top.avgMinutes),
            },
          },
        });
      }
    }
  }

  // --- 3. Session completion rate ---
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const cancelledSessions = sessions.filter((s) => s.status === "cancelled").length;
  if (totalSessions > 0) {
    const completionRate = (completedSessions / totalSessions) * 100;
    insights.push({
      id: "focus-completion",
      kind: completionRate >= 80 ? "celebration" : completionRate >= 50 ? "observation" : "warning",
      category: "focus",
      title: msg("completionTitle", locale),
      body: msg("completionBody", locale, {
        rate: Math.round(completionRate),
        completed: completedSessions,
        total: totalSessions,
        cancelled: cancelledSessions,
      }),
      data: {
        chartType: "bar",
        chartData: [
          { label: msg("completed", locale), value: completedSessions },
          { label: msg("cancelled", locale), value: cancelledSessions },
        ],
        chartCaption: msg("completionCaption", locale),
        metrics: {
          completionRate: Math.round(completionRate),
          completedSessions,
          cancelledSessions,
          totalSessions,
        },
      },
    });
  }

  // --- 4. Interruptions per session ---
  const completedWithInterruptions = sessions.filter((s) => s.status === "completed");
  if (completedWithInterruptions.length >= MIN_SESSIONS_FOR_PATTERN) {
    const avgInterruptions = completedWithInterruptions.reduce((sum, s) => sum + s.interruptions, 0) / completedWithInterruptions.length;
    insights.push({
      id: "focus-interruptions",
      kind: avgInterruptions <= 1 ? "celebration" : avgInterruptions <= 3 ? "observation" : "warning",
      category: "focus",
      title: msg("interruptionsTitle", locale),
      body: msg("interruptionsBody", locale, {
        avg: avgInterruptions.toFixed(1),
      }),
      data: {
        metrics: {
          avgInterruptions: Number(avgInterruptions.toFixed(2)),
          totalInterruptions: completedWithInterruptions.reduce((sum, s) => sum + s.interruptions, 0),
        },
      },
    });
  }

  // --- 5. Weekly trend (focus minutes over the last 7 days) ---
  if (sessions.length >= MIN_SESSIONS_FOR_TREND) {
    const now = new Date();
    const last7Days: Array<{ date: Date; label: string; minutes: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const dayMinutes = sessions
        .filter((s) => s.status === "completed" && s.actualMinutes)
        .filter((s) => s.startedAt >= d && s.startedAt < next)
        .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
      last7Days.push({
        date: d,
        label: d.toLocaleDateString(locale === "ar" ? "ar" : locale === "zh" ? "zh" : locale === "fr" ? "fr" : "en", { weekday: "short" }),
        minutes: dayMinutes,
      });
    }
    const totalWeekMinutes = last7Days.reduce((sum, d) => sum + d.minutes, 0);
    if (totalWeekMinutes > 0) {
      insights.push({
        id: "focus-weekly-trend",
        kind: "observation",
        category: "focus",
        title: msg("weeklyTrendTitle", locale),
        body: msg("weeklyTrendBody", locale, {
          total: totalWeekMinutes,
          daysActive: last7Days.filter((d) => d.minutes > 0).length,
        }),
        data: {
          chartType: "bar",
          chartData: last7Days.map((d) => ({ label: d.label, value: d.minutes })),
          chartCaption: msg("weeklyTrendCaption", locale),
          metrics: { totalWeekMinutes, daysActive: last7Days.filter((d) => d.minutes > 0).length },
        },
      });
    }
  }

  return insights;
}

// ============================================================
// LOCALIZED MESSAGES — descriptive, not diagnostic.
// ============================================================

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    emptyTitle: { en: "No focus sessions yet", ar: "لا جلسات تركيز بعد", fr: "Aucune session de focus", zh: "暂无专注会话" },
    emptyBody: {
      en: "Start a focus session to see patterns about your average duration, best periods, and completion rate.",
      ar: "ابدأ جلسة تركيز لرؤية أنماط حول متوسط مدتك وأفضل الفترات ومعدل الإكمال.",
      fr: "Lance une session de focus pour voir des patterns sur ta durée moyenne, tes meilleures périodes et ton taux d'achèvement.",
      zh: "开始一次专注会话，就能看到关于你平均时长、最佳时段和完成率的模式。",
    },
    insufficientTitle: { en: "Not enough focus data yet", ar: "لا توجد بيانات كافية بعد", fr: "Pas assez de données de focus", zh: "专注数据还不足" },
    insufficientBody: {
      en: "You have {current} session(s). Complete at least {needed} sessions to identify a reliable focus pattern.",
      ar: "لديك {current} جلسة. أكمل على الأقل {needed} جلسات لتحديد نمط تركيز موثوق.",
      fr: "Tu as {current} session(s). Complète au moins {needed} sessions pour identifier un pattern de focus fiable.",
      zh: "你有 {current} 次会话。完成至少 {needed} 次会话才能识别可靠的专注模式。",
    },
    avgDurationTitle: { en: "Average focus duration", ar: "متوسط مدة التركيز", fr: "Durée moyenne de focus", zh: "平均专注时长" },
    avgDurationBody: {
      en: "Your data shows your average completed session was {avgActual} minutes (you planned {avgPlanned}). {alignment, select, shorter {Your actual sessions ran shorter than planned — shorter planned sessions might fit better.} longer {Your actual sessions ran longer than planned — you may enjoy longer sessions.} other {Your actual and planned times are well-aligned.}}",
      ar: "بياناتك تظهر أن متوسط جلساتك المكتملة كان {avgActual} دقيقة (خططت لـ {avgPlanned}). {alignment, select, shorter {كانت جلساتك الفعلية أقصر من المخطط — قد تناسبك الجلسات الأقصر.} longer {كانت جلساتك الفعلية أطول من المخطط — قد تستمتع بجلسات أطول.} other {أوقاتك الفعلية والمخططة متوافقة جيدًا.}}",
      fr: "Tes données montrent que ta session moyenne terminée était de {avgActual} min (tu avais prévu {avgPlanned}). {alignment, select, shorter {Tes sessions réelles étaient plus courtes que prévu — des sessions plus courtes pourraient mieux te convenir.} longer {Tes sessions réelles étaient plus longues que prévu — tu pourrais aimer des sessions plus longues.} other {Tes temps réels et prévus sont bien alignés.}}",
      zh: "你的数据显示已完成的会话平均 {avgActual} 分钟（计划 {avgPlanned}）。{alignment, select, shorter {实际比计划短——较短的会话可能更适合你。} longer {实际比计划长——你可能喜欢更长的会话。} other {实际与计划时长匹配良好。}}",
    },
    avgDurationCaption: {
      en: "This chart compares what you planned vs what you actually did. Both are real data — neither is a goal.",
      ar: "هذا الرسم يقارن ما خططت له مع ما فعلته فعليًا. كلاهما بيانات حقيقية — لا أحدهما هدف.",
      fr: "Ce graphique compare ce que tu as prévu avec ce que tu as réellement fait. Les deux sont des données réelles — aucun n'est un objectif.",
      zh: "此图比较你计划与实际所做的。两者都是真实数据——不是目标。",
    },
    planned: { en: "Planned", ar: "مخطط", fr: "Prévu", zh: "计划" },
    actual: { en: "Actual", ar: "فعلي", fr: "Réel", zh: "实际" },
    bestPeriodTitle: { en: "Your busiest focus period", ar: "أكثر فترة تركيزًا لك", fr: "Ta période de focus la plus active", zh: "你最常用的专注时段" },
    bestPeriodBody: {
      en: "Your data shows you completed {count} session(s) in the {period} with an average of {avgMinutes} minutes per session.",
      ar: "بياناتك تظهر أنك أكملت {count} جلسة في الـ{period} بمتوسط {avgMinutes} دقيقة لكل جلسة.",
      fr: "Tes données montrent que tu as terminé {count} session(s) le {period} avec une moyenne de {avgMinutes} min par session.",
      zh: "你的数据显示你在{period}完成了 {count} 次会话，平均每次 {avgMinutes} 分钟。",
    },
    bestPeriodCaption: {
      en: "Each bar is one time-of-day period. Taller bars mean more sessions completed in that period.",
      ar: "كل عمود يمثل فترة من اليوم. الأعمدة الأطول تعني جلسات أكثر اكتملت في تلك الفترة.",
      fr: "Chaque barre est une période de la journée. Les barres plus hautes signifient plus de sessions terminées dans cette période.",
      zh: "每个柱代表一个时段。较高的柱表示在该时段完成了更多会话。",
    },
    "period.morning": { en: "morning", ar: "الصباح", fr: "matin", zh: "上午" },
    "period.afternoon": { en: "afternoon", ar: "بعد الظهر", fr: "après-midi", zh: "下午" },
    "period.evening": { en: "evening", ar: "المساء", fr: "soir", zh: "晚上" },
    "period.night": { en: "late night", ar: "الليل", fr: "nuit", zh: "深夜" },
    completionTitle: { en: "Session completion", ar: "إكمال الجلسات", fr: "Achèvement des sessions", zh: "会话完成情况" },
    completionBody: {
      en: "You completed {completed} out of {total} session(s) ({rate}%). You cancelled {cancelled}.",
      ar: "أكملت {completed} من أصل {total} جلسة ({rate}٪). ألغيت {cancelled}.",
      fr: "Tu as terminé {completed} sur {total} session(s) ({rate} %). Tu en as annulé {cancelled}.",
      zh: "你完成了 {total} 次会话中的 {completed} 次（{rate}%）。取消了 {cancelled} 次。",
    },
    completionCaption: {
      en: "Completed means you reached the end of the timer. Cancelled means you ended early — both are normal.",
      ar: "مكتملة تعني وصلت لنهاية المؤقت. ملغاة تعني أنهيت مبكرًا — كلاهما طبيعي.",
      fr: "Terminée signifie que tu as atteint la fin du minuteur. Annulée signifie que tu as arrêté tôt — les deux sont normaux.",
      zh: "完成表示计时器走到了结尾。取消表示你提前结束了——两者都正常。",
    },
    completed: { en: "Completed", ar: "مكتملة", fr: "Terminées", zh: "已完成" },
    cancelled: { en: "Cancelled", ar: "ملغاة", fr: "Annulées", zh: "已取消" },
    interruptionsTitle: { en: "Interruptions", ar: "المقاطعات", fr: "Interruptions", zh: "中断次数" },
    interruptionsBody: {
      en: "Your data shows an average of {avg} interruption(s) per completed session.",
      ar: "بياناتك تظهر متوسط {avg} مقاطعة لكل جلسة مكتملة.",
      fr: "Tes données montrent une moyenne de {avg} interruption(s) par session terminée.",
      zh: "你的数据显示平均每次完成的会话有 {avg} 次中断。",
    },
    weeklyTrendTitle: { en: "This week's focus", ar: "تركيز هذا الأسبوع", fr: "Focus de cette semaine", zh: "本周的专注" },
    weeklyTrendBody: {
      en: "You focused for {total} minutes across {daysActive} day(s) in the last week.",
      ar: "ركزت لـ {total} دقيقة خلال {daysActive} يوم(s) في الأسبوع الماضي.",
      fr: "Tu as focusé {total} minutes sur {daysActive} jour(s) cette dernière semaine.",
      zh: "你在过去一周里跨 {daysActive} 天共专注了 {total} 分钟。",
    },
    weeklyTrendCaption: {
      en: "Each bar is one day of the last week. Zero means no completed sessions that day.",
      ar: "كل عمود يمثل يومًا من الأسبوع الماضي. صفر تعني لا جلسات مكتملة ذلك اليوم.",
      fr: "Chaque barre est un jour de la dernière semaine. Zéro signifie aucune session terminée ce jour-là.",
      zh: "每个柱代表过去一周的一天。零表示当天无完成的会话。",
    },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  // Simple ICU-like {key, select, ...} and {key} substitution.
  return template.replace(/\{(\w+)(?:,\s*select,\s*([^}]+))?\}/g, (_match, key: string, selectStr?: string) => {
    if (selectStr) {
      // Format: alignment, select, shorter {…} longer {…} other {…}
      const value = String(params[key] ?? "");
      const options: Record<string, string> = {};
      const optionRegex = /(\w+)\s*\{([^}]+)\}/g;
      let om: RegExpExecArray | null;
      while ((om = optionRegex.exec(selectStr)) !== null) {
        options[om[1]] = om[2];
      }
      return options[value] ?? options.other ?? "";
    }
    return String(params[key] ?? "");
  });
}
