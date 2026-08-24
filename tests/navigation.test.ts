import { describe, it, expect } from "vitest";
import { NAV_SECTIONS, sectionByKey, SECTION_GROUPS } from "@/lib/navigation";

describe("navigation map", () => {
  it("contains the foundation sections", () => {
    const keys = NAV_SECTIONS.map((s) => s.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("tasks");
    expect(keys).toContain("brainDump");
    expect(keys).toContain("focus");
    expect(keys).toContain("habits");
    expect(keys).toContain("ai");
    expect(keys).toContain("settings");
    expect(keys).toContain("privacy");
    expect(keys).toContain("help");
    expect(keys).toContain("energy");
  });

  it("every section has a unique key", () => {
    const keys = NAV_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every section has an icon name", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.icon).toBeTruthy();
      expect(typeof section.icon).toBe("string");
    }
  });

  it("every section has a group that exists in SECTION_GROUPS", () => {
    const groups = new Set(SECTION_GROUPS);
    for (const section of NAV_SECTIONS) {
      expect(groups.has(section.group)).toBe(true);
    }
  });

  it("implemented sections include the foundation Phase 1 set", () => {
    const implemented = NAV_SECTIONS.filter((s) => s.implemented).map((s) => s.key);
    expect(implemented).toContain("dashboard");
    expect(implemented).toContain("tasks");
    expect(implemented).toContain("focus");
    expect(implemented).toContain("ai");
    expect(implemented).toContain("settings");
  });

  it("sectionByKey returns the section or undefined", () => {
    expect(sectionByKey("dashboard")?.implemented).toBe(true);
    expect(sectionByKey("nonexistent" as never)).toBeUndefined();
  });
});
