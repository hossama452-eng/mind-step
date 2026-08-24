"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "./ProgressRing";
import { cn } from "@/lib/utils";
import { Play, Pause, Square, Timer as TimerIcon, Zap } from "lucide-react";

export type FocusCardState = "idle" | "running" | "paused" | "complete";

interface FocusCardProps {
  /** Currently focused task title (or null when idle). */
  taskTitle?: string | null;
  /** Minutes remaining — drives the progress ring. */
  remainingMinutes: number;
  /** Total minutes planned. */
  plannedMinutes: number;
  /** Current state — drives which buttons appear. */
  state: FocusCardState;
  /** Interruptions captured this session. */
  interruptions?: number;
  /** Label overrides — passed from i18n in the consuming component. */
  labels: {
    title: string;
    subtitle: string;
    sessionActive: string;
    sessionComplete: string;
    interruptions: string;
    start: string;
    pause: string;
    resume: string;
    stop: string;
    complete: string;
    noTask: string;
  };
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onComplete?: () => void;
  className?: string;
}

/**
 * Reusable Focus Card.
 * Used on the Dashboard (compact entry point) and the Focus section (full surface).
 * Premium, calm, single-action — never a wall of metrics.
 */
export function FocusCard({
  taskTitle,
  remainingMinutes,
  plannedMinutes,
  state,
  interruptions = 0,
  labels,
  onStart,
  onPause,
  onResume,
  onStop,
  onComplete,
  className,
}: FocusCardProps) {
  const total = Math.max(1, plannedMinutes * 60);
  const elapsed = Math.max(0, total - remainingMinutes * 60);
  const fraction = Math.max(0, Math.min(1, elapsed / total));

  const mm = Math.floor(remainingMinutes);
  const isIdle = state === "idle";
  const isRunning = state === "running";
  const isComplete = state === "complete";

  const statusText = isComplete
    ? labels.sessionComplete
    : isRunning
    ? labels.sessionActive
    : labels.title;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        isRunning && "border-primary/40",
        isComplete && "border-success/40 bg-success/5",
        className
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className={cn("flex items-center gap-2", isRunning && "text-primary")}>
            <TimerIcon className={cn("size-4", isRunning && "breathe")} aria-hidden />
            {statusText}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {labels.interruptions}: {interruptions}
          </span>
        </CardTitle>
        <CardDescription className="text-xs truncate">
          {taskTitle ?? labels.noTask}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
        <ProgressRing
          value={fraction}
          size={140}
          strokeWidth={10}
          color={isComplete ? "success" : "primary"}
          label={
            <div className="text-center">
              <p className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {String(mm).padStart(2, "0")}
                <span className="text-muted-foreground">:</span>
                {String(Math.max(0, Math.floor((remainingMinutes - mm) * 60))).padStart(2, "0")}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {plannedMinutes} min
              </p>
            </div>
          }
          ariaLabel={`${mm} minutes remaining of ${plannedMinutes} minute session`}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          {isIdle ? (
            <Button onClick={onStart} disabled={!onStart}>
              <Play className="size-4 rtl-flip" aria-hidden />
              <span className="ms-2">{labels.start}</span>
            </Button>
          ) : null}
          {isRunning ? (
            <Button onClick={onPause} variant="outline">
              <Pause className="size-4" aria-hidden />
              <span className="ms-2">{labels.pause}</span>
            </Button>
          ) : null}
          {state === "paused" ? (
            <Button onClick={onResume}>
              <Play className="size-4 rtl-flip" aria-hidden />
              <span className="ms-2">{labels.resume}</span>
            </Button>
          ) : null}
          {!isIdle ? (
            <Button onClick={onStop} variant="ghost">
              <Square className="size-4" aria-hidden />
              <span className="ms-2">{labels.stop}</span>
            </Button>
          ) : null}
          {isComplete ? (
            <Button onClick={onComplete} variant="default">
              <Zap className="size-4" aria-hidden />
              <span className="ms-2">{labels.complete}</span>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
