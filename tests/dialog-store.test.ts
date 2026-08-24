import { describe, it, expect, beforeEach } from "vitest";
import { useDialogStore } from "@/stores/dialog-store";

describe("useDialogStore", () => {
  beforeEach(() => {
    useDialogStore.getState().closeDialog();
  });

  it("starts with no dialog open", () => {
    expect(useDialogStore.getState().open).toBeNull();
  });

  it("openDialog sets the open key and payload", () => {
    useDialogStore.getState().openDialog("iCantStart");
    expect(useDialogStore.getState().open).toBe("iCantStart");
  });

  it("openDialog accepts a payload (initialTaskId) for startFocus", () => {
    useDialogStore.getState().openDialog("startFocus", { initialTaskId: "task-abc" });
    expect(useDialogStore.getState().open).toBe("startFocus");
    expect(useDialogStore.getState().payload?.initialTaskId).toBe("task-abc");
  });

  it("closeDialog clears both open and payload", () => {
    useDialogStore.getState().openDialog("resetMyDay", { initialTaskId: "x" });
    useDialogStore.getState().closeDialog();
    expect(useDialogStore.getState().open).toBeNull();
    expect(useDialogStore.getState().payload).toBeUndefined();
  });

  it("reopening a dialog replaces the previous state", () => {
    useDialogStore.getState().openDialog("quickCapture");
    expect(useDialogStore.getState().open).toBe("quickCapture");
    useDialogStore.getState().openDialog("iCantStart");
    expect(useDialogStore.getState().open).toBe("iCantStart");
    expect(useDialogStore.getState().payload).toEqual({});
  });
});
