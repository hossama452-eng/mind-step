"use client";

import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEnergyStore } from "@/stores/energy-store";
import { formatRelativeTime } from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";
import { Battery, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3, 4, 5] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_TONES: Record<Level, string> = {
  1: "bg-destructive/15 text-destructive border-destructive/30",
  2: "bg-warning/15 text-warning border-warning/30",
  3: "bg-muted text-muted-foreground border-border",
  4: "bg-info/15 text-info border-info/30",
  5: "bg-success/15 text-success border-success/30",
};

export function EnergySection() {
  const t = useTranslations("energy");
  const tCommon = useTranslations("common");
  const entries = useEnergyStore((s) => s.entries);
  const addEntry = useEnergyStore((s) => s.addEntry);
  const deleteEntry = useEnergyStore((s) => s.deleteEntry);
  const locale = useLocale() as Locale;

  const levelLabel = (lvl: Level) =>
    t(`levels.${lvl}` as never) as string;
  const levelDesc = (lvl: Level) =>
    t(`levelDescription.${lvl}` as never) as string;

  return (
    <div className="space-y-6">
      <SectionHeader title={t("title")} description={t("subtitle")} />

      {/* Quick log card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Battery className="size-5 text-primary" aria-hidden />
            {t("today")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => addEntry(lvl)}
                aria-label={levelLabel(lvl)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-3 text-sm font-medium transition-colors hover-lift",
                  LEVEL_TONES[lvl]
                )}
              >
                <span className="text-base tabular-nums">{lvl}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">
                  {levelLabel(lvl).split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("logged")}</p>
        </CardContent>
      </Card>

      {/* History */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-6" aria-hidden />}
          title={t("empty")}
          description={t("subtitle")}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("viewHistory")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-96 space-y-1.5 overflow-y-auto pe-1">
              {entries.slice(0, 20).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      LEVEL_TONES[entry.level]
                    )}
                  >
                    {entry.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {levelLabel(entry.level)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.timestamp, locale)}
                    </p>
                  </div>
                  {entry.note ? (
                    <p className="text-xs text-muted-foreground max-w-[40%] truncate">
                      {entry.note}
                    </p>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteEntry(entry.id)}
                    aria-label={tCommon("delete")}
                    title={tCommon("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
