"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/task-store";
import { useFocusStore } from "@/stores/focus-store";
import { useEnergyStore } from "@/stores/energy-store";
import { useBrainDumpStore } from "@/stores/brain-dump-store";
import { ProgressRing } from "@/components/mindstep/ProgressRing";
import { cn } from "@/lib/utils";
import { CheckCircle2, Timer, Repeat, Sparkles, Flame } from "lucide-react";
import type { Locale } from "@/i18n/locale";
import { useLocale } from "next-intl";
import { formatDuration } from "@/lib/locale-utils";

interface ProgressCardProps {
  className?: string;
}

/**
 * Today's Progress — gentle momentum, not scorekeeping.
 *
 * The streak is intentionally a count of days with any activity (not
 * "perfect days"). Rest is celebrated as part of progress.
 */
export function ProgressCard({ className }: ProgressCardProps) {
  const t = useTranslations("progress");
  const tStats = useTranslations("dashboard.stats");
  const tasks = useTaskStore((s) => s.tasks);
  const todaysFocusMinutes = useFocusStore((s) => s.todaysMinutes());
  const energyEntries = useEnergyStore((s) => s.entries);
  const brainDumps = useBrainDumpStore((s) => s.entries);
  const locale = useLocale() as Locale;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const tasksDoneToday = tasks.filter(
    (t) => t.status === "done" && new Date(t.updatedAt).getTime() >= todayMs
  ).length;

  // Streak: count of days in the past 7 with at least one activity (task done,
  // focus session, energy log, or brain dump). Rest is celebrated.
  const streak = computeStreak(
    tasks,
    todayMs,
    energyEntries.map((e) => e.timestamp)
  );

  const totalProgress =
    Math.min(1, tasksDoneToday / 3) +
    Math.min(1, todaysFocusMinutes / 25) +
    Math.min(1, energyEntries.length > 0 ? 1 : 0);
  const fraction = Math.min(1, totalProgress / 3);

  const motivationKey = pickMotivation(tasksDoneToday, todaysFocusMinutes);
  const motivation = t(`motivations.${motivationKey}` as never);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <ProgressRing
          value={fraction}
          size={120}
          strokeWidth={10}
          label={
            <div className="text-center">
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {Math.round(fraction * 100)}<span className="text-sm text-muted-foreground">%</span>
              </p>
            </div>
          }
          ariaLabel={`Today's progress: ${Math.round(fraction * 100)} percent`}
        />
        <div className="flex-1 grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Stat
            icon={<CheckCircle2 className="size-4 text-success" aria-hidden />}
            label={t("tasksCompleted")}
            value={String(tasksDoneToday)}
          />
          <Stat
            icon={<Timer className="size-4 text-primary" aria-hidden />}
            label={t("focusMinutes")}
            value={formatDuration(todaysFocusMinutes, locale)}
          />
          <Stat
            icon={<Sparkles className="size-4 text-info" aria-hidden />}
            label={t("captures")}
            value={String(brainDumps.filter((e) => new Date(e.createdAt).getTime() >= todayMs).length)}
          />
          <Stat
            icon={<Flame className={cn("size-4", streak > 0 && "text-warning")} aria-hidden />}
            label={t("streak")}
            value={String(streak)}
          />
        </div>
      </CardContent>
      <div className="border-t border-border bg-muted/30 p-3 text-center text-sm text-muted-foreground">
        {motivation}
      </div>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-card border border-border px-2.5 py-2">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground tabular-nums leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}

function computeStreak(
  tasks: { status: string; updatedAt: string }[],
  todayMs: number,
  energyTimestamps: string[]
): number {
  const activityDays = new Set<number>();

  // Days with any task completion.
  for (const t of tasks) {
    if (t.status !== "done") continue;
    const day = new Date(t.updatedAt);
    day.setHours(0, 0, 0, 0);
    activityDays.add(day.getTime());
  }

  // Days with any energy check-in.
  for (const ts of energyTimestamps) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    activityDays.add(day.getTime());
  }

  // Walk backward from today — streak is consecutive days with activity.
  let streak = 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  let cursor = todayMs;
  // Allow today OR yesterday to count as the start of the streak
  // (grace — user hasn't shown up yet today).
  if (!activityDays.has(cursor)) cursor -= oneDayMs;
  while (activityDays.has(cursor)) {
    streak++;
    cursor -= oneDayMs;
  }
  return streak;
}

function pickMotivation(tasksDone: number, focusMinutes: number): string {
  if (tasksDone === 0 && focusMinutes === 0) return "firstStep";
  if (tasksDone >= 3 || focusMinutes >= 25) return "momentum";
  if (tasksDone > 0 || focusMinutes > 0) return "going";
  return "rest";
}
