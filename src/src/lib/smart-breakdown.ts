import type { Locale } from "@/i18n/locale";

/**
 * Smart Task Breakdown — DETERMINISTIC implementation.
 *
 * Per Prompt 04 §38 & §43:
 *   - Do NOT fake an LLM. If no real AI provider is configured, use a
 *     genuine deterministic algorithm.
 *   - Do NOT claim deterministic output is AI-generated.
 *
 * This module is the deterministic provider. The algorithm is sentence-pattern
 * based: it inspects the task title + description for action verbs and
 * project/subject nouns, then constructs sub-step suggestions by composing
 * those verbs with progression templates appropriate to the locale.
 *
 * The output is NOT random, NOT AI. It is a deterministic suggestion that
 * the user reviews, edits, and approves before any database writes happen.
 *
 * The breakdown flow is:
 *   suggest → review → approve → persist
 *
 * This module ONLY does `suggest`. The `approve` step lives in
 * /api/smart-breakdown/approve which requires explicit user approval.
 */

export interface BreakdownSuggestion {
  /** The subtask title suggestions, ordered as the user should review them. */
  steps: string[];
  /** Honest disclosure — the suggestions come from a deterministic algorithm, not an AI. */
  source: "deterministic";
}

// ============================================================
// Action verbs per locale — used to detect "what kind of task is this?"
// ============================================================

interface VerbPattern {
  /** Pattern to match in the (lowercased) task title/description. */
  match: RegExp;
  /** Template generator: returns 4-6 step strings in the user's locale. */
  template: (subject: string, locale: Locale) => string[];
}

// Templates are sentence-pattern based and produce consistent,
// grammatically-correct suggestions in each supported locale.

const PRESENTATION_TEMPLATES: Record<Locale, (s: string) => string[]> = {
  en: (s) => [
    `Gather existing material for ${s}`,
    `Create the outline for ${s}`,
    `Add key information to ${s}`,
    `Review ${s} for clarity`,
    `Prepare the final version of ${s}`,
  ],
  ar: (s) => [
    `اجمع المواد الموجودة لـ ${s}`,
    `أنشئ المخطط لـ ${s}`,
    `أضف المعلومات الأساسية إلى ${s}`,
    `راجع ${s} من أجل الوضوح`,
    `حضّر النسخة النهائية من ${s}`,
  ],
  fr: (s) => [
    `Rassembler le matériel existant pour ${s}`,
    `Créer le plan pour ${s}`,
    `Ajouter les informations clés à ${s}`,
    `Revoir ${s} pour la clarté`,
    `Préparer la version finale de ${s}`,
  ],
  zh: (s) => [
    `为${s}收集现有材料`,
    `为${s}创建大纲`,
    `为${s}添加关键信息`,
    `审阅${s}以确保清晰`,
    `准备${s}的最终版本`,
  ],
};

const ESSAY_TEMPLATES: Record<Locale, (s: string) => string[]> = {
  en: (s) => [
    `Pick a topic for ${s}`,
    `Read 1-2 sources on ${s}`,
    `Write the opening paragraph`,
    `Write the body of ${s}`,
    `Edit and proofread ${s}`,
  ],
  ar: (s) => [
    `اختر موضوعًا لـ ${s}`,
    `اقرأ مصدرًا أو اثنين عن ${s}`,
    `اكتب الفقرة الافتتاحية`,
    `اكتب متن ${s}`,
    `حرّر وراجع ${s}`,
  ],
  fr: (s) => [
    `Choisir un sujet pour ${s}`,
    `Lire 1-2 sources sur ${s}`,
    `Écrire le paragraphe d'ouverture`,
    `Écrire le corps de ${s}`,
    `Éditer et relire ${s}`,
  ],
  zh: (s) => [
    `为${s}选定主题`,
    `阅读1-2个关于${s}的资料`,
    `写开篇段落`,
    `写${s}的正文`,
    `编辑并校对${s}`,
  ],
};

const EMAIL_TEMPLATES: Record<Locale, (s: string) => string[]> = {
  en: (s) => [
    `Decide what you want from ${s}`,
    `Draft the body of ${s}`,
    `Add a clear subject line`,
    `Re-read ${s} once`,
    `Send ${s}`,
  ],
  ar: (s) => [
    `قرّر ما تريده من ${s}`,
    `صمّم متن ${s}`,
    `أضف سطر موضوع واضح`,
    `أعد قراءة ${s} مرة`,
    `أرسل ${s}`,
  ],
  fr: (s) => [
    `Décider ce que vous voulez de ${s}`,
    `Rédiger le corps de ${s}`,
    `Ajouter un objet clair`,
    `Relire ${s} une fois`,
    `Envoyer ${s}`,
  ],
  zh: (s) => [
    `决定你想从${s}得到什么`,
    `起草${s}的正文`,
    `加一个清晰的主题行`,
    `再读一遍${s}`,
    `发送${s}`,
  ],
};

const CALL_TEMPLATES: Record<Locale, (s: string) => string[]> = {
  en: (s) => [
    `Note down what to say during ${s}`,
    `Find a quiet space for ${s}`,
    `Make ${s}`,
    `Take notes during ${s}`,
    `Follow up after ${s}`,
  ],
  ar: (s) => [
    `دوّن ما ستقوله خلال ${s}`,
    `ابحث عن مكان هادئ لـ ${s}`,
    `قم بـ ${s}`,
    `دوّن ملاحظات خلال ${s}`,
    `تابع بعد ${s}`,
  ],
  fr: (s) => [
    `Noter ce qu'il faut dire pendant ${s}`,
    `Trouver un endroit calme pour ${s}`,
    `Passer l'appel ${s}`,
    `Prendre des notes pendant ${s}`,
    `Faire un suivi après ${s}`,
  ],
  zh: (s) => [
    `写下${s}期间要说什么`,
    `找一个安静的地方打${s}`,
    `打${s}`,
    `在${s}期间记笔记`,
    `${s}后跟进`,
  ],
};

const DEFAULT_TEMPLATES: Record<Locale, (s: string) => string[]> = {
  en: (s) => [
    `Pick the smallest first step of ${s}`,
    `Do that first step`,
    `Find the next small step of ${s}`,
    `Do that step`,
    `Stop, take a breath, decide whether to continue`,
  ],
  ar: (s) => [
    `اختر أصغر خطوة أولى من ${s}`,
    `افعل تلك الخطوة`,
    `ابحث عن الخطوة الصغيرة التالية من ${s}`,
    `افعل تلك الخطوة`,
    `توقف، خذ نَفَسًا، قرر إن كنت ستكمل`,
  ],
  fr: (s) => [
    `Choisir la plus petite première étape de ${s}`,
    `Faire cette première étape`,
    `Trouver la prochaine petite étape de ${s}`,
    `Faire cette étape`,
    `S'arrêter, respirer, décider si continuer`,
  ],
  zh: (s) => [
    `挑出${s}最小的第一步`,
    `做那一步`,
    `找到${s}的下一个小区段`,
    `做那一步`,
    `停下，深呼吸，决定是否继续`,
  ],
};

const VERB_PATTERNS: Array<{
  match: RegExp;
  template: Record<Locale, (s: string) => string[]>;
}> = [
  {
    match: /\b(presentation|slides|deck|powerpoint|keynote|عرض|présentation|演示|幻灯)/i,
    template: PRESENTATION_TEMPLATES,
  },
  {
    match: /\b(essay|paper|report|write|article|draft|مقال|essay|rédaction|论文|文章|写)/i,
    template: ESSAY_TEMPLATES,
  },
  {
    match: /\b(email|e-mail|message|reply|respond|بريد|رسالة|mail|courriel|邮件|回复)/i,
    template: EMAIL_TEMPLATES,
  },
  {
    match: /\b(call|phone|ring|اتصال|appel|电话|打给)/i,
    template: CALL_TEMPLATES,
  },
];

/**
 * The deterministic suggest function.
 *
 * Input: a task title (and optional description).
 * Output: 3-6 sub-step suggestions.
 *
 * The suggestions are derived from the task text — never random.
 * Returns the array of steps, never persists anything.
 */
export function suggestBreakdown(args: {
  taskTitle: string;
  taskDescription?: string | null;
  locale: Locale;
}): BreakdownSuggestion {
  const { taskTitle, taskDescription, locale } = args;
  const haystack = `${taskTitle}\n${taskDescription ?? ""}`.toLowerCase();

  // Find the matching template — pick the first verb pattern that hits.
  // If none match, use the default template.
  const match = VERB_PATTERNS.find((p) => p.match.test(haystack));
  const template = match ? match.template[locale] : DEFAULT_TEMPLATES[locale];

  // The "subject" — we use the task title verbatim (trimmed). This makes
  // the suggestions feel specific to the user's actual task, without
  // fabricating content the user didn't provide.
  const subject = taskTitle.trim();

  // If the subject is empty (edge case: empty title — should be caught
  // by the upstream validation, but defensive), return an empty array.
  if (!subject) {
    return { steps: [], source: "deterministic" };
  }

  // Deduplicate (in case the template produces duplicates with the same subject).
  const steps = Array.from(new Set(template(subject)));

  return {
    steps,
    source: "deterministic",
  };
}

/**
 * Honest disclosure string used in the UI. We are NOT calling this "AI".
 * The label is locale-appropriate and tells the user the suggestions are
 * generated from a pattern, not a language model.
 */
export const BREAKDOWN_SOURCE_LABELS: Record<Locale, string> = {
  en: "Deterministic suggestion — review and edit before approving.",
  ar: "اقتراح حتمي — راجع وحرّر قبل الموافقة.",
  fr: "Suggestion déterministe — à vérifier et modifier avant approbation.",
  zh: "确定性建议 — 批准前请审查与编辑。",
};
