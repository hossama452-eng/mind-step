"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePreferencesStore } from "@/stores/preferences-store";

/**
 * Applies the user's preferences to the actual document:
 *  - theme via next-themes (already in the tree)
 *  - reduced-motion class on <html>
 *  - text-scale font-size on <html>
 *  - high-contrast class on <html>
 *
 * This component renders nothing visible — it is a side-effect sink.
 */
export function PreferenceApplier() {
  const { theme } = useTheme();
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const highContrast = usePreferencesStore((s) => s.highContrast);
  const textScale = usePreferencesStore((s) => s.textScale);
  const setTheme = usePreferencesStore((s) => s.setTheme);

  // Keep the persisted preference in sync with next-themes (cookie / system).
  useEffect(() => {
    if (theme && (theme === "light" || theme === "dark" || theme === "system")) {
      setTheme(theme);
    }
  }, [theme, setTheme]);

  // Apply reduced-motion class.
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.classList.add("reduce-motion");
    else root.classList.remove("reduce-motion");
  }, [reducedMotion]);

  // Apply high-contrast class.
  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) root.classList.add("high-contrast");
    else root.classList.remove("high-contrast");
  }, [highContrast]);

  // Apply text scale as a base font-size multiplier on the root element.
  useEffect(() => {
    const root = document.documentElement;
    const scale = {
      small: "15px",
      normal: "16px",
      large: "18px",
      xlarge: "20px",
    }[textScale];
    root.style.fontSize = scale;
  }, [textScale]);

  return null;
}
