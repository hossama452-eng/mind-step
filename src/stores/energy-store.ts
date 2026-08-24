"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side energy log store — mirrors the Prisma `EnergyEntry` shape.
 *
 * Used by the dashboard EnergyCheck component and the Energy section.
 */

export interface EnergyEntry {
  id: string;
  timestamp: string;   // ISO
  level: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

interface EnergyState {
  entries: EnergyEntry[];
  addEntry: (level: EnergyEntry["level"], note?: string) => string;
  deleteEntry: (id: string) => void;
  /** Most recent entry for "today's energy" display. */
  latest: () => EnergyEntry | null;
}

export const useEnergyStore = create<EnergyState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (level, note) => {
        const entry: EnergyEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level,
          note: note?.trim() || undefined,
        };
        set((state) => ({ entries: [entry, ...state.entries].slice(0, 200) }));
        return entry.id;
      },

      deleteEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      latest: () => get().entries[0] ?? null,
    }),
    {
      name: "mindstep.energy",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<EnergyState>;
        const entries = Array.isArray(p.entries) ? p.entries.filter(isValidEntry) : current.entries;
        return { ...current, entries };
      },
    }
  )
);

function isValidEntry(value: unknown): value is EnergyEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.timestamp === "string" &&
    [1, 2, 3, 4, 5].includes(e.level as number)
  );
}
