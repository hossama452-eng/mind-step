"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnergyStore } from "@/stores/energy-store";
import { toast } from "sonner";
import { Battery, BatteryFull, BatteryMedium, BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3, 4, 5] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_ICONS: Record<Level, typeof Battery> = {
  1: BatteryLow,
  2: BatteryLow,
  3: BatteryMedium,
  4: Battery,
  5: BatteryFull,
};

const LEVEL_TONES: Record<Level, string> = {
  1: "border-destructive/30 bg-destructive/10 text-destructive",
  2: "border-warning/30 bg-warning/10 text-warning",
  3: "border-border bg-muted text-muted-foreground",
  4: "border-info/30 bg-info/10 text-info",
  5: "border-success/30 bg-success/10 text-success",
};

/**
 * Energy check card — 1-tap logging of current energy (1..5).
 * Used on the dashboard. Logging is silent unless the user toggles
 * the description; we never push pop-ups on this gentle flow.
 */
export function EnergyCheckCard() {
  const t = useTranslations("energy");
  const tStats = useTranslations("dashboard.stats");
  const latest = useEnergyStore((s) => s.entries[0] ?? null);
  const addEntry = useEnergyStore((s) => s.addEntry);
  const [hover, setHover] = useState<Level | null>(null);

  const log = (level: Level) => {
    addEntry(level);
    toast.success(t("logged"));
  };

  const currentLevel: Level | null = hover ?? latest?.level ?? null;

  const levelLabel = (lvl: Level) =>
    t(`levels.${lvl}` as never) as string;
  const levelDesc = (lvl: Level) =>
    t(`levelDescription.${lvl}` as never) as string;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Battery className="size-5 text-primary" aria-hidden />
          {t("today")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="grid grid-cols-5 gap-1.5"
          role="radiogroup"
          aria-label={t("title")}
        >
          {LEVELS.map((lvl) => {
            const Icon = LEVEL_ICONS[lvl];
            const isSelected = latest?.level === lvl;
            const isHovered = hover === lvl;
            return (
              <button
                key={lvl}
                onClick={() => log(lvl)}
                onMouseEnter={() => setHover(lvl)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(lvl)}
                onBlur={() => setHover(null)}
                aria-label={levelLabel(lvl)}
                role="radio"
                aria-checked={isSelected}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-3 transition-colors",
                  isSelected
                    ? LEVEL_TONES[lvl]
                    : isHovered
                    ? "border-primary/40 bg-muted/50"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[10px] font-medium tabular-nums">{lvl}</span>
              </button>
            );
          })}
        </div>

        {currentLevel ? (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium text-foreground">{levelLabel(currentLevel)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{levelDesc(currentLevel)}</p>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">{t("empty")}</p>
        )}

        {latest ? (
          <p className="text-xs text-muted-foreground">
            {tStats("energy")}: <span className="font-medium text-foreground">{latest.level}/5</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
