"use client";

import { useTranslations } from "next-intl";
import { useUIStore } from "@/stores/ui-store";
import { useDialogStore } from "@/stores/dialog-store";
import { cn } from "@/lib/utils";
import { Home, ListTodo, Timer, CalendarRange, Bot, Plus } from "lucide-react";
import type { SectionKey } from "@/lib/navigation";

interface BottomNavProps {
  className?: string;
}

interface NavItem {
  key: SectionKey | "capture";
  labelKey: string;
  Icon: typeof Home;
  /** "capture" is a virtual item that opens the Quick Capture dialog. */
  action?: "openCapture";
}

const ITEMS: NavItem[] = [
  { key: "dashboard", labelKey: "home", Icon: Home },
  { key: "tasks", labelKey: "tasks", Icon: ListTodo },
  { key: "capture", labelKey: "capture", Icon: Plus, action: "openCapture" },
  { key: "focus", labelKey: "focus", Icon: Timer },
  { key: "ai", labelKey: "ai", Icon: Bot },
];

/**
 * Mobile bottom navigation — primary destinations for one-handed use.
 * Home / Tasks / Quick-Capture (center, elevated) / Focus / AI.
 *
 * Safe-area-aware: respects iOS bottom inset via pb-safe utility.
 * Touch targets ≥ 44px. Active state uses aria-current + color.
 */
export function BottomNav({ className }: BottomNavProps) {
  const t = useTranslations("nav.bottomNav");
  const tCommon = useTranslations("common");
  const tAccessibility = useTranslations("accessibility");
  const tQuickCapture = useTranslations("signature.quickCapture");
  const { activeSection, setActiveSection } = useUIStore();
  const openDialog = useDialogStore((s) => s.openDialog);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md pb-safe md:hidden",
        className
      )}
      aria-label={tAccessibility("navigationLandmark")}
    >
      <ul className="flex items-stretch justify-around px-2 pt-1">
        {ITEMS.map((item) => {
          const Icon = item.Icon;
          const isActive = item.key !== "capture" && activeSection === item.key;
          const isCapture = item.key === "capture";

          if (isCapture) {
            return (
              <li key="capture" className="flex-1 flex justify-center">
                <button
                  onClick={() => item.action === "openCapture" && openDialog("quickCapture")}
                  className={cn(
                    "relative -top-3 flex size-12 items-center justify-center rounded-full",
                    "bg-primary text-primary-foreground shadow-md transition-transform hover-lift"
                  )}
                  aria-label={tQuickCapture("title")}
                >
                  <Icon className="size-5" aria-hidden />
                </button>
              </li>
            );
          }

          const label = t(item.labelKey as never);

          return (
            <li key={item.key} className="flex-1">
              <button
                onClick={() => setActiveSection(item.key as SectionKey)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-5", isActive && "scale-110")} aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
