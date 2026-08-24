"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Timestamp-based focus timer hook.
 *
 * ARCHITECTURE (Prompt 05 §7, §8):
 *   - The source of truth is `startedAt + plannedMinutes - accumulatedPausedMs`.
 *   - The UI tick (every 1s) only updates the DISPLAY — it does NOT own the
 *     remaining time.
 *   - `remainingMs` is calculated from `now - startedAt - accumulatedPausedMs`
 *     each tick, so it survives:
 *       - browser throttling (the next tick recalculates from real time)
 *       - tab switching (visibility change recalculates)
 *       - device sleep (recalculates from real elapsed time)
 *       - timer drift (no cumulative error from setInterval)
 *
 * REFRESH RECOVERY (Prompt 05 §9):
 *   - On mount, the hook recalculates from the persisted session timestamps.
 *   - No duplicate sessions — the session was created server-side.
 *
 * TAB BACKGROUNDING (Prompt 05 §10):
 *   - On `visibilitychange`, the hook recalculates remainingMs immediately
 *     so the display is correct when the user returns.
 *   - The timer does NOT auto-pause on tab hide — it continues based on
 *     real timestamps. Only the user can explicitly pause.
 */

export interface FocusSessionData {
  id: string;
  startedAt: string;   // ISO
  plannedMinutes: number;
  pausedAt: string | null;  // ISO, null when running
  accumulatedPausedMs: number;
  status: "active" | "paused" | "completed" | "cancelled";
}

export interface FocusTimerState {
  /** Remaining milliseconds. Recalculated from timestamps each tick. */
  remainingMs: number;
  /** Total planned milliseconds. */
  totalMs: number;
  /** Elapsed milliseconds (totalMs - remainingMs). */
  elapsedMs: number;
  /** Fraction completed (0..1). */
  fraction: number;
  /** Whether the timer has reached zero. */
  isExpired: boolean;
  /** Whether the timer is currently running (not paused, not expired). */
  isRunning: boolean;
  /** Human-readable MM:SS display. Always LTR even in RTL locales. */
  display: string;
  /** Minutes remaining (rounded up for display). */
  remainingMinutes: number;
}

/**
 * Calculate remainingMs from session timestamps.
 * This is the pure function that is the "source of truth" for the timer.
 *
 * When running (pausedAt is null):
 *   remainingMs = plannedMs - (now - startedAt - accumulatedPausedMs)
 *
 * When paused (pausedAt is set):
 *   remainingMs = plannedMs - (pausedAt - startedAt - accumulatedPausedMs)
 *   (The clock stops at the moment of pause.)
 */
export function calculateRemainingMs(
  session: FocusSessionData,
  now: Date = new Date()
): number {
  const plannedMs = session.plannedMinutes * 60 * 1000;
  const startedAtMs = new Date(session.startedAt).getTime();

  let referenceTime: number;
  if (session.pausedAt && session.status === "paused") {
    referenceTime = new Date(session.pausedAt).getTime();
  } else {
    referenceTime = now.getTime();
  }

  const elapsedMs = referenceTime - startedAtMs - session.accumulatedPausedMs;
  const remaining = plannedMs - elapsedMs;
  return Math.max(0, remaining);
}

/**
 * Format milliseconds as MM:SS for display.
 * Always LTR — even in Arabic, the timer numbers should not be reversed
 * (Prompt 05 §51).
 */
export function formatTimerDisplay(remainingMs: number): string {
  const totalSec = Math.floor(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * The main timer hook. Pass it a FocusSessionData (from the API) and it
 * returns the current timer state, recalculated every second from real
 * timestamps.
 *
 * Usage:
 *   const { remainingMs, display, isExpired, isRunning } = useFocusTimer(session);
 */
export function useFocusTimer(session: FocusSessionData | null): FocusTimerState {
  const [now, setNow] = useState(() => Date.now());

  // Tick every 1 second — but only the display tick; the source of truth
  // is always the timestamp calculation.
  useEffect(() => {
    if (!session || session.status === "completed" || session.status === "cancelled") {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [session?.id, session?.status]);

  // Recalculate immediately on visibility change (Prompt 05 §10).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!session) {
    return {
      remainingMs: 0,
      totalMs: 0,
      elapsedMs: 0,
      fraction: 0,
      isExpired: false,
      isRunning: false,
      display: "00:00",
      remainingMinutes: 0,
    };
  }

  const nowDate = new Date(now);
  const remainingMs = calculateRemainingMs(session, nowDate);
  const totalMs = session.plannedMinutes * 60 * 1000;
  const elapsedMs = Math.max(0, totalMs - remainingMs);
  const fraction = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;
  const isExpired = remainingMs <= 0;
  const isRunning = session.status === "active" && !isExpired;

  return {
    remainingMs,
    totalMs,
    elapsedMs,
    fraction,
    isExpired,
    isRunning,
    display: formatTimerDisplay(remainingMs),
    remainingMinutes: Math.ceil(remainingMs / 60000),
  };
}
