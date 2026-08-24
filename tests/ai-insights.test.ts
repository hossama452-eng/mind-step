import { describe, it, expect } from "vitest";
import { generateInsights, type InsightInput } from "@/lib/ai/insights";

function makeInput(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    focusSessions: [],
    tasks: [],
    energyEntries: [],
    ...overrides,
  };
}

describe("Personal Insights — Zero Data (Prompt 07 §30)", () => {
  it("returns 'not enough activity' when there is zero data", () => {
    const insights = generateInsights(makeInput());
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].body).toContain("Not enough activity");
  });
});

describe("Personal Insights — Insufficient Data (Prompt 07 §30, §31)", () => {
  it("returns insufficient-data message for 1-2 focus sessions (< 3 threshold)", () => {
    const insights = generateInsights(makeInput({
      focusSessions: [
        { actualMinutes: 15, plannedMinutes: 25, startedAt: new Date(), taskId: "t1" },
      ],
    }));
    const insufficient = insights.find((i) => i.id === "focus-insufficient");
    expect(insufficient).toBeDefined();
    expect(insufficient!.body).toContain("Not enough focus data");
    expect(insufficient!.body).toContain("1 completed session");
  });

  it("returns insufficient-data message for 1-4 completed tasks (< 5 threshold)", () => {
    const insights = generateInsights(makeInput({
      tasks: [
        { status: "completed", estimateMinutes: 25, actualMinutes: 20, createdAt: new Date(), completedAt: new Date() },
      ],
    }));
    const insufficient = insights.find((i) => i.id === "task-insufficient");
    expect(insufficient).toBeDefined();
    expect(insufficient!.body).toContain("Not enough task data");
  });

  it("returns insufficient-data message for 1-4 energy entries (< 5 threshold)", () => {
    const insights = generateInsights(makeInput({
      energyEntries: [
        { level: 3, timestamp: new Date() },
      ],
    }));
    const insufficient = insights.find((i) => i.id === "energy-insufficient");
    expect(insufficient).toBeDefined();
    expect(insufficient!.body).toContain("Not enough energy data");
  });
});

describe("Personal Insights — Sufficient Data (Prompt 07 §29)", () => {
  it("generates focus pattern with 3+ sessions", () => {
    const insights = generateInsights(makeInput({
      focusSessions: [
        { actualMinutes: 20, plannedMinutes: 25, startedAt: new Date(), taskId: "t1" },
        { actualMinutes: 22, plannedMinutes: 25, startedAt: new Date(), taskId: "t2" },
        { actualMinutes: 18, plannedMinutes: 25, startedAt: new Date(), taskId: "t3" },
      ],
    }));
    const focusInsight = insights.find((i) => i.id === "focus-average");
    expect(focusInsight).toBeDefined();
    expect(focusInsight!.body).toContain("average focus session");
    expect(focusInsight!.body).toContain("20"); // avg of 20+22+18
  });

  it("generates weekly celebration with sessions this week", () => {
    const now = new Date();
    const insights = generateInsights(makeInput({
      focusSessions: [
        { actualMinutes: 25, plannedMinutes: 25, startedAt: now, taskId: "t1" },
        { actualMinutes: 30, plannedMinutes: 30, startedAt: now, taskId: "t2" },
        { actualMinutes: 15, plannedMinutes: 15, startedAt: now, taskId: "t3" },
      ],
    }));
    const weekInsight = insights.find((i) => i.id === "focus-week");
    expect(weekInsight).toBeDefined();
    expect(weekInsight!.body).toContain("70"); // 25+30+15
    expect(weekInsight!.body).toContain("3 sessions");
  });

  it("generates task pattern with 5+ completed tasks", () => {
    const insights = generateInsights(makeInput({
      tasks: Array.from({ length: 6 }, (_, i) => ({
        status: "completed",
        estimateMinutes: 10 + i * 5,
        actualMinutes: 10 + i * 3,
        createdAt: new Date(),
        completedAt: new Date(),
      })),
    }));
    const taskInsight = insights.find((i) => i.id === "task-avg-estimate");
    expect(taskInsight).toBeDefined();
    expect(taskInsight!.body).toContain("average estimate");
  });

  it("generates energy pattern with 5+ entries", () => {
    const now = new Date();
    const insights = generateInsights(makeInput({
      energyEntries: [
        { level: 4, timestamp: now },
        { level: 3, timestamp: now },
        { level: 4, timestamp: now },
        { level: 3, timestamp: now },
        { level: 4, timestamp: now },
        { level: 5, timestamp: now }, // recent high
      ],
    }));
    // Should detect either rising, low, or nothing (depending on avg).
    const energyInsights = insights.filter((i) => i.id.startsWith("energy-"));
    expect(energyInsights.length).toBeGreaterThan(0);
  });
});

describe("Personal Insights — Never Fabricates (Prompt 07 §30)", () => {
  it("never returns more than a few insights", () => {
    const insights = generateInsights(makeInput({
      focusSessions: Array.from({ length: 10 }, (_, i) => ({
        actualMinutes: 20 + i,
        plannedMinutes: 25,
        startedAt: new Date(),
        taskId: `t${i}`,
      })),
    }));
    expect(insights.length).toBeLessThanOrEqual(6);
  });

  it("all insight bodies are non-empty strings", () => {
    const insights = generateInsights(makeInput({
      focusSessions: Array.from({ length: 3 }, () => ({
        actualMinutes: 20,
        plannedMinutes: 25,
        startedAt: new Date(),
        taskId: "t1",
      })),
    }));
    for (const insight of insights) {
      expect(insight.body.length).toBeGreaterThan(10);
      expect(insight.title.length).toBeGreaterThan(3);
    }
  });
});
