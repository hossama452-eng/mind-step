"use client";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon, Trash2, Play, AlertTriangle } from "lucide-react";

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskEnergy = "low" | "medium" | "high";
/**
 * New task lifecycle per Prompt 04 §2.
 * Legacy values are accepted for backward-compatibility.
 */
export type TaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "completed"
  | "archived"
  // Legacy values — accepted for backward compat.
  | "todo"
  | "done"
  | "snoozed";

export interface TaskCardData {
  id: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  energy: TaskEnergy;
  status: TaskStatus;
  dueAt?: Date | null;
  projectTitle?: string;
  subtaskCount?: number;
  subtaskDone?: number;
}

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  high: "bg-warning/20 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

const ENERGY_DOT: Record<TaskEnergy, string> = {
  low: "bg-muted-foreground/50",
  medium: "bg-info",
  high: "bg-warning",
};

interface TaskCardProps {
  task: TaskCardData;
  onToggle?: (id: string) => void;
  onPlay?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Override labels — useful when rendering from server-translated context. */
  labels?: {
    markDone?: string;
    markUndone?: string;
    delete?: string;
    startFocus?: string;
    overdue?: string;
    subtasks?: (done: number, total: number) => string;
  };
  /** Compact density — useful for dashboard top-priorities list. */
  compact?: boolean;
  /** Show the project tag. */
  showProject?: boolean;
  className?: string;
}

/**
 * Reusable task row.
 * Used by TasksSection, Dashboard top priorities, ResetMyDayDialog, etc.
 * Replaces the inline task markup that existed in Phase 1.
 */
export function TaskCard({
  task,
  onToggle,
  onPlay,
  onDelete,
  labels,
  compact = false,
  showProject = true,
  className,
}: TaskCardProps) {
  const done = task.status === "done";
  const overdue =
    task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !done;

  return (
    <Card
      className={cn(
        "transition-colors hover:bg-muted/30",
        done && "opacity-60",
        overdue && "border-destructive/40",
        compact && "py-2",
        className
      )}
    >
      <div className={cn("flex items-center gap-3", compact ? "p-2.5" : "p-3")}>
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle?.(task.id)}
          aria-label={done ? labels?.markUndone : labels?.markDone}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0 space-y-0.5">
          <p
            className={cn(
              "text-sm font-medium text-foreground",
              done && "line-through"
            )}
          >
            {task.title}
          </p>
          {task.notes && !compact ? (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {task.notes}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="secondary"
              className={cn("text-[10px]", PRIORITY_CLASSES[task.priority])}
            >
              {/* priority dot — never relies on color alone (text label too) */}
              <span className="sr-only">Priority:</span>
              {task.priority}
            </Badge>
            <span
              className={cn("size-1.5 rounded-full", ENERGY_DOT[task.energy])}
              aria-hidden
              title={`Energy: ${task.energy}`}
            />
            {task.dueAt ? (
              <span
                className={cn(
                  "text-[10px]",
                  overdue ? "text-destructive font-medium" : "text-muted-foreground"
                )}
              >
                {overdue ? (
                  <AlertTriangle className="inline size-3" aria-hidden />
                ) : null}
                {" "}
                {formatShortDate(task.dueAt)}
              </span>
            ) : null}
            {showProject && task.projectTitle ? (
              <span className="text-[10px] text-muted-foreground">
                · {task.projectTitle}
              </span>
            ) : null}
            {task.subtaskCount != null && task.subtaskCount > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                · {task.subtaskDone ?? 0}/{task.subtaskCount}
                {labels?.subtasks ? ` ${labels.subtasks(task.subtaskDone ?? 0, task.subtaskCount)}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onPlay && !done ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-primary hover:bg-primary/10"
              onClick={() => onPlay(task.id)}
              aria-label={labels?.startFocus}
              title={labels?.startFocus}
            >
              <Play className="size-4 rtl-flip" aria-hidden />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(task.id)}
              aria-label={labels?.delete}
              title={labels?.delete}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function formatShortDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

/** Convenience helper used by dashboard / reset-day dialog. */
export function TaskCardList({
  tasks,
  onToggle,
  onPlay,
  onDelete,
  labels,
  compact = false,
  showProject = true,
  className,
}: {
  tasks: TaskCardData[];
  onToggle?: (id: string) => void;
  onPlay?: (id: string) => void;
  onDelete?: (id: string) => void;
  labels?: TaskCardProps["labels"];
  compact?: boolean;
  showProject?: boolean;
  className?: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            onToggle={onToggle}
            onPlay={onPlay}
            onDelete={onDelete}
            labels={labels}
            compact={compact}
            showProject={showProject}
          />
        </li>
      ))}
    </ul>
  );
}
