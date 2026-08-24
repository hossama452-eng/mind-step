"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side focus session store — mirrors the Prisma `FocusSession` shape.
 *
 * Used by the FocusCard component, Focus section, and Start Focus sheet.
 * Sessions are appended on completion; the dashboard reads "today's"
 * focus minutes from this store.
 */

export type FocusSessionStatus = "active" | "completed" | "abandoned" | "interrupted";

export interface FocusSession {
  id: string;
  taskId?: string | null;
  taskTitle?: string;
  startedAt: string;     // ISO
  endedAt?: string | null;
  plannedMinutes: number;
  actualMinutes?: number;
  status: FocusSessionStatus;
  interruptions: number;
}

interface FocusState {
  sessions: FocusSession[];
  activeSessionId: string | null;
  /** Start a new session; returns the new id. */
  start: (input: { taskId?: string | null; taskTitle?: string; plannedMinutes: number }) => string;
  /** Mark a session as complete (or partial). */
  complete: (id: string, actualMinutes: number, interruptions: number) => void;
  /** Abandon an active session. */
  abandon: (id: string, actualMinutes: number, interruptions: number) => void;
  /** Sum of actual minutes from sessions that ended today. */
  todaysMinutes: () => number;
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      start: ({ taskId, taskTitle, plannedMinutes }) => {
        const id = crypto.randomUUID();
        const session: FocusSession = {
          id,
          taskId: taskId ?? null,
          taskTitle,
          startedAt: new Date().toISOString(),
          plannedMinutes,
          status: "active",
          interruptions: 0,
        };
        set((state) => ({
          sessions: [session, ...state.sessions].slice(0, 200),
          activeSessionId: id,
        }));
        return id;
      },

      complete: (id, actualMinutes, interruptions) => {
        const endedAt = new Date().toISOString();
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, status: "completed", endedAt, actualMinutes, interruptions }
              : s
          ),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        }));
      },

      abandon: (id, actualMinutes, interruptions) => {
        const endedAt = new Date().toISOString();
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, status: "abandoned", endedAt, actualMinutes, interruptions }
              : s
          ),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        }));
      },

      todaysMinutes: () => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const ts = startOfToday.getTime();
        return get()
          .sessions.filter((s) => s.endedAt && new Date(s.endedAt).getTime() >= ts)
          .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
      },
    }),
    {
      name: "mindstep.focus-sessions",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FocusState>;
        const sessions = Array.isArray(p.sessions) ? p.sessions.filter(isValidSession) : current.sessions;
        return { ...current, sessions, activeSessionId: null };
      },
    }
  )
);

function isValidSession(value: unknown): value is FocusSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.startedAt === "string" &&
    typeof s.plannedMinutes === "number" &&
    ["active", "completed", "abandoned", "interrupted"].includes(s.status as string)
  );
}
