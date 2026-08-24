import { describe, it, expect, beforeEach } from "vitest";
import { useBrainDumpStore } from "@/stores/brain-dump-store";

describe("useBrainDumpStore", () => {
  beforeEach(() => {
    useBrainDumpStore.setState({ entries: [] });
  });

  it("starts empty", () => {
    expect(useBrainDumpStore.getState().entries).toEqual([]);
  });

  it("addEntry trims and prepends", () => {
    useBrainDumpStore.getState().addEntry("  Hello  ");
    useBrainDumpStore.getState().addEntry("World");
    const entries = useBrainDumpStore.getState().entries;
    expect(entries.length).toBe(2);
    // Most-recent first.
    expect(entries[0].content).toBe("World");
    expect(entries[1].content).toBe("Hello");
  });

  it("addEntry with empty content returns empty id", () => {
    const id = useBrainDumpStore.getState().addEntry("   ");
    expect(id).toBe("");
    expect(useBrainDumpStore.getState().entries.length).toBe(0);
  });

  it("addEntry marks quickCapture flag", () => {
    useBrainDumpStore.getState().addEntry("Captured", { quickCapture: true });
    expect(useBrainDumpStore.getState().entries[0].quickCapture).toBe(true);
  });

  it("setCategory updates the category", () => {
    const id = useBrainDumpStore.getState().addEntry("Note");
    useBrainDumpStore.getState().setCategory(id, "task");
    expect(useBrainDumpStore.getState().entries[0].category).toBe("task");
  });

  it("deleteEntry removes an entry", () => {
    const id = useBrainDumpStore.getState().addEntry("Note");
    useBrainDumpStore.getState().deleteEntry(id);
    expect(useBrainDumpStore.getState().entries.length).toBe(0);
  });

  it("clearAll empties the store", () => {
    useBrainDumpStore.getState().addEntry("A");
    useBrainDumpStore.getState().addEntry("B");
    useBrainDumpStore.getState().clearAll();
    expect(useBrainDumpStore.getState().entries.length).toBe(0);
  });
});
