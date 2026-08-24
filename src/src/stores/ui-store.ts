"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SectionKey } from "@/lib/navigation";

/**
 * Local UI state — not user-owned data.
 * Theme & language are also persisted as cookies / html attributes,
 * but kept here for fast client reads and reactive updates.
 */
interface UIState {
  /** Active section in the single-page shell. */
  activeSection: SectionKey;
  setActiveSection: (key: SectionKey) => void;

  /** Sidebar collapsed on desktop. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Mobile sidebar open state. */
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeSection: "dashboard",
      setActiveSection: (key) => set({ activeSection: key, mobileSidebarOpen: false }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
    }),
    {
      name: "mindstep.ui",
      // Only persist the sidebar collapse state — section navigation
      // should always start at the dashboard on a fresh session.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);
