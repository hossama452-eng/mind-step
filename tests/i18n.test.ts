import { describe, it, expect } from "vitest";
import {
  locales,
  defaultLocale,
  localeDirection,
  getLocaleDirection,
  isLocale,
} from "@/i18n/locale";

describe("i18n locale foundation", () => {
  it("ships exactly 4 locales", () => {
    expect(locales).toEqual(["en", "ar", "fr", "zh"]);
  });
  it("defaults to English", () => {
    expect(defaultLocale).toBe("en");
  });
  it("marks Arabic as RTL and the rest as LTR", () => {
    expect(localeDirection.ar).toBe("rtl");
    expect(localeDirection.en).toBe("ltr");
    expect(localeDirection.fr).toBe("ltr");
    expect(localeDirection.zh).toBe("ltr");
  });
  it("getLocaleDirection returns the right direction", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
  });
});

describe("isLocale", () => {
  it("accepts a valid locale string", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("zh")).toBe(true);
  });
  it("rejects unknown locale strings", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
  });
  it("rejects non-string values", () => {
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(123)).toBe(false);
  });
});
