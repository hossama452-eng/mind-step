import type { Locale } from "@/i18n/locale";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/locale";

/**
 * Locale-aware formatting utilities built on the standard Intl API.
 * Never concatenate localized strings manually — use these instead.
 *
 * The locale is resolved from the cookie at request time on the server
 * (see src/i18n/request.ts) and from the NextIntlClientProvider on the
 * client. These helpers accept an explicit `locale` argument so they
 * are pure and testable.
 */

const LOCALE_BCP47: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-EG",
  fr: "fr-FR",
  zh: "zh-CN",
};

/** Convert our Locale code to the BCP-47 tag Intl expects. */
export function toBCP47(locale: Locale): string {
  return LOCALE_BCP47[locale];
}

// ---------- dates ----------

interface DateFormatOptions {
  weekday?: "narrow" | "short" | "long";
  year?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "narrow" | "short" | "long";
  day?: "numeric" | "2-digit";
}

/**
 * Format a date in the user's locale.
 * Falls back to ISO if Intl is unavailable (e.g., during SSR).
 */
export function formatDate(
  date: Date | string | number,
  locale: Locale,
  options: DateFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(toBCP47(locale), options).format(d);
  } catch {
    return "";
  }
}

/** Compact date: "Aug 21". */
export function formatShortDate(date: Date | string | number, locale: Locale): string {
  return formatDate(date, locale, { month: "short", day: "numeric" });
}

/** Time: "3:45 PM". */
export function formatTime(date: Date | string | number, locale: Locale): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(toBCP47(locale), {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/** Weekday: "Friday". */
export function formatWeekday(date: Date | string | number, locale: Locale): string {
  return formatDate(date, locale, { weekday: "long" });
}

// ---------- relative time ----------

/**
 * Format a date as a relative phrase: "in 3 days", "2 hours ago".
 * Uses Intl.RelativeTimeFormat. Falls back to absolute date.
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale: Locale,
  now: Date = new Date()
): string {
  try {
    const target = date instanceof Date ? date : new Date(date);
    const deltaMs = target.getTime() - now.getTime();
    const deltaSec = Math.round(deltaMs / 1000);
    const absSec = Math.abs(deltaSec);

    const units: Array<{
      unit: Intl.RelativeTimeFormatUnit;
      sec: number;
    }> = [
      { unit: "second", sec: 60 },
      { unit: "minute", sec: 60 * 60 },
      { unit: "hour", sec: 60 * 60 * 24 },
      { unit: "day", sec: 60 * 60 * 24 * 7 },
      { unit: "week", sec: 60 * 60 * 24 * 30 },
      { unit: "month", sec: 60 * 60 * 24 * 365 },
      { unit: "year", sec: Infinity },
    ];

    const rtf = new Intl.RelativeTimeFormat(toBCP47(locale), { numeric: "auto" });
    for (const { unit, sec } of units) {
      if (absSec < sec) {
        const divisor =
          unit === "second"
            ? 1
            : unit === "minute"
            ? 60
            : unit === "hour"
            ? 60 * 60
            : unit === "day"
            ? 60 * 60 * 24
            : unit === "week"
            ? 60 * 60 * 24 * 7
            : unit === "month"
            ? 60 * 60 * 24 * 30
            : 60 * 60 * 24 * 365;
        return rtf.format(Math.round(deltaSec / divisor), unit);
      }
    }
    return rtf.format(Math.round(deltaSec / (60 * 60 * 24 * 365)), "year");
  } catch {
    return formatDate(date, locale);
  }
}

// ---------- numbers ----------

/** Format a number in the user's locale. */
export function formatNumber(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(toBCP47(locale)).format(value);
  } catch {
    return String(value);
  }
}

/** Format a duration in minutes as "1h 25m" (localized). */
export function formatDuration(minutes: number, locale: Locale): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) {
    // locale-specific plural "minutes" — using Intl for "min" unit
    try {
      const rtf = new Intl.NumberFormat(toBCP47(locale));
      return `${rtf.format(m)} min`;
    } catch {
      return `${m} min`;
    }
  }
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${rest}m`;
}

// ---------- pluralization ----------

/**
 * Locale-aware plural helper. Selects the right plural form for `count`.
 *
 * @example
 *   plural(1, en)  // "one"
 *   plural(2, en)  // "other"
 *   plural(2, ar)  // "two"  (Arabic has 6 forms)
 */
export function pluralRule(count: number, locale: Locale): string {
  try {
    const pluralRules = new Intl.PluralRules(toBCP47(locale));
    return pluralRules.select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

/**
 * Plural formatter that picks one of three forms based on count:
 *   - `one`  when count === 1
 *   - `other` when count !== 1
 *   - `zero` when count === 0 (optional — falls back to other if not provided)
 *
 * Use this when next-intl plural tags are not flexible enough.
 * Prefer next-intl's native plurals when possible.
 */
export function pickPlural<T>(
  count: number,
  forms: { zero?: T; one: T; other: T }
): T {
  if (count === 0 && forms.zero != null) return forms.zero;
  if (count === 1) return forms.one;
  return forms.other;
}

// ---------- locale resolution from NextRequest ----------

/**
 * Resolve the user's locale from a NextRequest, mirroring the cookie-based
 * resolution in src/i18n/request.ts. API routes use this to localize
 * computed responses (e.g., insights, weekly reviews).
 *
 * Priority:
 *   1. The `mindstep.locale` cookie (if present and valid).
 *   2. The `Accept-Language` header (for first-time API callers).
 *   3. The default locale ("en").
 */
export function getLocaleFromRequest(req: NextRequest): Locale {
  // 1. Cookie
  const cookieValue = req.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieValue && isLocaleValue(cookieValue)) return cookieValue as Locale;

  // 2. Accept-Language
  const acceptLang = req.headers.get("accept-language");
  if (acceptLang) {
    const parsed = parseAcceptLanguage(acceptLang);
    for (const tag of parsed) {
      const short = tag.split("-")[0].toLowerCase();
      if (isLocaleValue(short)) return short as Locale;
    }
  }

  // 3. Default
  return "en";
}

function isLocaleValue(value: string | undefined): boolean {
  if (!value) return false;
  return ["en", "ar", "fr", "zh"].includes(value);
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}
