"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { ProgressRing } from "../ProgressRing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "../LoadingButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDialogStore } from "@/stores/dialog-store";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import {
  CalendarRange, Clock, AlertTriangle, Sparkles,
  Play, ArrowRight, Zap, Wind, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import { formatTime, formatShortDate } from "@/lib/locale-utils";

const PLANNER_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

interface TimeBlock {
  id: string;
  taskId: string | null;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  type: string;
  status: string;
  position: number;
  task?: { id: string; title: string; status: string; priority: string } | null;
}

interface TodayData {
  blocks: TimeBlock[];
  now: string;
  stats: {
    totalPlannedMinutes: number;
    availableMinutes: number;
    bufferMinutes: number;
    isOverloaded: boolean;
    completedCount: number;
    maxDailyFocusMinutes: number;
  };
  nowNextLater: {
    now: TimeBlock[];
    next: TimeBlock[];
    later: TimeBlock[];
  };
  overdueTasks: Array<{ id: string; title: string; priority: string; dueAt: string; estimateMinutes: number | null }>;
  activeFocus: { id: string; taskTitle: string | null; status: string } | null;
  nextBestAction: {
    action: string;
    taskId?: string;
    taskTitle?: string;
    reason: string;
  };
}

interface GeneratedPlan {
  blocks: Array<{
    taskId: string;
    taskTitle: string;
    startAt: string;
    endAt: string;
    plannedMinutes: number;
    type: string;
  }>;
  unscheduled: Array<{ taskId: string; taskTitle: string; reason: string }>;
  conflicts: Array<{ description: string }>;
  summary: {
    totalPlannedMinutes: number;
    availableMinutes: number;
    bufferMinutes: number;
    isOverloaded: boolean;
    taskCount: number;
    unscheduledCount: number;
    explanation: string;
  };
}

export function PlannerSection() {
  const t = useTranslations("planner");
  const tFocus = useTranslations("focus");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const openDialog = useDialogStore((s) => s.openDialog);
  const setActiveSection = useUIStore((s) => s.setActiveSection);

  const [view, setView] = useState<"today" | "week">("today");
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [weekData, setWeekData] = useState<{
    days: Array<{ date: string; focusMinutes: number; blockCount: number; isOverloaded: boolean }>;
    deadlines: Array<{ id: string; title: string; dueAt: string; priority: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [approving, setApproving] = useState(false);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/today", { headers: PLANNER_HEADERS });
      if (!res.ok) throw new Error("Failed to load today");
      const data = await res.json();
      setTodayData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/week", { headers: PLANNER_HEADERS });
      if (!res.ok) throw new Error("Failed to load week");
      const data = await res.json();
      setWeekData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "today") fetchToday();
    else fetchWeek();
  }, [view, fetchToday, fetchWeek]);

  // Generate plan (NO DB WRITES — Prompt 06 §14)
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/generate", {
        method: "POST",
        headers: PLANNER_HEADERS,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to generate plan");
      const data = await res.json();
      setGeneratedPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  };

  // Approve plan (ONLY endpoint that writes — Prompt 06 §14, §50)
  const handleApprove = async () => {
    if (!generatedPlan) return;
    setApproving(true);
    try {
      const idempotencyKey = `${Date.now()}-${generatedPlan.blocks.length}`;
      const res = await fetch("/api/planner/approve", {
        method: "POST",
        headers: PLANNER_HEADERS,
        body: JSON.stringify({
          blocks: generatedPlan.blocks,
          idempotencyKey,
        }),
      });
      if (!res.ok) throw new Error("Failed to approve plan");
      const data = await res.json();
      if (data.alreadyApproved) {
        toast.success(t("planAlreadyApproved"));
      } else {
        toast.success(t("planSaved"));
      }
      setGeneratedPlan(null);
      fetchToday();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <LoadingState lines={4} />;
  if (error && !todayData && !weekData) return <ErrorState onRetry={view === "today" ? fetchToday : fetchWeek} />;

  // ===== GENERATED PLAN REVIEW (Prompt 06 §13) =====
  if (generatedPlan) {
    return (
      <div className="space-y-6">
        <SectionHeader title={t("planMyDay")} description={generatedPlan.summary.explanation} />

        {/* Plan summary stats */}
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <Stat label={tCommon("today")} value={`${generatedPlan.summary.totalPlannedMinutes}m`} />
            <Stat label={t("available")} value={`${generatedPlan.summary.availableMinutes}m`} />
            <Stat label={t("buffer")} value={`${generatedPlan.summary.bufferMinutes}m`} />
            <Stat label={t("unscheduled")} value={`${generatedPlan.summary.unscheduledCount}`} />
          </CardContent>
        </Card>

        {/* Overload warning (Prompt 06 §11) */}
        {generatedPlan.summary.isOverloaded ? (
          <Alert className="border-warning/30 bg-warning/5">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <AlertTitle className="text-warning">
              {t("conflicts")}
            </AlertTitle>
            <AlertDescription>
              {t("overloadedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Blocks list */}
        <div className="space-y-2">
          {generatedPlan.blocks.map((block, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="size-4" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{block.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(block.startAt, locale)} · {block.plannedMinutes}m
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{block.type}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Unscheduled tasks */}
        {generatedPlan.unscheduled.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Unscheduled ({generatedPlan.unscheduled.length})
            </p>
            <ul className="space-y-1">
              {generatedPlan.unscheduled.map((u) => (
                <li key={u.taskId} className="text-xs text-muted-foreground">
                  · {u.taskTitle} — {u.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Actions (Prompt 06 §13: Accept / Edit / Cancel) */}
        <div className="flex gap-2">
          <LoadingButton onClick={handleApprove} loading={approving} disabled={approving}>
            <Sparkles className="size-4" aria-hidden />
            <span className="ms-1">{tCommon("save")}</span>
          </LoadingButton>
          <LoadingButton variant="outline" onClick={handleGenerate} loading={generating}>
            {tCommon("retry")}
          </LoadingButton>
          <Button variant="ghost" onClick={() => setGeneratedPlan(null)}>
            {tCommon("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  // ===== TODAY VIEW (Prompt 06 §16, §17) =====
  if (view === "today" && todayData) {
    const { nowNextLater, stats, overdueTasks, nextBestAction, activeFocus } = todayData;
    return (
      <div className="space-y-6">
        <SectionHeader
          title={t("title")}
          description={t("subtitle")}
          action={
            <LoadingButton size="sm" onClick={handleGenerate} loading={generating}>
              <Sparkles className="size-4" aria-hidden />
              <span className="ms-1">{t("planMyDay")}</span>
            </LoadingButton>
          }
        />

        {/* Next Best Action (Prompt 06 §18) */}
        {nextBestAction ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-primary">
                  {t("whatShouldIDoNow")}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {nextBestAction.taskTitle ?? t("nextBestAction.continueFocus")}
                </p>
                <p className="text-xs text-muted-foreground">{nextBestAction.reason}</p>
              </div>
              {nextBestAction.action === "continue_focus" ? (
                <Button size="sm" onClick={() => setActiveSection("focus")}>
                  <Play className="size-4 rtl-flip" aria-hidden />
                  <span className="ms-1">{tFocus("resume")}</span>
                </Button>
              ) : nextBestAction.action !== "rest" ? (
                <Button size="sm" onClick={() => setActiveSection("focus")}>
                  <Play className="size-4 rtl-flip" aria-hidden />
                  <span className="ms-1">{tFocus("startSession")}</span>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Overload detection (Prompt 06 §11, §38) */}
        {stats.isOverloaded ? (
          <Alert className="border-warning/30 bg-warning/5">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <AlertTitle className="text-warning">{t("overloaded")}</AlertTitle>
            <AlertDescription>
              {t("overloadedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Stat label={t("planned")} value={`${stats.totalPlannedMinutes}m`} />
          <Stat label={t("available")} value={`${stats.availableMinutes}m`} />
          <Stat label={t("buffer")} value={`${stats.bufferMinutes}m`} />
          <Stat label={tCommon("done")} value={`${stats.completedCount}`} />
          <Stat label={t("maxDaily")} value={`${stats.maxDailyFocusMinutes}m`} />
        </div>

        {/* NOW / NEXT / LATER (Prompt 06 §17) */}
        {nowNextLater.now.length > 0 || nowNextLater.next.length > 0 || nowNextLater.later.length > 0 ? (
          <div className="space-y-4">
            {/* NOW */}
            {nowNextLater.now.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">NOW</p>
                <ul className="space-y-2">
                  {nowNextLater.now.map((block) => (
                    <li key={block.id}>
                      <BlockCard block={block} locale={locale} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* NEXT */}
            {nowNextLater.next.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">NEXT</p>
                <ul className="space-y-2">
                  {nowNextLater.next.map((block) => (
                    <li key={block.id}>
                      <BlockCard block={block} locale={locale} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* LATER */}
            {nowNextLater.later.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">LATER</p>
                <ul className="space-y-1">
                  {nowNextLater.later.map((block) => (
                    <li key={block.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
                      <span className="flex-1 truncate">{block.task?.title ?? "—"}</span>
                      <span className="text-xs">{formatTime(block.startAt, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarRange className="size-6" aria-hidden />}
            title={t("empty")}
            description={t("subtitle")}
            action={
              <LoadingButton variant="ghost" size="sm" onClick={handleGenerate} loading={generating}>
                <Sparkles className="size-4" aria-hidden />
                <span className="ms-1">{t("planMyDay")}</span>
              </LoadingButton>
            }
          />
        )}

        {/* Overdue tasks (neutral — Prompt 06 §42) */}
        {overdueTasks.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Overdue ({overdueTasks.length})
            </p>
            <ul className="space-y-1">
              {overdueTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm">
                  <span className="flex-1 truncate text-foreground">{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(task.dueAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  // ===== WEEK VIEW (Prompt 06 §31) =====
  if (view === "week" && weekData) {
    return (
      <div className="space-y-6">
        <SectionHeader title={t("title")} description={t("subtitle")} />

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekData.days.map((day) => {
            const dayDate = new Date(day.date);
            const isToday = day.date === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-lg border p-2 text-center",
                  isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                  day.isOverloaded && "border-warning/30 bg-warning/5"
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {dayDate.toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{day.focusMinutes}m</p>
                <p className="text-[10px] text-muted-foreground">{day.blockCount} blocks</p>
              </div>
            );
          })}
        </div>

        {/* Deadlines (Prompt 06 §41) */}
        {weekData.deadlines.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Deadlines
            </p>
            <ul className="space-y-1">
              {weekData.deadlines.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm">
                  <span className="flex-1 truncate text-foreground">{d.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(d.dueAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button variant="outline" onClick={() => setView("today")}>
          {t("today")}
        </Button>
      </div>
    );
  }

  return null;
}

function BlockCard({ block, locale }: { block: TimeBlock; locale: Locale }) {
  const isFocus = block.type === "focus";
  const isCompleted = block.status === "completed";
  return (
    <Card className={cn(
      "transition-colors",
      isFocus && !isCompleted && "border-primary/30",
      isCompleted && "opacity-60"
    )}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isFocus ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}>
          <Clock className="size-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium text-foreground truncate", isCompleted && "line-through")}>
            {block.task?.title ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatTime(block.startAt, locale)} · {block.plannedMinutes}m · {block.type}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
