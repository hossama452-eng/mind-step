import { describe, it, expect } from "vitest";
import { z } from "zod";
import { makeZodErrorMap, parseWithI18n, localizeZodIssues } from "@/lib/zod-i18n";

/**
 * Mock translator — wraps the key in brackets so we can verify which key
 * the error map chose without depending on next-intl.
 */
const t = (key: string): string => `[${key}]`;

describe("makeZodErrorMap", () => {
  it("returns validation.required for invalid_type", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "invalid_type" }).message).toBe("[required]");
  });

  it("returns validation.tooShort for too_small with origin=string", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "too_small", origin: "string" }).message).toBe("[tooShort]");
  });

  it("returns validation.tooLong for too_big with origin=string", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "too_big", origin: "string" }).message).toBe("[tooLong]");
  });

  it("returns validation.email for invalid_string with validation=email", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "invalid_string", validation: "email" }).message).toBe("[email]");
    // Zod v4 renamed invalid_string → invalid_format
    expect(errorMap({ code: "invalid_format", validation: "email" }).message).toBe("[email]");
  });

  it("returns validation.invalidUrl for invalid_string with validation=url", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "invalid_string", validation: "url" }).message).toBe("[invalidUrl]");
  });

  it("returns validation.selectOption for invalid_enum_value", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "invalid_enum_value" }).message).toBe("[selectOption]");
  });

  it("preserves custom messages that look like i18n keys", () => {
    const errorMap = makeZodErrorMap(t);
    // A schema-set message that looks like an i18n key is preserved.
    expect(errorMap({ code: "invalid_type", message: "validation.required" }).message)
      .toBe("validation.required");
    // A schema-set message that does NOT look like an i18n key (e.g., raw
    // English text) is OVERRIDDEN by the localized version.
    expect(errorMap({ code: "invalid_type", message: "Default Zod text" }).message)
      .toBe("[required]");
  });

  it("falls back to validation.required for unknown issue codes", () => {
    const errorMap = makeZodErrorMap(t);
    expect(errorMap({ code: "made_up_code" }).message).toBe("[required]");
  });
});

describe("localizeZodIssues", () => {
  it("returns a flat { fieldPath: localized message } object", () => {
    const issues = [
      { code: "invalid_type", path: ["title"] },
      { code: "invalid_string", path: ["email"], validation: "email" },
    ];
    const errors = localizeZodIssues(issues, t);
    expect(errors.title).toBe("[required]");
    expect(errors.email).toBe("[email]");
  });

  it("uses _ as the path key when no path is present", () => {
    const issues = [{ code: "invalid_type" }];
    const errors = localizeZodIssues(issues, t);
    expect(errors._).toBe("[required]");
  });

  it("only keeps the first error per field path", () => {
    const issues = [
      { code: "invalid_type", path: ["title"] },
      { code: "too_small", path: ["title"], origin: "string" },
    ];
    const errors = localizeZodIssues(issues, t);
    expect(Object.keys(errors)).toEqual(["title"]);
    // First-wins.
    expect(errors.title).toBe("[required]");
  });
});

describe("parseWithI18n", () => {
  const schema = z.object({
    title: z.string().min(2),
    email: z.email(),
  });

  it("returns success + data when valid", () => {
    const result = parseWithI18n(schema, { title: "Hi there", email: "user@example.com" }, t);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Hi there");
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("returns errors keyed by field path when invalid", () => {
    const result = parseWithI18n(schema, { title: "a", email: "bad-email" }, t);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["title", "email"]));
      // Both fields got a localized message (some i18n key wrapped in brackets).
      expect(result.errors.title).toMatch(/^\[/);
      expect(result.errors.email).toMatch(/^\[/);
    }
  });

  it("falls back to identity translator if none provided", () => {
    const result = parseWithI18n(schema, { title: "a", email: "bad-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Some non-empty message was resolved.
      expect(result.errors.title.length).toBeGreaterThan(0);
    }
  });
});

describe("zod error map — never leaks internal exception details", () => {
  it("returns a localized key (never raw 'Expected X, received Y')", () => {
    const schema = z.object({ count: z.number() });
    const result = parseWithI18n(schema, { count: "not-a-number" }, t);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error message should be a localized key wrapped in brackets,
      // NEVER the raw Zod internal text like "Expected number, received string".
      expect(result.errors.count).toMatch(/^\[/);
      expect(result.errors.count).not.toContain("Expected");
      expect(result.errors.count).not.toContain("received");
      expect(result.errors.count).not.toContain("number");
      expect(result.errors.count).not.toContain("string");
    }
  });
});
