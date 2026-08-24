"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { themeSchema, textScaleSchema } from "@/lib/validations";

type ThemePref = "light" | "dark" | "system";
type TextScale = "small" | "normal" | "large" | "xlarge";

interface PreferencesState {
  theme: ThemePref;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: TextScale;
  notificationsEnabled: boolean;
  aiCoachEnabled: boolean;
  defaultFocusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  dailyStartMinutes: number;
  dailyEndMinutes: number;

  setTheme: (theme: ThemePref) => void;
  setReducedMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setTextScale: (s: TextScale) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setAiCoachEnabled: (v: boolean) => void;
  setDefaultFocusMinutes: (n: number) => void;
  setShortBreakMinutes: (n: number) => void;
  setLongBreakMinutes: (n: number) => void;
  setDailyStartMinutes: (n: number) => void;
  setDailyEndMinutes: (n: number) => void;
}

const safeParse = <T,>(schema: { parse: (v: unknown) => T }, value: unknown, fallback: T): T => {
  try {
    return schema.parse(value);
  } catch {
    return fallback;
  }
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      reducedMotion: false,
      highContrast: false,
      textScale: "normal",
      notificationsEnabled: true,
      aiCoachEnabled: true,
      defaultFocusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      dailyStartMinutes: 480,
      dailyEndMinutes: 1320,

      setTheme: (theme) => set({ theme }),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setHighContrast: (v) => set({ highContrast: v }),
      setTextScale: (s) => set({ textScale: s }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setAiCoachEnabled: (v) => set({ aiCoachEnabled: v }),
      setDefaultFocusMinutes: (n) => set({ defaultFocusMinutes: n }),
      setShortBreakMinutes: (n) => set({ shortBreakMinutes: n }),
      setLongBreakMinutes: (n) => set({ longBreakMinutes: n }),
      setDailyStartMinutes: (n) => set({ dailyStartMinutes: n }),
      setDailyEndMinutes: (n) => set({ dailyEndMinutes: n }),
    }),
    {
      name: "mindstep.preferences",
      // Re-validate every loaded value — never trust persisted client state.
      partialize: (s) => s,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PreferencesState>;
        return {
          ...current,
          theme: safeParse(themeSchema, p.theme, current.theme),
          textScale: safeParse(textScaleSchema, p.textScale, current.textScale),
          reducedMotion: typeof p.reducedMotion === "boolean" ? p.reducedMotion : current.reducedMotion,
          highContrast: typeof p.highContrast === "boolean" ? p.highContrast : current.highContrast,
          notificationsEnabled:
            typeof p.notificationsEnabled === "boolean" ? p.notificationsEnabled : current.notificationsEnabled,
          aiCoachEnabled:
            typeof p.aiCoachEnabled === "boolean" ? p.aiCoachEnabled : current.aiCoachEnabled,
          defaultFocusMinutes:
            typeof p.defaultFocusMinutes === "number" ? p.defaultFocusMinutes : current.defaultFocusMinutes,
          shortBreakMinutes:
            typeof p.shortBreakMinutes === "number" ? p.shortBreakMinutes : current.shortBreakMinutes,
          longBreakMinutes:
            typeof p.longBreakMinutes === "number" ? p.longBreakMinutes : current.longBreakMinutes,
          dailyStartMinutes:
            typeof p.dailyStartMinutes === "number" ? p.dailyStartMinutes : current.dailyStartMinutes,
          dailyEndMinutes:
            typeof p.dailyEndMinutes === "number" ? p.dailyEndMinutes : current.dailyEndMinutes,
        };
      },
    }
  )
);
