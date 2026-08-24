import { describe, it, expect, beforeEach } from "vitest";
import { useFocusStore } from "@/stores/focus-store";

describe("useFocusStore", () => {
  beforeEach(() => {
    useFocusStore.setState({ sessions: [], activeSessionId: null });
  });

  it("starts empty", () => {
    expect(useFocusStore.getState().sessions).toEqual([]);
    expect(useFocusStore.getState().activeSessionId).toBeNull();
  });

  it("start creates a session and sets activeSessionId", () => {
    const id = useFocusStore.getState().start({
      taskId: null,
      taskTitle: "Write essay",
      plannedMinutes: 25,
    });
    const state = useFocusStore.getState();
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].id).toBe(id);
    expect(state.sessions[0].status).toBe("active");
    expect(state.sessions[0].plannedMinutes).toBe(25);
    expect(state.sessions[0].taskTitle).toBe("Write essay");
    expect(state.activeSessionId).toBe(id);
  });

  it("complete sets status=completed and clears activeSessionId", () => {
    const id = useFocusStore.getState().start({ plannedMinutes: 5 });
    useFocusStore.getState().complete(id, 5, 2);
    const state = useFocusStore.getState();
    expect(state.sessions[0].status).toBe("completed");
    expect(state.sessions[0].actualMinutes).toBe(5);
    expect(state.sessions[0].interruptions).toBe(2);
    expect(state.activeSessionId).toBeNull();
  });

  it("abandon sets status=abandoned and clears activeSessionId", () => {
    const id = useFocusStore.getState().start({ plannedMinutes: 5 });
    useFocusStore.getState().abandon(id, 3, 1);
    const state = useFocusStore.getState();
    expect(state.sessions[0].status).toBe("abandoned");
    expect(state.sessions[0].actualMinutes).toBe(3);
    expect(state.activeSessionId).toBeNull();
  });

  it("complete on a non-active session leaves activeSessionId alone", () => {
    const aId = useFocusStore.getState().start({ plannedMinutes: 5 });
    useFocusStore.getState().complete(aId, 5, 0);
    const bId = useFocusStore.getState().start({ plannedMinutes: 10 });
    useFocusStore.getState().complete(bId, 10, 0);
    const state = useFocusStore.getState();
    expect(state.sessions.length).toBe(2);
    expect(state.activeSessionId).toBeNull();
    expect(state.sessions[0].status).toBe("completed");
    expect(state.sessions[1].status).toBe("completed");
  });

  it("todaysMinutes sums actualMinutes for sessions ended today", () => {
    const id1 = useFocusStore.getState().start({ plannedMinutes: 10 });
    useFocusStore.getState().complete(id1, 10, 0);
    const id2 = useFocusStore.getState().start({ plannedMinutes: 15 });
    useFocusStore.getState().complete(id2, 15, 0);
    expect(useFocusStore.getState().todaysMinutes()).toBe(25);
  });

  it("todaysMinutes ignores still-active sessions (no endedAt)", () => {
    useFocusStore.getState().start({ plannedMinutes: 30 });
    expect(useFocusStore.getState().todaysMinutes()).toBe(0);
  });
});
