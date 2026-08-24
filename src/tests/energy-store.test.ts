import { describe, it, expect, beforeEach } from "vitest";
import { useEnergyStore } from "@/stores/energy-store";

describe("useEnergyStore", () => {
  beforeEach(() => {
    useEnergyStore.setState({ entries: [] });
  });

  it("starts empty", () => {
    expect(useEnergyStore.getState().entries).toEqual([]);
  });

  it("addEntry accepts levels 1..5", () => {
    useEnergyStore.getState().addEntry(1);
    useEnergyStore.getState().addEntry(2);
    useEnergyStore.getState().addEntry(3);
    useEnergyStore.getState().addEntry(4);
    useEnergyStore.getState().addEntry(5);
    expect(useEnergyStore.getState().entries.length).toBe(5);
  });

  it("addEntry prepends (most recent first)", () => {
    useEnergyStore.getState().addEntry(3);
    useEnergyStore.getState().addEntry(5);
    const entries = useEnergyStore.getState().entries;
    expect(entries[0].level).toBe(5);
    expect(entries[1].level).toBe(3);
  });

  it("addEntry trims notes and stores undefined if blank", () => {
    useEnergyStore.getState().addEntry(4, "   ");
    expect(useEnergyStore.getState().entries[0].note).toBeUndefined();
  });

  it("addEntry stores a real note", () => {
    useEnergyStore.getState().addEntry(4, "After coffee");
    expect(useEnergyStore.getState().entries[0].note).toBe("After coffee");
  });

  it("deleteEntry removes an entry", () => {
    const id = useEnergyStore.getState().addEntry(3);
    useEnergyStore.getState().deleteEntry(id);
    expect(useEnergyStore.getState().entries.length).toBe(0);
  });

  it("caps entries at 200 (anti-bloat)", () => {
    for (let i = 0; i < 250; i++) useEnergyStore.getState().addEntry(((i % 5) + 1) as 1 | 2 | 3 | 4 | 5);
    expect(useEnergyStore.getState().entries.length).toBe(200);
  });
});
