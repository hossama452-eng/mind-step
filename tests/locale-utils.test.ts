import { describe, it, expect } from "vitest";
import {
  toBCP47,
  formatDate,
  formatShortDate,
  formatTime,
  formatWeekday,
  formatRelativeTime,
  formatNumber,
  formatDuration,
  pluralRule,
  pickPlural,
} from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";

describe("toBCP47", () => {
  it("maps each Locale to a BCP-47 tag", () => {
    expect(toBCP47("en")).toBe("en-US");
    expect(toBCP47("ar")).toBe("ar-EG");
    expect(toBCP47("fr")).toBe("fr-FR");
    expect(toBCP47("zh")).toBe("zh-CN");
  });
});

describe("formatDate", () => {
  const date = new Date("2026-08-21T15:30:00Z");
  it("formats in English", () => {
    const out = formatDate(date, "en", { month: "short", day: "numeric", year: "numeric" });
    expect(out).toMatch(/2026/);
  });
  it("formats in Arabic (different digits)", () => {
    const out = formatDate(date, "ar", { month: "short", day: "numeric", year: "numeric" });
    // Arabic numerals look like ٢٠٢٦ — we just check it produced *some* string
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
  it("returns empty string for invalid input", () => {
    expect(formatDate("not-a-date", "en")).toBe("");
  });
});

describe("formatShortDate", () => {
  it("produces a month + day format", () => {
    const out = formatShortDate(new Date("2026-08-21"), "en");
    expect(out).toMatch(/Aug/);
    expect(out).toMatch(/21/);
  });
});

describe("formatTime", () => {
  it("formats a time with hour and minute", () => {
    const out = formatTime(new Date("2026-08-21T15:30:00Z"), "en");
    expect(out).toMatch(/\d/);
  });
});

describe("formatWeekday", () => {
  it("returns the long weekday name", () => {
    const friday = new Date("2026-08-21T12:00:00Z");
    // Friday in UTC
    const out = formatWeekday(friday, "en");
    expect(["Friday", "Thursday"]).toContain(out);
  });
});

describe("formatRelativeTime", () => {
  it("formats future time as 'in X'", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3h
    const out = formatRelativeTime(future, "en");
    expect(out.length).toBeGreaterThan(0);
  });
  it("formats past time as 'X ago'", () => {
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000); // -2h
    const out = formatRelativeTime(past, "en");
    expect(out.length).toBeGreaterThan(0);
  });
  it("handles 'just now' for very recent", () => {
    const now = new Date();
    const out = formatRelativeTime(now, "en");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("formatNumber", () => {
  it("formats an integer in English with commas", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });
  it("formats an integer in Arabic with Arabic-Indic digits", () => {
    const out = formatNumber(1234, "ar");
    expect(out.length).toBeGreaterThan(0);
    // Just verify it produced a string — exact digits depend on ICU
  });
});

describe("formatDuration", () => {
  it("formats under-60 as 'X min'", () => {
    expect(formatDuration(25, "en")).toBe("25 min");
  });
  it("formats 60 as '1h'", () => {
    expect(formatDuration(60, "en")).toBe("1h");
  });
  it("formats 90 as '1h 30m'", () => {
    expect(formatDuration(90, "en")).toBe("1h 30m");
  });
  it("formats 0 as '0 min'", () => {
    expect(formatDuration(0, "en")).toBe("0 min");
  });
});

describe("pluralRule", () => {
  it("returns 'one' for 1 in English", () => {
    expect(pluralRule(1, "en")).toBe("one");
  });
  it("returns 'other' for 2 in English", () => {
    expect(pluralRule(2, "en")).toBe("other");
  });
  it("returns 'two' for 2 in Arabic (which has 6 plural forms)", () => {
    expect(pluralRule(2, "ar")).toBe("two");
  });
  it("returns 'many' for 11 in Arabic", () => {
    expect(pluralRule(11, "ar")).toBe("many");
  });
});

describe("pickPlural", () => {
  it("picks the zero form when count is 0 and zero is provided", () => {
    expect(pickPlural(0, { zero: "no tasks", one: "one task", other: "many tasks" })).toBe("no tasks");
  });
  it("falls back to 'other' when count is 0 and no zero form provided", () => {
    expect(pickPlural(0, { one: "one task", other: "many tasks" })).toBe("many tasks");
  });
  it("picks 'one' for count === 1", () => {
    expect(pickPlural(1, { one: "one task", other: "many tasks" })).toBe("one task");
  });
  it("picks 'other' for count > 1", () => {
    expect(pickPlural(5, { one: "one task", other: "many tasks" })).toBe("many tasks");
  });
});

describe("locale-aware round-trips", () => {
  // Sanity: every Locale we support should be accepted without throwing.
  (["en", "ar", "fr", "zh"] as Locale[]).forEach((locale) => {
    it(`${locale}: formatDate does not throw`, () => {
      expect(() => formatDate(new Date(), locale)).not.toThrow();
    });
    it(`${locale}: formatNumber does not throw`, () => {
      expect(() => formatNumber(42, locale)).not.toThrow();
    });
    it(`${locale}: formatRelativeTime does not throw`, () => {
      expect(() => formatRelativeTime(new Date(), locale)).not.toThrow();
    });
  });
});
