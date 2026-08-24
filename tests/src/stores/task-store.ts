"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side task store for the foundation phase.
 *
 * Phase 2 of the project will replace this with server-backed CRUD endpoints
 * (authenticated, scoped by userId). Until then, tasks live in localStorage
 * so the signature UX flows (I Can't Start, Reset My Day, Start Focus,
 * Quick Capture) work end-to-end without auth.
 *
 * The shape mirrors the Prisma `Task` model so the migration to the
 * server-backed store is a drop-in replacement.
 */

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskEnergy = "low" | "medium" | "high";
/**
 * New task lifecycle per Prompt 04 §2.
 *
 * Legacy values `todo`, `done`, `snoozed` are kept as part of the union
 * for backward-compatibility with localStorage data persisted in earlier
 * phases. They map to the new lifecycle as:
 *   todo       → inbox
 *   done       → completed
 *   snoozed    → planned (moved to tomorrow)
 *
 * The store automatically normalizes legacy values on read.
 */
export type TaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "completed"
  | "archived"
  // Legacy values — mapped on read.
  | "todo"
  | "done"
  | "snoozed";

/** Map legacy status values to the new lifecycle. */
function normalizeStatus(status: TaskStatus): TaskStatus {
  switch (status) {
    case "todo":
      return "inbox";
    case "done":
      return "completed";
    case "snoozed":
      return "planned";
    default:
      return status;
  }
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  energy: TaskEnergy;
  status: TaskStatus;
  dueAt?: string | null;     // ISO date string
  projectId?: string | null;
  projectTitle?: string;
  subtaskCount?: number;
  subtaskDone?: number;
  /** When true, this task was created via the I-Can't-Start tiny-step flow. */
  isTinyStep?: boolean;
  createdAt: string;
  updatedAt: string;
  /** When true, this task has been "dropped" via Reset My Day. */
  archived?: boolean;
  /** When true, this task has been moved to tomorrow via Reset My Day. */
  snoozed?: boolean;
}

interface TaskState {
  tasks: Task[];
  addTask: (input: Partial<Task> & Pick<Task, "title">) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  startTask: (id: string) => void;            // set status -> in_progress
  resetDay: (keepIds: string[], moveIds: string[], dropIds: string[]) => void;
  clearArchived: () => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],

      addTask: (input) => {
        const trimmed = input.title.trim();
        // Reject empty / whitespace-only titles — never create a task
        // without a real title. Return an empty string id so the caller
        // can detect the no-op.
        if (!trimmed) return "";
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const task: Task = {
          id,
          title: trimmed,
          notes: input.notes ?? undefined,
          priority: input.priority ?? "normal",
          energy: input.energy ?? "medium",
          // New tasks default to `inbox` — the user can plan/complete later.
          status: normalizeStatus(input.status ?? "inbox"),
          dueAt: input.dueAt ?? null,
          projectId: input.projectId ?? null,
          projectTitle: input.projectTitle,
          subtaskCount: input.subtaskCount,
          subtaskDone: input.subtaskDone,
          isTinyStep: input.isTinyStep,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ tasks: [task, ...state.tasks] }));
        return id;
      },

      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...patch,
                  status: patch.status ? normalizeStatus(patch.status) : t.status,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        })),

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  // toggleTask toggles between completed and the previous
                  // non-completed state (per Prompt 04 §8).
                  status: normalizeStatus(t.status) === "completed" ? "inbox" : "completed",
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      startTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: "in_progress", updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      resetDay: (keepIds, moveIds, dropIds) =>
        set((state) => {
          const ids = new Set([...keepIds, ...moveIds, ...dropIds]);
          return {
            tasks: state.tasks.map((t) => {
              if (!ids.has(t.id)) return t;
              return {
                ...t,
                // "Drop" = archived lifecycle state.
                archived: dropIds.includes(t.id) ? true : t.archived,
                status: dropIds.includes(t.id) ? "archived" : normalizeStatus(t.status),
                // "Move" = planned (snoozed) lifecycle state.
                snoozed: moveIds.includes(t.id) ? true : false,
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      clearArchived: () =>
        set((state) => ({ tasks: state.tasks.filter((t) => !t.archived) })),
    }),
    {
      name: "mindstep.tasks",
      // Re-validate on hydration — never trust persisted client state blindly.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TaskState>;
        const tasks = Array.isArray(p.tasks)
          ? p.tasks
              .filter(isValidTask)
              .map((t) => ({ ...t, status: normalizeStatus(t.status) }))
          : current.tasks;
        return { ...current, tasks };
      },
    }
  )
);

function isValidTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    ["low", "normal", "high", "urgent"].includes(t.priority as string) &&
    ["low", "medium", "high"].includes(t.energy as string) &&
    [
      "inbox",
      "planned",
      "in_progress",
      "completed",
      "archived",
      // Legacy values — accepted for backward compat, normalized on read.
      "todo",
      "done",
      "snoozed",
    ].includes(t.status as string) &&
    typeof t.createdAt === "string"
  );
}
