import { describe, it, expect } from "vitest";
import {
  APP_NAME,
  APP_TAGLINE,
  MEDICAL_DISCLAIMER,
  FOCUS_PRESETS,
  AUDIT_ACTIONS,
  FEATURES,
  LIMITS,
  BRAND_COLORS,
  DEFAULT_FOCUS_MINUTES,
} from "@/lib/constants";

describe("APP_NAME / APP_TAGLINE", () => {
  it("has the right app name and tagline", () => {
    expect(APP_NAME).toBe("MindStep");
    expect(APP_TAGLINE).toBe("One Step. One Focus. One Day.");
  });
});

describe("MEDICAL_DISCLAIMER", () => {
  it("explicitly states MindStep is not a medical tool", () => {
    expect(MEDICAL_DISCLAIMER.toLowerCase()).toContain("not a medical");
    expect(MEDICAL_DISCLAIMER.toLowerCase()).toContain("diagnose adhd");
    expect(MEDICAL_DISCLAIMER.toLowerCase()).toContain("medication");
    expect(MEDICAL_DISCLAIMER.toLowerCase()).toContain("professional care");
  });
});

describe("FOCUS_PRESETS", () => {
  it("includes the standard Pomodoro 25-minute session", () => {
    expect(FOCUS_PRESETS.find((p) => p.minutes === 25)).toBeTruthy();
  });
  it("every preset has a unique key and a positive duration", () => {
    const keys = FOCUS_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of FOCUS_PRESETS) {
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.labelKey).toMatch(/^focus\.preset\./);
    }
  });
});

describe("AUDIT_ACTIONS", () => {
  it("uses dotted namespaced action codes", () => {
    expect(AUDIT_ACTIONS.TASK_CREATED).toBe("task.created");
    expect(AUDIT_ACTIONS.USER_SIGNED_IN).toBe("user.signed_in");
    expect(AUDIT_ACTIONS.PI_PAYMENT_VERIFIED).toBe("pi_payment.verified");
  });
});

describe("FEATURES flags", () => {
  it("auth is false in Phase 1 (anonymous foundation)", () => {
    expect(FEATURES.auth).toBe(false);
  });
  it("aiCoach is true (available immediately via z-ai-web-dev-sdk)", () => {
    expect(FEATURES.aiCoach).toBe(true);
  });
  it("piPayments is false (Phase 2)", () => {
    expect(FEATURES.piPayments).toBe(false);
  });
});

describe("LIMITS", () => {
  it("enforces reasonable max lengths", () => {
    expect(LIMITS.taskTitle).toBe(200);
    expect(LIMITS.brainDump).toBe(1000);
    expect(LIMITS.aiMessage).toBe(4000);
  });
});

describe("BRAND_COLORS", () => {
  it("uses the calm sage primary", () => {
    expect(BRAND_COLORS.sage).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("does NOT use indigo or blue", () => {
    const all = Object.values(BRAND_COLORS).join(" ").toLowerCase();
    expect(all).not.toContain("indigo");
    expect(all).not.toContain("blue");
  });
});

describe("DEFAULT_FOCUS_MINUTES", () => {
  it("defaults to 25 minutes (Pomodoro)", () => {
    expect(DEFAULT_FOCUS_MINUTES).toBe(25);
  });
});
