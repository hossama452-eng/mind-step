/**
 * MindStep Insights Engine — Weekly Review (Prompt 11 — Weekly Review).
 *
 * A concise review of the last 7 days:
 *   - What worked (highlights)
 *   - What was difficult (friction points)
 *   - What changed (delta vs the week before)
 *   - Suggested experiment (one concrete next step to try)
 *
 * Honest about data — if a section has no data, it says so.
 * Suggested experiment is a suggestion, never an instruction.
 */

import type { Locale } from "@/i18n/locale";
import type { FocusSessionData } from "./focus-insights";
import type { TaskPatternData } from "./task-patterns";
import type { EnergyEntryData } from "./energy-correlation";

export interface WeeklyReviewInput {
  focusSessions: FocusSessionData[];
  tasks: TaskPatternData[];
  energyEntries: EnergyEntryData[];
}

export interface WeeklyReview {
  periodStart: Date;
  periodEnd: Date;
  worked: string[];
  difficult: string[];
  changed: string[];
  suggestedExperiment: {
    type: string; // shorter_focus | longer_focus | morning_planning | smaller_steps | different_reminder_timing | earlier_breaks | later_breaks
    title: string;
    description: string;
    rationale: string;
  };
  // Aggregate metrics for the week, exposed to the UI.
  metrics: {
    totalFocusMinutes: number;
    completedTasks: number;
    completedSessions: number;
    avgEnergy: number | null;
    interruptions: number;
  };
}

// ============================================================
// WEEKLY REVIEW GENERATION
// ============================================================

export function generateWeeklyReview(data: WeeklyReviewInput, locale: Locale): WeeklyReview {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  // Filter to this week / last week.
  const thisWeekSessions = data.focusSessions.filter((s) => s.startedAt >= weekAgo);
  const lastWeekSessions = data.focusSessions.filter((s) => s.startedAt >= twoWeeksAgo && s.startedAt < weekAgo);

  const thisWeekCompletedTasks = data.tasks.filter(
    (t) => (t.status === "completed" || t.status === "done") && t.completedAt && t.completedAt >= weekAgo,
  );
  const lastWeekCompletedTasks = data.tasks.filter(
    (t) => (t.status === "completed" || t.status === "done") && t.completedAt && t.completedAt >= twoWeeksAgo && t.completedAt < weekAgo,
  );

  const thisWeekEnergy = data.energyEntries.filter((e) => e.timestamp >= weekAgo);

  const totalFocusMinutes = thisWeekSessions
    .filter((s) => s.status === "completed" && s.actualMinutes)
    .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  const completedSessions = thisWeekSessions.filter((s) => s.status === "completed").length;
  const interruptions = thisWeekSessions.reduce((sum, s) => sum + s.interruptions, 0);
  const avgEnergy = thisWeekEnergy.length > 0
    ? thisWeekEnergy.reduce((sum, e) => sum + e.level, 0) / thisWeekEnergy.length
    : null;

  // === WHAT WORKED ===
  const worked: string[] = [];
  if (completedSessions > 0) {
    worked.push(msg("workedSessions", locale, { count: completedSessions, minutes: totalFocusMinutes }));
  }
  if (thisWeekCompletedTasks.length > 0) {
    worked.push(msg("workedTasks", locale, { count: thisWeekCompletedTasks.length }));
  }
  const zeroInterruptionSessions = thisWeekSessions.filter((s) => s.status === "completed" && s.interruptions === 0).length;
  if (zeroInterruptionSessions > 0) {
    worked.push(msg("workedInterruptionFree", locale, { count: zeroInterruptionSessions }));
  }
  if (avgEnergy && avgEnergy >= 3.5) {
    worked.push(msg("workedEnergy", locale, { avg: avgEnergy.toFixed(1) }));
  }
  if (worked.length === 0) worked.push(msg("workedNone", locale));

  // === WHAT WAS DIFFICULT ===
  const difficult: string[] = [];
  const cancelledSessions = thisWeekSessions.filter((s) => s.status === "cancelled").length;
  if (cancelledSessions > 0) {
    difficult.push(msg("difficultCancelled", locale, { count: cancelledSessions }));
  }
  const highInterruptionSessions = thisWeekSessions.filter((s) => s.status === "completed" && s.interruptions >= 3).length;
  if (highInterruptionSessions > 0) {
    difficult.push(msg("difficultInterruptions", locale, { count: highInterruptionSessions }));
  }
  const postponedTasks = data.tasks.filter((t) => t.snoozedCount >= 2).length;
  if (postponedTasks > 0) {
    difficult.push(msg("difficultPostponed", locale, { count: postponedTasks }));
  }
  if (avgEnergy && avgEnergy < 2.5) {
    difficult.push(msg("difficultEnergy", locale, { avg: avgEnergy.toFixed(1) }));
  }
  if (difficult.length === 0) difficult.push(msg("difficultNone", locale));

  // === WHAT CHANGED (vs the prior week) ===
  const changed: string[] = [];
  const lastWeekMinutes = lastWeekSessions
    .filter((s) => s.status === "completed" && s.actualMinutes)
    .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  const focusDelta = totalFocusMinutes - lastWeekMinutes;
  if (Math.abs(focusDelta) >= 5) {
    changed.push(focusDelta > 0
      ? msg("changedFocusUp", locale, { delta: focusDelta })
      : msg("changedFocusDown", locale, { delta: -focusDelta }));
  } else if (totalFocusMinutes > 0) {
    changed.push(msg("changedFocusStable", locale, { minutes: totalFocusMinutes }));
  }

  const taskDelta = thisWeekCompletedTasks.length - lastWeekCompletedTasks.length;
  if (Math.abs(taskDelta) >= 1) {
    changed.push(taskDelta > 0
      ? msg("changedTasksUp", locale, { delta: taskDelta })
      : msg("changedTasksDown", locale, { delta: -taskDelta }));
  }

  if (changed.length === 0) changed.push(msg("changedNone", locale));

  // === SUGGESTED EXPERIMENT ===
  // Pick one based on the data — never mandatory, always descriptive.
  let experimentType: string = "shorter_focus";
  let rationale = msg("experimentDefault", locale);

  if (totalFocusMinutes > 0 && completedSessions >= 3) {
    const completedThisWeekSessions = thisWeekSessions.filter((s) => s.status === "completed" && s.actualMinutes);
    if (completedThisWeekSessions.length > 0) {
      const avgActual = completedThisWeekSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0) / completedThisWeekSessions.length;
      const avgPlanned = completedThisWeekSessions.reduce((sum, s) => sum + s.plannedMinutes, 0) / completedThisWeekSessions.length;
      // If sessions consistently ran shorter than planned → try shorter planned sessions.
      if (avgActual < avgPlanned * 0.8) {
        experimentType = "shorter_focus";
        rationale = msg("experimentShorterFocus", locale, { actual: Math.round(avgActual), planned: Math.round(avgPlanned) });
      } else if (avgActual > avgPlanned * 1.2) {
        experimentType = "longer_focus";
        rationale = msg("experimentLongerFocus", locale, { actual: Math.round(avgActual), planned: Math.round(avgPlanned) });
      }
    }
  }

  if (highInterruptionSessions > 0 && highInterruptionSessions >= completedSessions / 2) {
    experimentType = "smaller_steps";
    rationale = msg("experimentSmallerSteps", locale, { count: highInterruptionSessions });
  }

  if (postponedTasks > 0 && postponedTasks >= 3) {
    experimentType = "different_reminder_timing";
    rationale = msg("experimentReminderTiming", locale, { count: postponedTasks });
  }

  if (avgEnergy && avgEnergy < 2.8) {
    experimentType = "earlier_breaks";
    rationale = msg("experimentEarlierBreaks", locale, { avg: avgEnergy.toFixed(1) });
  }

  const experimentTitle = msg(`experimentTitle.${experimentType}`, locale);
  const experimentDescription = msg(`experimentDescription.${experimentType}`, locale);

  return {
    periodStart: weekAgo,
    periodEnd: now,
    worked,
    difficult,
    changed,
    suggestedExperiment: {
      type: experimentType,
      title: experimentTitle,
      description: experimentDescription,
      rationale,
    },
    metrics: {
      totalFocusMinutes,
      completedTasks: thisWeekCompletedTasks.length,
      completedSessions,
      avgEnergy: avgEnergy ? Number(avgEnergy.toFixed(2)) : null,
      interruptions,
    },
  };
}

// ============================================================
// LOCALIZED MESSAGES
// ============================================================

function msg(type: string, locale: Locale, params?: Record<string, string | number>): string {
  const m: Record<string, Record<Locale, string>> = {
    workedSessions: {
      en: "You completed {count} focus session(s) — {minutes} minutes of focused work.",
      ar: "أكملت {count} جلسة تركيز — {minutes} دقيقة من العمل المركّز.",
      fr: "Tu as terminé {count} session(s) de focus — {minutes} minutes de travail concentré.",
      zh: "你完成了 {count} 次专注会话——共 {minutes} 分钟的专注工作。",
    },
    workedTasks: {
      en: "You completed {count} task(s).",
      ar: "أكملت {count} مهمة.",
      fr: "Tu as terminé {count} tâche(s).",
      zh: "你完成了 {count} 个任务。",
    },
    workedInterruptionFree: {
      en: "{count} session(s) had zero interruptions.",
      ar: "{count} جلسة بدون أي مقاطعات.",
      fr: "{count} session(s) sans aucune interruption.",
      zh: "{count} 次会话零中断。",
    },
    workedEnergy: {
      en: "Your average energy was {avg}/5 — above your baseline.",
      ar: "متوسط طاقتك كان {avg}/5 — أعلى من خط أساسك.",
      fr: "Ton énergie moyenne était de {avg}/5 — au-dessus de ta ligne de base.",
      zh: "你平均能量是 {avg}/5——高于基线。",
    },
    workedNone: {
      en: "Nothing to highlight yet — keep showing up this week and patterns will emerge.",
      ar: "لا شيء لإبرازه بعد — استمر بالظهور هذا الأسبوع وستظهر الأنماط.",
      fr: "Rien à mettre en avant pour l'instant — continue cette semaine et les patterns émergeront.",
      zh: "暂时没有可突出的——本周继续坚持，模式会出现。",
    },
    difficultCancelled: {
      en: "You cancelled {count} session(s). That's normal — sometimes the timing isn't right.",
      ar: "ألغيت {count} جلسة. هذا طبيعي — أحيانًا التوقيت غير مناسب.",
      fr: "Tu as annulé {count} session(s). C'est normal — parfois le timing n'est pas bon.",
      zh: "你取消了 {count} 次会话。这很正常——有时时机不对。",
    },
    difficultInterruptions: {
      en: "{count} session(s) had 3+ interruptions. Real life happens.",
      ar: "{count} جلسة بها 3+ مقاطعات. الحياة الحقيقية تحدث.",
      fr: "{count} session(s) ont eu 3+ interruptions. La vraie vie arrive.",
      zh: "{count} 次会话有 3+ 次中断。真实生活如此。",
    },
    difficultPostponed: {
      en: "{count} task(s) were postponed multiple times. They might need to be smaller or timed differently.",
      ar: "تم تأجيل {count} مهمة عدة مرات. قد تحتاج إلى أن تكون أصغر أو بتوقيت مختلف.",
      fr: "{count} tâche(s) ont été reportées plusieurs fois. Elles mériteraient d'être plus petites ou à un autre moment.",
      zh: "{count} 个任务被推迟了多次。它们可能需要拆小或换个时间。",
    },
    difficultEnergy: {
      en: "Your average energy was {avg}/5 — on the lower side this week.",
      ar: "متوسط طاقتك كان {avg}/5 — على الجانب الأدنى هذا الأسبوع.",
      fr: "Ton énergie moyenne était de {avg}/5 — plutôt basse cette semaine.",
      zh: "你平均能量是 {avg}/5——本周偏低。",
    },
    difficultNone: {
      en: "Nothing stood out as difficult this week. Honest — that's a good week.",
      ar: "لم يبرز شيء كصعب هذا الأسبوع. صراحة — إنه أسبوع جيد.",
      fr: "Rien ne s'est démarqué comme difficile cette semaine. Honnêtement — c'est une bonne semaine.",
      zh: "本周没有突出的困难。老实说——这是不错的一周。",
    },
    changedFocusUp: {
      en: "Focus time up by {delta} min vs last week.",
      ar: "وقت التركيز زاد بـ {delta} دقيقة عن الأسبوع الماضي.",
      fr: "Temps de focus en hausse de {delta} min vs semaine dernière.",
      zh: "专注时间比上周增加 {delta} 分钟。",
    },
    changedFocusDown: {
      en: "Focus time down by {delta} min vs last week.",
      ar: "وقت التركيز انخفض بـ {delta} دقيقة عن الأسبوع الماضي.",
      fr: "Temps de focus en baisse de {delta} min vs semaine dernière.",
      zh: "专注时间比上周减少 {delta} 分钟。",
    },
    changedFocusStable: {
      en: "Focus time was {minutes} min — similar to last week.",
      ar: "وقت التركيز كان {minutes} دقيقة — مشابه للأسبوع الماضي.",
      fr: "Le temps de focus était de {minutes} min — similaire à la semaine dernière.",
      zh: "专注时间为 {minutes} 分钟——与上周相似。",
    },
    changedTasksUp: {
      en: "Task completion up by {delta} vs last week.",
      ar: "إكمال المهام زاد بـ {delta} عن الأسبوع الماضي.",
      fr: "Achèvement des tâches en hausse de {delta} vs semaine dernière.",
      zh: "任务完成比上周增加 {delta} 个。",
    },
    changedTasksDown: {
      en: "Task completion down by {delta} vs last week.",
      ar: "إكمال المهام انخفض بـ {delta} عن الأسبوع الماضي.",
      fr: "Achèvement des tâches en baisse de {delta} vs semaine dernière.",
      zh: "任务完成比上周减少 {delta} 个。",
    },
    changedNone: {
      en: "Not enough data to compare with the prior week yet.",
      ar: "لا توجد بيانات كافية للمقارنة مع الأسبوع السابق بعد.",
      fr: "Pas assez de données pour comparer avec la semaine précédente pour l'instant.",
      zh: "暂无足够数据与上周对比。",
    },
    experimentDefault: {
      en: "Try shorter focus sessions next week — sometimes 5–10 minutes is enough to start.",
      ar: "جرّب جلسات تركيز أقصر الأسبوع القادم — أحيانًا 5-10 دقائق تكفي للبدء.",
      fr: "Essaie des sessions de focus plus courtes la semaine prochaine — parfois 5-10 minutes suffisent pour démarrer.",
      zh: "下周试试更短的专注会话——有时 5-10 分钟就足以开始。",
    },
    experimentShorterFocus: {
      en: "Your data shows your actual sessions ran shorter than planned ({actual} vs {planned} min). Try shorter planned sessions.",
      ar: "بياناتك تظهر أن جلساتك الفعلية كانت أقصر من المخطط ({actual} مقابل {planned} دقيقة). جرّب جلسات مخططة أقصر.",
      fr: "Tes données montrent que tes sessions réelles étaient plus courtes que prévu ({actual} vs {planned} min). Essaie des sessions plus courtes.",
      zh: "你的数据显示你的实际会话比计划的短（{actual} 对 {planned} 分钟）。试试更短的会话。",
    },
    experimentLongerFocus: {
      en: "Your data shows you often focus longer than planned ({actual} vs {planned} min). Try longer planned sessions.",
      ar: "بياناتك تظهر أنك تركّز غالبًا أطول من المخطط ({actual} مقابل {planned} دقيقة). جرّب جلسات مخططة أطول.",
      fr: "Tes données montrent que tu focus souvent plus longtemps que prévu ({actual} vs {planned} min). Essaie des sessions plus longues.",
      zh: "你的数据显示你经常比计划专注更久（{actual} 对 {planned} 分钟）。试试更长的会话。",
    },
    experimentSmallerSteps: {
      en: "{count} session(s) had 3+ interruptions. Try breaking tasks into smaller steps.",
      ar: "{count} جلسة بها 3+ مقاطعات. جرّب تقسيم المهام إلى خطوات أصغر.",
      fr: "{count} session(s) ont eu 3+ interruptions. Essaie de découper les tâches en plus petites étapes.",
      zh: "{count} 次会话有 3+ 次中断。试试把任务拆成更小的步骤。",
    },
    experimentReminderTiming: {
      en: "{count} task(s) were postponed multiple times. Try different reminder timing.",
      ar: "تم تأجيل {count} مهمة عدة مرات. جرّب توقيت تذكير مختلف.",
      fr: "{count} tâche(s) ont été reportées plusieurs fois. Essaie un autre timing de rappel.",
      zh: "{count} 个任务被推迟了多次。试试不同的提醒时间。",
    },
    experimentEarlierBreaks: {
      en: "Your data shows lower energy this week (avg {avg}/5). Try earlier breaks.",
      ar: "بياناتك تظهر طاقة أقل هذا الأسبوع (متوسط {avg}/5). جرّب فواصل أبكر.",
      fr: "Tes données montrent une énergie plus basse cette semaine (moy {avg}/5). Essaie des pauses plus tôt.",
      zh: "你的数据显示本周能量较低（平均 {avg}/5）。试试更早的休息。",
    },
    "experimentTitle.shorter_focus": { en: "Shorter focus sessions", ar: "جلسات تركيز أقصر", fr: "Sessions de focus plus courtes", zh: "更短的专注会话" },
    "experimentTitle.longer_focus": { en: "Longer focus sessions", ar: "جلسات تركيز أطول", fr: "Sessions de focus plus longues", zh: "更长的专注会话" },
    "experimentTitle.morning_planning": { en: "Morning planning", ar: "تخطيط الصباح", fr: "Planification du matin", zh: "早晨规划" },
    "experimentTitle.evening_planning": { en: "Evening planning", ar: "تخطيط المساء", fr: "Planification du soir", zh: "晚上规划" },
    "experimentTitle.smaller_steps": { en: "Smaller task steps", ar: "خطوات مهمة أصغر", fr: "Plus petites étapes de tâche", zh: "更小的任务步骤" },
    "experimentTitle.different_reminder_timing": { en: "Different reminder timing", ar: "توقيت تذكير مختلف", fr: "Timing de rappel différent", zh: "不同的提醒时间" },
    "experimentTitle.earlier_breaks": { en: "Earlier breaks", ar: "فواصل أبكر", fr: "Pauses plus tôt", zh: "更早的休息" },
    "experimentTitle.later_breaks": { en: "Later breaks", ar: "فواصل لاحقًة", fr: "Pauses plus tard", zh: "更晚的休息" },
    "experimentDescription.shorter_focus": {
      en: "Plan 10-minute focus sessions instead of 25. See if shorter planned sessions match your actual rhythm better.",
      ar: "خطط لجلسات تركيز 10 دقائق بدلًا من 25. هل تطابق الجلسات الأقصر إيقاعك الفعلي بشكل أفضل؟",
      fr: "Planifie des sessions de focus de 10 minutes au lieu de 25. Vois si les sessions plus courtes correspondent mieux à ton rythme réel.",
      zh: "把专注会话计划从 25 分钟改为 10 分钟。看看更短的会话是否更符合你的真实节奏。",
    },
    "experimentDescription.longer_focus": {
      en: "Plan 40-minute focus sessions instead of 25. See if longer planned sessions feel more natural.",
      ar: "خطط لجلسات تركيز 40 دقيقة بدلًا من 25. هل تشعر الجلسات الأطول بأنها أكثر طبيعية؟",
      fr: "Planifie des sessions de focus de 40 minutes au lieu de 25. Vois si les sessions plus longues te semblent plus naturelles.",
      zh: "把专注会话计划从 25 分钟改为 40 分钟。看看更长的会话是否更自然。",
    },
    "experimentDescription.morning_planning": {
      en: "Spend 5 minutes each morning writing today's 3 most important tasks.",
      ar: "اقضِ 5 دقائق كل صباح لكتابة أهم 3 مهام لليوم.",
      fr: "Passe 5 minutes chaque matin à écrire les 3 tâches les plus importantes du jour.",
      zh: "每天早上花 5 分钟写下今天最重要的 3 个任务。",
    },
    "experimentDescription.evening_planning": {
      en: "Spend 5 minutes each evening writing tomorrow's 3 most important tasks.",
      ar: "اقضِ 5 دقائق كل مساء لكتابة أهم 3 مهام للغد.",
      fr: "Passe 5 minutes chaque soir à écrire les 3 tâches les plus importantes de demain.",
      zh: "每天晚上花 5 分钟写下明天最重要的 3 个任务。",
    },
    "experimentDescription.smaller_steps": {
      en: "Break your next task into 3 smaller steps. See if smaller steps feel easier to start.",
      ar: "قسّم مهمتك التالية إلى 3 خطوات أصغر. هل الخطوات الأصغر أسهل للبدء؟",
      fr: "Découpe ta prochaine tâche en 3 plus petites étapes. Vois si les petites étapes sont plus faciles à démarrer.",
      zh: "把下一个任务拆成 3 个更小的步骤。看看更小的步骤是否更容易开始。",
    },
    "experimentDescription.different_reminder_timing": {
      en: "Try scheduling reminders 30 minutes earlier than usual for the next week.",
      ar: "جرّب جدولة التذكيرات قبل 30 دقيقة من المعتاد للأسبوع القادم.",
      fr: "Essaie de programmer les rappels 30 minutes plus tôt que d'habitude la semaine prochaine.",
      zh: "下周试试把提醒提前 30 分钟。",
    },
    "experimentDescription.earlier_breaks": {
      en: "Take a 5-minute break after every 15 minutes of focus for the next week.",
      ar: "خذ استراحة 5 دقائق بعد كل 15 دقيقة من التركيز للأسبوع القادم.",
      fr: "Prends une pause de 5 minutes après chaque 15 minutes de focus la semaine prochaine.",
      zh: "下周试试每专注 15 分钟就休息 5 分钟。",
    },
    "experimentDescription.later_breaks": {
      en: "Try pushing focus blocks to 35 minutes before taking a break next week.",
      ar: "جرّب دفع كتل التركيز إلى 35 دقيقة قبل أخذ استراحة الأسبوع القادم.",
      fr: "Essaie de pousser les blocs de focus à 35 minutes avant une pause la semaine prochaine.",
      zh: "下周试试把专注块延长到 35 分钟再休息。",
    },
  };
  const template = m[type]?.[locale] ?? m[type]?.en ?? type;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ""));
}
