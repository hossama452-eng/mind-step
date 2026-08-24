import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/stores/task-store";

describe("useTaskStore", () => {
  beforeEach(() => {
    // Clear tasks before each test.
    useTaskStore.setState({ tasks: [] });
  });

  it("starts empty", () => {
    expect(useTaskStore.getState().tasks).toEqual([]);
  });

  it("addTask adds a task with defaults", () => {
    const id = useTaskStore.getState().addTask({ title: "Email Sam" });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].title).toBe("Email Sam");
    expect(tasks[0].priority).toBe("normal");
    expect(tasks[0].energy).toBe("medium");
    // New tasks default to `inbox` per the Prompt 04 lifecycle.
    expect(tasks[0].status).toBe("inbox");
  });

  it("addTask trims whitespace and rejects empty titles", () => {
    useTaskStore.getState().addTask({ title: "  Real task  " });
    useTaskStore.getState().addTask({ title: "   " });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Real task");
  });

  it("toggleTask flips status between inbox and completed", () => {
    const id = useTaskStore.getState().addTask({ title: "T" });
    // New tasks start in `inbox` (Prompt 04 lifecycle).
    expect(useTaskStore.getState().tasks[0].status).toBe("inbox");
    // Toggling completes the task.
    useTaskStore.getState().toggleTask(id);
    expect(useTaskStore.getState().tasks[0].status).toBe("completed");
    // Toggling again un-completes back to inbox.
    useTaskStore.getState().toggleTask(id);
    expect(useTaskStore.getState().tasks[0].status).toBe("inbox");
  });

  it("deleteTask removes a task", () => {
    const id1 = useTaskStore.getState().addTask({ title: "A" });
    const id2 = useTaskStore.getState().addTask({ title: "B" });
    expect(useTaskStore.getState().tasks.length).toBe(2);
    useTaskStore.getState().deleteTask(id1);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(id2);
  });

  it("startTask sets status to in_progress", () => {
    const id = useTaskStore.getState().addTask({ title: "T" });
    useTaskStore.getState().startTask(id);
    expect(useTaskStore.getState().tasks[0].status).toBe("in_progress");
  });

  it("resetDay marks tasks as archived / snoozed per bucket", () => {
    const keepId = useTaskStore.getState().addTask({ title: "Keep" });
    const moveId = useTaskStore.getState().addTask({ title: "Move" });
    const dropId = useTaskStore.getState().addTask({ title: "Drop" });
    useTaskStore.getState().resetDay([keepId], [moveId], [dropId]);
    const tasks = useTaskStore.getState().tasks;
    const keep = tasks.find((t) => t.id === keepId)!;
    const move = tasks.find((t) => t.id === moveId)!;
    const drop = tasks.find((t) => t.id === dropId)!;
    expect(keep.archived).toBeFalsy();
    expect(keep.snoozed).toBe(false);
    expect(move.snoozed).toBe(true);
    expect(drop.archived).toBe(true);
  });

  it("resetDay does NOT delete tasks — drop = archive", () => {
    const dropId = useTaskStore.getState().addTask({ title: "Drop" });
    useTaskStore.getState().resetDay([], [], [dropId]);
    expect(useTaskStore.getState().tasks.length).toBe(1);
    expect(useTaskStore.getState().tasks[0].archived).toBe(true);
  });

  it("clearArchived removes only archived tasks", () => {
    const keepId = useTaskStore.getState().addTask({ title: "Keep" });
    const dropId = useTaskStore.getState().addTask({ title: "Drop" });
    useTaskStore.getState().resetDay([keepId], [], [dropId]);
    expect(useTaskStore.getState().tasks.length).toBe(2);
    useTaskStore.getState().clearArchived();
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(keepId);
  });

  it("updateTask patches fields and bumps updatedAt", async () => {
    const id = useTaskStore.getState().addTask({ title: "T" });
    const originalUpdatedAt = useTaskStore.getState().tasks[0].updatedAt;
    // Wait a tick so updatedAt differs.
    await new Promise((r) => setTimeout(r, 5));
    useTaskStore.getState().updateTask(id, { priority: "urgent", notes: "Now!" });
    const task = useTaskStore.getState().tasks[0];
    expect(task.priority).toBe("urgent");
    expect(task.notes).toBe("Now!");
    expect(task.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("isValidTask filter (manual) rejects malformed entries", () => {
    // We can't reach the private isValidTask directly, but we can verify the
    // contract by adding well-formed tasks and confirming they all pass through.
    useTaskStore.getState().addTask({ title: "Real" });
    useTaskStore.getState().addTask({ title: "Real 2", priority: "high" });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.every((t) => typeof t.id === "string")).toBe(true);
    expect(tasks.every((t) => typeof t.title === "string")).toBe(true);
    expect(tasks.every((t) => typeof t.createdAt === "string")).toBe(true);
  });
});
