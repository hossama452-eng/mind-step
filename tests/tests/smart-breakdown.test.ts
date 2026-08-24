import { describe, it, expect } from "vitest";
import { suggestBreakdown, BREAKDOWN_SOURCE_LABELS } from "@/lib/smart-breakdown";
import type { Locale } from "@/i18n/locale";

describe("smart-breakdown — suggestBreakdown", () => {
  describe("presentation detection", () => {
    const testCases: Array<{ title: string; locale: Locale; expectedSubstring: string }> = [
      { title: "Prepare presentation for school meeting", locale: "en", expectedSubstring: "Gather existing material" },
      { title: "Create slides for the team meeting", locale: "en", expectedSubstring: "outline" },
      { title: "Build a deck for investors", locale: "en", expectedSubstring: "key information" },
    ];

    testCases.forEach(({ title, locale, expectedSubstring }) => {
      it(`detects "${title}" as a presentation task in ${locale}`, () => {
        const result = suggestBreakdown({ taskTitle: title, locale });
        expect(result.source).toBe("deterministic");
        expect(result.steps.length).toBeGreaterThan(0);
        expect(result.steps.some((s) => s.includes(expectedSubstring))).toBe(true);
      });
    });

    it("generates Arabic suggestions for an Arabic presentation title", () => {
      const result = suggestBreakdown({ taskTitle: "عرض تقديمي", locale: "ar" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
      // Arabic suggestions contain Arabic text.
      expect(result.steps.every((s) => /[\u0600-\u06FF]/.test(s))).toBe(true);
    });

    it("generates Chinese suggestions for a Chinese presentation title", () => {
      const result = suggestBreakdown({ taskTitle: "演示文稿", locale: "zh" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
      // Chinese suggestions contain Chinese text.
      expect(result.steps.every((s) => /[\u4e00-\u9fff]/.test(s))).toBe(true);
    });

    it("generates French suggestions for a French presentation title", () => {
      const result = suggestBreakdown({ taskTitle: "Présentation", locale: "fr" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
      // French suggestions contain accented characters.
      expect(result.steps.some((s) => s.includes("é") || s.includes("è"))).toBe(true);
    });
  });

  describe("essay detection", () => {
    it("detects 'essay' as a writing task", () => {
      const result = suggestBreakdown({ taskTitle: "Write essay on climate change", locale: "en" });
      expect(result.steps.some((s) => s.includes("opening paragraph"))).toBe(true);
    });

    it("detects 'paper' as a writing task", () => {
      const result = suggestBreakdown({ taskTitle: "Research paper on ADHD", locale: "en" });
      expect(result.steps.some((s) => s.includes("sources"))).toBe(true);
    });
  });

  describe("email detection", () => {
    it("detects 'email' as a communication task", () => {
      const result = suggestBreakdown({ taskTitle: "Email the school about attendance", locale: "en" });
      expect(result.steps.some((s) => s.includes("subject line"))).toBe(true);
    });
  });

  describe("call detection", () => {
    it("detects 'call' as a phone task", () => {
      const result = suggestBreakdown({ taskTitle: "Call the dentist", locale: "en" });
      expect(result.steps.some((s) => s.includes("quiet space") || s.includes("follow up"))).toBe(true);
    });
  });

  describe("default fallback", () => {
    it("uses the default template for unrecognized tasks", () => {
      const result = suggestBreakdown({ taskTitle: "Organize the garage", locale: "en" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.some((s) => s.includes("smallest first step"))).toBe(true);
    });
  });

  describe("edge cases (Prompt 04 §43)", () => {
    it("handles empty title gracefully — returns empty steps", () => {
      const result = suggestBreakdown({ taskTitle: "", locale: "en" });
      expect(result.steps).toEqual([]);
      expect(result.source).toBe("deterministic");
    });

    it("handles whitespace-only title gracefully — returns empty steps", () => {
      const result = suggestBreakdown({ taskTitle: "   ", locale: "en" });
      expect(result.steps).toEqual([]);
    });

    it("handles very long task title (no crash)", () => {
      const longTitle = "Prepare a very detailed and comprehensive presentation ".repeat(20);
      const result = suggestBreakdown({ taskTitle: longTitle, locale: "en" });
      expect(result.source).toBe("deterministic");
      // The subject in each step is the full long title — but no crash.
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("handles special characters in the task title", () => {
      const result = suggestBreakdown({ taskTitle: "Email Sam \"the boss\" <sam@boss.com> (re: Q3!)", locale: "en" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("handles Unicode emoji in the task title", () => {
      const result = suggestBreakdown({ taskTitle: "Prepare presentation 🎯 for school", locale: "en" });
      expect(result.source).toBe("deterministic");
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("is deterministic — same input always produces the same output", () => {
      const args = { taskTitle: "Prepare presentation for school meeting", locale: "en" as Locale };
      const result1 = suggestBreakdown(args);
      const result2 = suggestBreakdown(args);
      expect(result1).toEqual(result2);
    });

    it("deduplicates suggestions when the template produces duplicates", () => {
      // A contrived title that could trigger duplicates — the algorithm
      // deduplicates via `Array.from(new Set(...))`.
      const result = suggestBreakdown({ taskTitle: "Call call call", locale: "en" });
      const uniqueSteps = new Set(result.steps);
      expect(result.steps.length).toBe(uniqueSteps.size);
    });
  });

  describe("source label — never claims to be AI", () => {
    it("every locale has a non-empty source label", () => {
      for (const locale of ["en", "ar", "fr", "zh"] as Locale[]) {
        expect(BREAKDOWN_SOURCE_LABELS[locale].length).toBeGreaterThan(10);
      }
    });

    it("English label says 'Deterministic' — never 'AI'", () => {
      expect(BREAKDOWN_SOURCE_LABELS.en.toLowerCase()).toContain("deterministic");
      expect(BREAKDOWN_SOURCE_LABELS.en.toLowerCase()).not.toContain("ai-generated");
      expect(BREAKDOWN_SOURCE_LABELS.en.toLowerCase()).not.toContain("llm");
    });

    it("Arabic label says 'حتمي' — never claims AI", () => {
      expect(BREAKDOWN_SOURCE_LABELS.ar).toContain("حتمي");
      expect(BREAKDOWN_SOURCE_LABELS.ar).not.toContain("ذكاء اصطناعي");
    });

    it("the suggestBreakdown result always has source: 'deterministic'", () => {
      const result = suggestBreakdown({ taskTitle: "anything", locale: "en" });
      expect(result.source).toBe("deterministic");
    });
  });
});
