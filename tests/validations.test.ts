import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  createBrainDumpSchema,
  createHabitSchema,
  startFocusSessionSchema,
  createDistractionSchema,
  createAIMessageSchema,
  verifyPiPaymentSchema,
  emailSchema,
  themeSchema,
  textScaleSchema,
} from "@/lib/validations";

describe("emailSchema", () => {
  it("lowercases and trims", () => {
    expect(emailSchema.parse("  Hello@World.COM  ")).toBe("hello@world.com");
  });
  it("rejects invalid email", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
  it("rejects email longer than 254 chars", () => {
    expect(() => emailSchema.parse("a".repeat(250) + "@x.com")).toThrow();
  });
});

describe("themeSchema / textScaleSchema", () => {
  it("accepts valid theme values", () => {
    expect(themeSchema.parse("light")).toBe("light");
    expect(themeSchema.parse("dark")).toBe("dark");
    expect(themeSchema.parse("system")).toBe("system");
  });
  it("rejects invalid theme", () => {
    expect(() => themeSchema.parse("purple")).toThrow();
  });
  it("accepts valid text scales", () => {
    expect(textScaleSchema.parse("small")).toBe("small");
    expect(textScaleSchema.parse("xlarge")).toBe("xlarge");
  });
  it("rejects invalid text scale", () => {
    expect(() => textScaleSchema.parse("medium")).toThrow();
  });
});

describe("createTaskSchema", () => {
  it("applies defaults for a minimal task", () => {
    const parsed = createTaskSchema.parse({ title: "Email Sam" });
    expect(parsed.title).toBe("Email Sam");
    expect(parsed.priority).toBe("normal");
    expect(parsed.energy).toBe("medium");
  });
  it("rejects empty title", () => {
    expect(() => createTaskSchema.parse({ title: "   " })).toThrow();
  });
  it("rejects title longer than 200 chars", () => {
    expect(() => createTaskSchema.parse({ title: "x".repeat(201) })).toThrow();
  });
  it("accepts a fully-populated task", () => {
    const parsed = createTaskSchema.parse({
      title: "Submit report",
      notes: "Quarterly review",
      priority: "high",
      energy: "high",
      estimateMinutes: 90,
      dueAt: new Date().toISOString(),
      projectId: "ck" + "a".repeat(20) + "z",
    });
    expect(parsed.priority).toBe("high");
    expect(parsed.estimateMinutes).toBe(90);
  });
  it("rejects invalid priority", () => {
    expect(() => createTaskSchema.parse({ title: "x", priority: "critical" })).toThrow();
  });
  it("rejects estimate outside 1..480", () => {
    expect(() => createTaskSchema.parse({ title: "x", estimateMinutes: 600 })).toThrow();
  });
});

describe("createBrainDumpSchema", () => {
  it("applies uncategorized default", () => {
    const parsed = createBrainDumpSchema.parse({ content: "Random thought" });
    expect(parsed.category).toBe("uncategorized");
  });
  it("rejects content longer than 1000", () => {
    expect(() => createBrainDumpSchema.parse({ content: "x".repeat(1001) })).toThrow();
  });
});

describe("createHabitSchema", () => {
  it("applies daily frequency default", () => {
    const parsed = createHabitSchema.parse({ name: "Stretch" });
    expect(parsed.frequency).toBe("daily");
    expect(parsed.color).toBe("#7c9885");
  });
  it("rejects invalid hex color", () => {
    expect(() => createHabitSchema.parse({ name: "x", color: "purple" })).toThrow();
  });
});

describe("startFocusSessionSchema", () => {
  it("rejects planned minutes below 1", () => {
    expect(() => startFocusSessionSchema.parse({ plannedMinutes: 0 })).toThrow();
  });
  it("rejects planned minutes above 480", () => {
    expect(() => startFocusSessionSchema.parse({ plannedMinutes: 500 })).toThrow();
  });
  it("accepts a 25-minute session", () => {
    const parsed = startFocusSessionSchema.parse({ plannedMinutes: 25 });
    expect(parsed.plannedMinutes).toBe(25);
    expect(parsed.taskId).toBeUndefined();
  });
  it("accepts a 5-minute session (Prompt 05 minimum)", () => {
    const parsed = startFocusSessionSchema.parse({ plannedMinutes: 5 });
    expect(parsed.plannedMinutes).toBe(5);
  });
  it("accepts a 1-minute session (ultra-low-friction)", () => {
    const parsed = startFocusSessionSchema.parse({ plannedMinutes: 1 });
    expect(parsed.plannedMinutes).toBe(1);
  });
});

describe("createDistractionSchema", () => {
  it("defaults to thought category", () => {
    const parsed = createDistractionSchema.parse({ content: "checking twitter" });
    expect(parsed.category).toBe("thought");
  });
  it("rejects content over 500", () => {
    expect(() => createDistractionSchema.parse({ content: "x".repeat(501) })).toThrow();
  });
});

describe("createAIMessageSchema", () => {
  it("rejects empty content", () => {
    expect(() => createAIMessageSchema.parse({ conversationId: "ck" + "a".repeat(20) + "z", content: "" })).toThrow();
  });
  it("rejects content over 4000", () => {
    expect(() =>
      createAIMessageSchema.parse({
        conversationId: "ck" + "a".repeat(20) + "z",
        content: "x".repeat(4001),
      })
    ).toThrow();
  });
});

describe("verifyPiPaymentSchema", () => {
  it("accepts a well-formed payment", () => {
    const parsed = verifyPiPaymentSchema.parse({
      paymentId: "PAY-123",
      piPaymentId: "PI-123",
      amount: 3.14,
      product: "MindStep Premium Monthly",
    });
    expect(parsed.amount).toBe(3.14);
  });
  it("rejects zero or negative amounts", () => {
    expect(() =>
      verifyPiPaymentSchema.parse({
        paymentId: "PAY-123",
        piPaymentId: "PI-123",
        amount: 0,
        product: "x",
      })
    ).toThrow();
  });
});
