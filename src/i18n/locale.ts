/**
 * Shared i18n locale constants — safe to import from both client and server.
 * Do NOT add server-only imports (e.g., next/headers) here.
 */

export type Locale = "en" | "ar" | "fr" | "zh";

export const locales: Locale[] = ["en", "ar", "fr", "zh"];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  zh: "简体中文",
};

/**
 * RTL-aware locale metadata.
 * Arabic (`ar`) is right-to-left; the others are left-to-right.
 */
export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  en: "ltr",
  ar: "rtl",
  fr: "ltr",
  zh: "ltr",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as string[]).includes(value);
}

export function getLocaleDirection(locale: Locale): "rtl" | "ltr" {
  return localeDirection[locale];
}

export const LOCALE_COOKIE = "mindstep.locale";
