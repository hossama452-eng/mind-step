import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  type Locale,
  locales,
  defaultLocale,
  localeNames,
  isLocale,
  LOCALE_COOKIE,
} from "./locale";
import type { Dictionary } from "./schema";

// Static imports — Turbopack can resolve these at build time.
import enMessages from "./messages/en.json";
import arMessages from "./messages/ar.json";
import frMessages from "./messages/fr.json";
import zhMessages from "./messages/zh.json";

// Each message file is typed against `Dictionary` at compile time.
// If any locale is missing a key or has the wrong shape, `tsc --noEmit`
// will fail. This is the type-safety contract required by Prompt 03 §3.
const messageMap: Record<Locale, Dictionary> = {
  en: enMessages as Dictionary,
  ar: arMessages as Dictionary,
  fr: frMessages as Dictionary,
  zh: zhMessages as Dictionary,
};

/**
 * Resolve the user's locale from, in priority order:
 *   1. The `mindstep.locale` cookie (set by the LanguageSwitcher POST endpoint)
 *   2. The `Accept-Language` HTTP header (for first-time visitors with no cookie)
 *   3. The default locale (English)
 *
 * The cookie is the persistent preference (survives reload, navigation, logout,
 * browser reopen — see Prompt 03 §11). The Accept-Language fallback ensures
 * first-paint locale is correct for brand-new visitors (Prompt 03 §12).
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  // Accept-Language fallback — used only when no cookie is set.
  const headerStore = await headers();
  const acceptLang = headerStore.get("accept-language");
  if (acceptLang) {
    const parsed = parseAcceptLanguage(acceptLang);
    for (const tag of parsed) {
      const short = tag.split("-")[0].toLowerCase();
      if (isLocale(short)) return short as Locale;
    }
  }

  return defaultLocale;
}

/**
 * Parse an Accept-Language header into ordered locale tags.
 * Spec: https://www.rfc-editor.org/rfc/rfc9110#field.accept-language
 */
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

/**
 * next-intl request config — server-side only.
 * Reads the locale from a cookie (or Accept-Language header for first-time
 * visitors) and loads the corresponding Dictionary.
 *
 * This file MUST NOT be imported from any client component — it
 * depends on next/headers which is server-only.
 */
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  if (!locales.includes(locale)) notFound();

  return {
    locale,
    messages: messageMap[locale],
  };
});

// Re-export the shared constants so existing imports keep working
// without coupling client components to next/headers.
export {
  type Locale,
  locales,
  defaultLocale,
  localeNames,
  localeDirection,
  isLocale,
  getLocaleDirection,
  LOCALE_COOKIE,
} from "./locale";

export type { Dictionary } from "./schema";
