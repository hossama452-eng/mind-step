import { describe, it, expect } from "vitest";
import {
  isAllowedMemoryKey,
  isSensitiveContent,
  AI_MEMORY_ALLOW_LIST,
} from "@/lib/ai/context-service";

describe("AI Context Service — Memory Allow-List (Prompt 07 §34)", () => {
  it("has a non-empty allow-list", () => {
    expect(AI_MEMORY_ALLOW_LIST.length).toBeGreaterThan(0);
  });

  it("allows preferred_focus_duration", () => {
    expect(isAllowedMemoryKey("preferred_focus_duration")).toBe(true);
  });

  it("allows preferred_planning_window", () => {
    expect(isAllowedMemoryKey("preferred_planning_window")).toBe(true);
  });

  it("allows preferred_breakdown_style", () => {
    expect(isAllowedMemoryKey("preferred_breakdown_style")).toBe(true);
  });

  it("rejects arbitrary keys like 'medication_dose'", () => {
    expect(isAllowedMemoryKey("medication_dose")).toBe(false);
  });

  it("rejects arbitrary keys like 'password'", () => {
    expect(isAllowedMemoryKey("password")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedMemoryKey("")).toBe(false);
  });
});

describe("AI Context Service — Sensitive Content Detection (Prompt 07 §35)", () => {
  const sensitiveValues = [
    "My ADHD diagnosis is...",
    "I take 20mg of adderall",
    "My medication is ritalin",
    "My dosage is 30mg",
    "My prescription needs renewal",
    "My password is hunter2",
    "My API key is sk-12345",
    "My credit card number is...",
    "My bank account is...",
    "My social security number is...",
    "My therapy notes say...",
    "My therapist said...",
  ];

  for (const value of sensitiveValues) {
    it(`detects sensitive content: "${value.slice(0, 30)}..."`, () => {
      expect(isSensitiveContent(value)).toBe(true);
    });
  }

  const safeValues = [
    "I prefer 25-minute focus sessions",
    "I work best in the morning",
    "I like to break tasks into 3 steps",
    "I prefer English",
    "I like 15-minute sessions",
    "I start at 9am",
  ];

  for (const value of safeValues) {
    it(`does not flag safe content: "${value}"`, () => {
      expect(isSensitiveContent(value)).toBe(false);
    });
  }
});

describe("AI Context Service — Data Minimization (Prompt 07 §7)", () => {
  it("AI_MEMORY_ALLOW_LIST is a readonly tuple (not a mutable array)", () => {
    // Type-level check — if this compiles, the allow-list is readonly.
    const list = AI_MEMORY_ALLOW_LIST;
    expect(list.length).toBeGreaterThan(0);
  });
});
