import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/ui-store";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      activeSection: "dashboard",
      mobileSidebarOpen: false,
      sidebarCollapsed: false,
    });
  });

  it("defaults to dashboard", () => {
    expect(useUIStore.getState().activeSection).toBe("dashboard");
  });

  it("setActiveSection updates active section AND closes mobile sidebar", () => {
    useUIStore.getState().setMobileSidebarOpen(true);
    expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
    useUIStore.getState().setActiveSection("tasks");
    expect(useUIStore.getState().activeSection).toBe("tasks");
    expect(useUIStore.getState().mobileSidebarOpen).toBe(false);
  });

  it("toggleSidebar flips sidebarCollapsed", () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setMobileSidebarOpen sets the value directly", () => {
    useUIStore.getState().setMobileSidebarOpen(true);
    expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
    useUIStore.getState().setMobileSidebarOpen(false);
    expect(useUIStore.getState().mobileSidebarOpen).toBe(false);
  });
});
