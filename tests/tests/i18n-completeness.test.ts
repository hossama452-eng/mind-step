import { describe, it, expect } from "vitest";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";
import fr from "@/i18n/messages/fr.json";
import zh from "@/i18n/messages/zh.json";

/**
 * Ensures every locale has the same set of i18n keys.
 * If a key exists in `en.json`, it must exist in ar/fr/zh too —
 * otherwise next-intl will throw MISSING_MESSAGE at runtime.
 *
 * This test prevents the regression we hit in Phase 02 where
 * `nav.sleep`, `nav.energy`, and `nav.insights` were missing.
 */

type JSON = Record<string, unknown>;

function flatKeys(obj: JSON, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatKeys(v as JSON, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

const locales: Array<[string, JSON]> = [
  ["en", en as JSON],
  ["ar", ar as JSON],
  ["fr", fr as JSON],
  ["zh", zh as JSON],
];

describe("i18n message completeness", () => {
  const enKeys = new Set(flatKeys(en as JSON));

  it.each(locales)("%s locale has every key present in en", (name, dict) => {
    const keys = new Set(flatKeys(dict));
    const missing = Array.from(enKeys).filter((k) => !keys.has(k));
    expect(missing, `${name} is missing keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("the foundation keys are present in every locale", () => {
    const required = [
      "app.name",
      "app.tagline",
      "nav.dashboard",
      "nav.tasks",
      "nav.focus",
      "nav.ai",
      "nav.settings",
      "common.loading",
      "common.error",
      "common.retry",
      "common.save",
      "common.cancel",
      "common.delete",
      "common.close",
      "common.add",
      "theme.light",
      "theme.dark",
      "theme.system",
      "language.label",
      "dashboard.hero.whatMattersNow",
      "dashboard.hero.subtitle",
      "dashboard.hero.greeting.morning",
      "dashboard.hero.greeting.afternoon",
      "dashboard.hero.greeting.evening",
      "dashboard.hero.greeting.night",
      "dashboard.sections.adhdSupport",
      "dashboard.sections.topPriorities",
      "dashboard.sections.reminders",
      "dashboard.sections.progress",
      "dashboard.sections.energyCheck",
      "dashboard.adhdCards.iCantStart.title",
      "dashboard.adhdCards.resetMyDay.title",
      "dashboard.stats.tasksDone",
      "dashboard.stats.focusMinutes",
      "signature.iCantStart.title",
      "signature.iCantStart.step1Body",
      "signature.iCantStart.step4Action",
      "signature.resetMyDay.title",
      "signature.resetMyDay.keep",
      "signature.resetMyDay.move",
      "signature.resetMyDay.drop",
      "signature.startFocus.title",
      "signature.startFocus.begin",
      "signature.quickCapture.title",
      "signature.quickCapture.placeholder",
      "signature.quickCapture.shortcut",
      "tasks.title",
      "tasks.empty",
      "tasks.priority.low",
      "tasks.priority.normal",
      "tasks.priority.high",
      "tasks.priority.urgent",
      "focus.title",
      "focus.startSession",
      "habits.title",
      "habits.empty",
      "energy.title",
      "energy.levels.1",
      "energy.levels.2",
      "energy.levels.3",
      "energy.levels.4",
      "energy.levels.5",
      "energy.levelDescription.1",
      "energy.levelDescription.5",
      "reminders.title",
      "reminders.empty",
      "reminders.overdue",
      "progress.title",
      "progress.tasksCompleted",
      "progress.motivations.firstStep",
      "progress.motivations.rest",
      "ai.title",
      "ai.placeholder",
      "ai.welcome",
      "disclaimer.notMedical",
      "footer.tagline",
    ];
    for (const [name, dict] of locales) {
      const keys = new Set(flatKeys(dict));
      const missing = required.filter((k) => !keys.has(k));
      expect(missing, `${name} is missing foundation keys: ${missing.join(", ")}`).toEqual([]);
    }
  });
});
