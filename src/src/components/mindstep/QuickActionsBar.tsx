"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDialogStore } from "@/stores/dialog-store";
import { useUIStore } from "@/stores/ui-store";
import {
  Footprints,
  RefreshCw,
  Play,
  Sparkles,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsBarProps {
  className?: string;
  /** Layout: "grid" for desktop, "row" for mobile sticky bar. */
  layout?: "grid" | "row";
}

/**
 * Quick Actions Bar — MindStep's signature UX entry points.
 * Each button opens a real, interactive dialog/sheet. Never decorative.
 *
 * 1. I Can't Start  → ICantStartDialog (4-step flow)
 * 2. Reset My Day   → ResetMyDayDialog (triage flow)
 * 3. Start Focus    → StartFocusSheet (task + duration picker)
 * 4. Quick Capture  → QuickCaptureDialog (global shortcut)
 *
 * The keyboard shortcut "C" is wired globally (see AppShell) to open
 * Quick Capture without clicking.
 */
export function QuickActionsBar({ className, layout = "grid" }: QuickActionsBarProps) {
  const t = useTranslations("signature");
  const tCard = useTranslations("dashboard.adhdCards");
  const tAccessibility = useTranslations("accessibility");
  const openDialog = useDialogStore((s) => s.openDialog);

  const actions = [
    {
      key: "iCantStart" as const,
      label: tCard("iCantStart.title"),
      description: tCard("iCantStart.description"),
      icon: Footprints,
      variant: "default" as const,
      onClick: () => openDialog("iCantStart"),
    },
    {
      key: "resetMyDay" as const,
      label: tCard("resetMyDay.title"),
      description: tCard("resetMyDay.description"),
      icon: RefreshCw,
      variant: "outline" as const,
      onClick: () => openDialog("resetMyDay"),
    },
    {
      key: "startFocus" as const,
      label: t("startFocus.title"),
      description: t("startFocus.subtitle"),
      icon: Play,
      variant: "default" as const,
      onClick: () => openDialog("startFocus"),
    },
    {
      key: "quickCapture" as const,
      label: t("quickCapture.title"),
      description: t("quickCapture.subtitle"),
      icon: Plus,
      variant: "outline" as const,
      onClick: () => openDialog("quickCapture"),
    },
  ];

  if (layout === "row") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 overflow-x-auto rounded-full border border-border bg-card p-1 pe-2",
          className
        )}
        role="toolbar"
        aria-label={tAccessibility("quickActionsToolbar")}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              variant={action.variant}
              size="sm"
              onClick={action.onClick}
              className="rounded-full"
            >
              <Icon className="size-4 rtl-flip" aria-hidden />
              <span className="ms-1 whitespace-nowrap">{action.label}</span>
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
      role="toolbar"
      aria-label={tAccessibility("quickActionsToolbar")}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            onClick={action.onClick}
            className={cn(
              "group flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-all hover-lift",
              action.variant === "default"
                ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/8"
                : "border-border bg-card hover:border-primary/30 hover:bg-muted/30"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  action.variant === "default"
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary"
                )}
              >
                <Icon className="size-4 rtl-flip" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {action.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {action.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
