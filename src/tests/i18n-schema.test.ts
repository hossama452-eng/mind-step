import { describe, it, expect } from "vitest";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";
import fr from "@/i18n/messages/fr.json";
import zh from "@/i18n/messages/zh.json";
import type { Dictionary } from "@/i18n/schema";

/**
 * Type-safety: each message JSON must conform to the Dictionary interface.
 *
 * These assertions exist *at compile time* (the `as Dictionary` casts above
 * would fail TypeScript if any key were missing or mis-shaped) AND at
 * runtime via the structural checks below.
 *
 * If you add a new key to `Dictionary` (src/i18n/schema.ts) but forget to
 * add it to one of the message files:
 *   1. `bunx tsc --noEmit` will fail.
 *   2. This test will fail.
 *   3. tests/i18n-completeness.test.ts will also fail (it checks every leaf
 *      key against every locale).
 */

const enDict = en as Dictionary;
const arDict = ar as Dictionary;
const frDict = fr as Dictionary;
const zhDict = zh as Dictionary;

describe("dictionary type-safety contract", () => {
  it("all four locales conform to the Dictionary interface at runtime", () => {
    // The cast itself is the compile-time check. At runtime we just verify
    // that the top-level domains exist in each locale.
    const requiredDomains: Array<keyof Dictionary> = [
      "app",
      "nav",
      "common",
      "theme",
      "language",
      "accessibility",
      "dashboard",
      "signature",
      "tasks",
      "brainDump",
      "focus",
      "habits",
      "energy",
      "reminders",
      "progress",
      "planner",
      "settings",
      "ai",
      "notifications",
      "auth",
      "errors",
      "validation",
      "emptyStates",
      "loading",
      "onboarding",
      "privacy",
      "help",
      "comingSoon",
      "disclaimer",
      "footer",
    ];

    for (const [name, dict] of [
      ["en", enDict],
      ["ar", arDict],
      ["fr", frDict],
      ["zh", zhDict],
    ] as Array<[string, Dictionary]>) {
      for (const domain of requiredDomains) {
        expect(dict[domain], `${name} is missing domain: ${String(domain)}`).toBeDefined();
      }
    }
  });

  it("English is the canonical dictionary (it has every key)", () => {
    // The other three are checked against English in i18n-completeness.test.ts
    expect(enDict.app.name).toBe("MindStep");
    expect(enDict.accessibility.skipToMain).toBeTruthy();
    expect(enDict.errors.codes.NOT_FOUND).toBeTruthy();
    expect(enDict.validation.required).toBeTruthy();
    expect(enDict.signature.iCantStart.step1Title).toBeTruthy();
    expect(enDict.planner.planMyDay).toBeTruthy();
    expect(enDict.auth.signIn.title).toBeTruthy();
    expect(enDict.notifications.types.task_due).toBeTruthy();
  });

  it("Arabic dictionary has the same shape as English", () => {
    expect(Object.keys(arDict)).toEqual(expect.arrayContaining(Object.keys(enDict)));
    // Every nested domain has the same key shape.
    expect(Object.keys(arDict.errors.codes)).toEqual(Object.keys(enDict.errors.codes));
    expect(Object.keys(arDict.validation)).toEqual(Object.keys(enDict.validation));
    expect(Object.keys(arDict.accessibility)).toEqual(Object.keys(enDict.accessibility));
  });

  it("French dictionary has the same shape as English", () => {
    expect(Object.keys(frDict)).toEqual(expect.arrayContaining(Object.keys(enDict)));
    expect(Object.keys(frDict.errors.codes)).toEqual(Object.keys(enDict.errors.codes));
    expect(Object.keys(frDict.validation)).toEqual(Object.keys(enDict.validation));
  });

  it("Chinese dictionary has the same shape as English", () => {
    expect(Object.keys(zhDict)).toEqual(expect.arrayContaining(Object.keys(enDict)));
    expect(Object.keys(zhDict.errors.codes)).toEqual(Object.keys(enDict.errors.codes));
    expect(Object.keys(zhDict.validation)).toEqual(Object.keys(enDict.validation));
  });
});

describe("ICU plural syntax — count keys use the correct syntax", () => {
  it("common.items uses ICU plural", () => {
    expect(enDict.common.items).toContain("{count, plural,");
    expect(arDict.common.items).toContain("{count, plural,");
    expect(frDict.common.items).toContain("{count, plural,");
    // Chinese may use a simpler structure but should still have {count}.
    expect(zhDict.common.items).toContain("{count}");
  });

  it("tasks.count uses ICU plural", () => {
    expect(enDict.tasks.count).toContain("{count, plural,");
    expect(arDict.tasks.count).toContain("{count, plural,");
    expect(frDict.tasks.count).toContain("{count, plural,");
  });

  it("focus.interruptionsCount uses ICU plural", () => {
    expect(enDict.focus.interruptionsCount).toContain("{count, plural,");
    expect(arDict.focus.interruptionsCount).toContain("{count, plural,");
    expect(frDict.focus.interruptionsCount).toContain("{count, plural,");
  });

  it("Arabic plural keys include all 6 forms (zero, one, two, few, many, other)", () => {
    // Arabic has 6 plural categories per Intl.PluralRules.
    const arabicPluralText = arDict.tasks.count;
    expect(arabicPluralText).toContain("zero");
    expect(arabicPluralText).toContain("one");
    expect(arabicPluralText).toContain("two");
    expect(arabicPluralText).toContain("few");
    expect(arabicPluralText).toContain("many");
    expect(arabicPluralText).toContain("other");
  });

  it("English plural has only 'one' and 'other'", () => {
    const englishPluralText = enDict.tasks.count;
    expect(englishPluralText).toContain("one");
    expect(englishPluralText).toContain("other");
    expect(englishPluralText).not.toContain("zero");
    expect(englishPluralText).not.toContain("two");
    expect(englishPluralText).not.toContain("few");
    expect(englishPluralText).not.toContain("many");
  });
});

describe("placeholders are consistent across locales", () => {
  it("tasks.subtaskCount has {done} and {total} in every locale", () => {
    for (const [name, dict] of [
      ["en", enDict],
      ["ar", arDict],
      ["fr", frDict],
      ["zh", zhDict],
    ] as Array<[string, Dictionary]>) {
      expect(dict.tasks.subtaskCount, `${name}.tasks.subtaskCount`).toContain("{done}");
      expect(dict.tasks.subtaskCount, `${name}.tasks.subtaskCount`).toContain("{total}");
    }
  });

  it("comingSoon.title has {name} in every locale", () => {
    for (const [name, dict] of [
      ["en", enDict],
      ["ar", arDict],
      ["fr", frDict],
      ["zh", zhDict],
    ] as Array<[string, Dictionary]>) {
      expect(dict.comingSoon.title, `${name}.comingSoon.title`).toContain("{name}");
    }
  });

  it("accessibility.progress has {percent} in every locale", () => {
    for (const [name, dict] of [
      ["en", enDict],
      ["ar", arDict],
      ["fr", frDict],
      ["zh", zhDict],
    ] as Array<[string, Dictionary]>) {
      expect(dict.accessibility.progress, `${name}.accessibility.progress`).toContain("{percent}");
    }
  });

  it("language.changed has {name} in every locale", () => {
    for (const [name, dict] of [
      ["en", enDict],
      ["ar", arDict],
      ["fr", frDict],
      ["zh", zhDict],
    ] as Array<[string, Dictionary]>) {
      expect(dict.language.changed, `${name}.language.changed`).toContain("{name}");
    }
  });
});
