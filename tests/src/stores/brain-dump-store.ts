"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side brain dump store — mirrors the Prisma `BrainDump` model shape
 * so the migration to server-backed CRUD is a drop-in.
 *
 * The Quick Capture dialog and the Brain Dump section both write here.
 */

export type BrainDumpCategory = "task" | "idea" | "reminder" | "uncategorized";

export interface BrainDumpEntry {
  id: string;
  content: string;
  category: BrainDumpCategory;
  createdAt: string;
  /** When true, this entry came from the global Quick Capture shortcut. */
  quickCapture?: boolean;
  /** When set, this entry has been processed into a Task. */
  processedTaskId?: string | null;
}

interface BrainDumpState {
  entries: BrainDumpEntry[];
  addEntry: (content: string, opts?: { quickCapture?: boolean; category?: BrainDumpCategory }) => string;
  setCategory: (id: string, category: BrainDumpCategory) => void;
  deleteEntry: (id: string) => void;
  clearAll: () => void;
}

export const useBrainDumpStore = create<BrainDumpState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (content, opts) => {
        const trimmed = content.trim();
        if (!trimmed) return "";
        const entry: BrainDumpEntry = {
          id: crypto.randomUUID(),
          content: trimmed,
          category: opts?.category ?? "uncategorized",
          createdAt: new Date().toISOString(),
          quickCapture: opts?.quickCapture,
        };
        set((state) => ({ entries: [entry, ...state.entries] }));
        return entry.id;
      },

      setCategory: (id, category) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, category } : e)),
        })),

      deleteEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      clearAll: () => set({ entries: [] }),
    }),
    {
      name: "mindstep.brain-dump",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BrainDumpState>;
        const entries = Array.isArray(p.entries) ? p.entries.filter(isValidEntry) : current.entries;
        return { ...current, entries };
      },
    }
  )
);

function isValidEntry(value: unknown): value is BrainDumpEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.content === "string" &&
    ["task", "idea", "reminder", "uncategorized"].includes(e.category as string) &&
    typeof e.createdAt === "string"
  );
}
