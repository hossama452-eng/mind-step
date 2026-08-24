import { describe, it, expect } from "vitest";
import { calculateRemainingMs, formatTimerDisplay, type FocusSessionData } from "@/hooks/use-focus-timer";

/**
 * Tests for the timestamp-based focus timer.
 * The timer's source of truth is `calculateRemainingMs()` — a pure function.
 * The React hook is a thin wrapper around it.
 */

function makeSession(overrides: Partial<FocusSessionData> = {}): FocusSessionData {
  return {
    id: "test-session-1",
    startedAt: new Date("2026-08-21T10:00:00Z").toISOString(),
    plannedMinutes: 25,
    pausedAt: null,
    accumulatedPausedMs: 0,
    status: "active",
    ...overrides,
  };
}

describe("calculateRemainingMs — basic calculation", () => {
  it("returns full planned time at start", () => {
    const session = makeSession();
    const now = new Date("2026-08-21T10:00:00Z"); // same as startedAt
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(25 * 60 * 1000); // 25 min in ms
  });

  it("decreases as time passes", () => {
    const session = makeSession();
    const now = new Date("2026-08-21T10:05:00Z"); // 5 min later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(20 * 60 * 1000); // 20 min remaining
  });

  it("reaches zero at planned end", () => {
    const session = makeSession();
    const now = new Date("2026-08-21T10:25:00Z"); // 25 min later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(0);
  });

  it("clamps to zero after expiry (never negative)", () => {
    const session = makeSession();
    const now = new Date("2026-08-21T10:30:00Z"); // 30 min later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateRemainingMs — paused state", () => {
  it("stops counting when paused", () => {
    const session = makeSession({
      status: "paused",
      pausedAt: new Date("2026-08-21T10:10:00Z").toISOString(), // paused 10 min after start
    });
    // Check at 15 min after start — timer should show 15 min remaining (paused at 10 min elapsed)
    const now = new Date("2026-08-21T10:15:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(15 * 60 * 1000); // 25 - 10 = 15 min
  });

  it("accounts for accumulated paused time after resume", () => {
    const session = makeSession({
      status: "active",
      accumulatedPausedMs: 5 * 60 * 1000, // 5 min of total pause time
      pausedAt: null,
    });
    // 15 min after start, with 5 min paused
    // elapsed active time = 15 - 5 = 10 min
    // remaining = 25 - 10 = 15 min
    const now = new Date("2026-08-21T10:15:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(15 * 60 * 1000);
  });

  it("handles multiple pause/resume cycles", () => {
    // Start at 10:00, pause at 10:05 (5 min elapsed), resume at 10:10 (5 min paused),
    // pause again at 10:15 (15 min total active = 5 + 10), resume at 10:20 (5 more min paused = 10 total)
    const session = makeSession({
      status: "active",
      accumulatedPausedMs: 10 * 60 * 1000, // 10 min of total pause time
      pausedAt: null,
    });
    // At 10:30 (30 min since start, 10 min paused = 20 min active)
    // remaining = 25 - 20 = 5 min
    const now = new Date("2026-08-21T10:30:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(5 * 60 * 1000);
  });
});

describe("calculateRemainingMs — edge cases", () => {
  it("handles 1-minute session (ultra-low-friction)", () => {
    const session = makeSession({ plannedMinutes: 1 });
    const now = new Date("2026-08-21T10:00:30Z"); // 30 sec later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(30 * 1000); // 30 sec remaining
  });

  it("handles 90-minute flow session", () => {
    const session = makeSession({ plannedMinutes: 90 });
    const now = new Date("2026-08-21T10:00:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(90 * 60 * 1000);
  });

  it("handles zero planned minutes (edge case)", () => {
    const session = makeSession({ plannedMinutes: 0 });
    const now = new Date("2026-08-21T10:00:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(0);
  });

  it("never returns negative", () => {
    const session = makeSession({ plannedMinutes: 5 });
    const now = new Date("2026-08-21T11:00:00Z"); // 1 hour later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateRemainingMs — browser throttling survival", () => {
  it("recalculates correctly after a long gap (simulating tab throttling)", () => {
    const session = makeSession({ plannedMinutes: 10 });
    // Simulate: start at 10:00, no tick for 7 min (tab was throttled),
    // then recalculate at 10:07
    const now = new Date("2026-08-21T10:07:00Z");
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(3 * 60 * 1000); // 3 min remaining
  });

  it("is NOT affected by setInterval drift — only by real timestamps", () => {
    // The timer source of truth is the timestamp calculation, not a counter.
    // Even if setInterval fires late 100 times, the remaining time is correct.
    const session = makeSession({ plannedMinutes: 10 });
    const now = new Date("2026-08-21T10:09:30Z"); // 9.5 min later
    const remaining = calculateRemainingMs(session, now);
    expect(remaining).toBe(30 * 1000); // 30 sec remaining
  });
});

describe("calculateRemainingMs — completed/cancelled sessions", () => {
  it("returns 0 for a completed session", () => {
    const session = makeSession({ status: "completed" });
    const remaining = calculateRemainingMs(session, new Date());
    expect(remaining).toBe(0);
  });

  it("returns 0 for a cancelled session", () => {
    const session = makeSession({ status: "cancelled" });
    const remaining = calculateRemainingMs(session, new Date());
    expect(remaining).toBe(0);
  });
});

describe("formatTimerDisplay", () => {
  it("formats MM:SS correctly for 25 minutes", () => {
    expect(formatTimerDisplay(25 * 60 * 1000)).toBe("25:00");
  });

  it("formats 5 minutes correctly", () => {
    expect(formatTimerDisplay(5 * 60 * 1000)).toBe("05:00");
  });

  it("formats 90 seconds as 01:30", () => {
    expect(formatTimerDisplay(90 * 1000)).toBe("01:30");
  });

  it("formats 0 as 00:00", () => {
    expect(formatTimerDisplay(0)).toBe("00:00");
  });

  it("formats 500ms as 00:00 (rounds down to 0 sec)", () => {
    expect(formatTimerDisplay(500)).toBe("00:00");
  });

  it("formats 999ms as 00:00 (rounds down to 0 sec)", () => {
    expect(formatTimerDisplay(999)).toBe("00:00");
  });

  it("formats 1000ms as 00:01", () => {
    expect(formatTimerDisplay(1000)).toBe("00:01");
  });

  it("formats 59999ms as 00:59", () => {
    expect(formatTimerDisplay(59999)).toBe("00:59");
  });

  it("is always LTR — no RTL reversal of numbers (Prompt 05 §51)", () => {
    // The display string is always digits + colon — no RTL marks needed.
    const display = formatTimerDisplay(25 * 60 * 1000);
    // Should start with a digit, not with any RTL mark.
    expect(display[0]).toMatch(/\d/);
    // Should contain exactly one colon.
    expect(display.split(":").length).toBe(2);
  });
});

describe("timer accuracy — determinism", () => {
  it("same session + same timestamp always produces the same remaining time", () => {
    const session = makeSession({ plannedMinutes: 15 });
    const now = new Date("2026-08-21T10:07:30Z");
    const r1 = calculateRemainingMs(session, now);
    const r2 = calculateRemainingMs(session, now);
    expect(r1).toBe(r2);
  });

  it("is monotonic — remaining decreases as time advances", () => {
    const session = makeSession({ plannedMinutes: 10 });
    const t1 = new Date("2026-08-21T10:00:00Z");
    const t2 = new Date("2026-08-21T10:01:00Z");
    const t3 = new Date("2026-08-21T10:02:00Z");
    const r1 = calculateRemainingMs(session, t1);
    const r2 = calculateRemainingMs(session, t2);
    const r3 = calculateRemainingMs(session, t3);
    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
    // Each step is exactly 60 seconds = 60000 ms.
    expect(r1 - r2).toBe(60000);
    expect(r2 - r3).toBe(60000);
  });
});
