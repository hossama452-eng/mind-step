"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/mindstep/EmptyState";
import { TaskCard, type TaskCardData } from "@/components/mindstep/TaskCard";
import { useTaskStore } from "@/stores/task-store";
import { useDialogStore } from "@/stores/dialog-store";
import { ListTodo, Plus } from "lucide-react";

const MAX_TOP_PRIORITIES = 3;

interface TopPrioritiesCardProps {
  className?: string;
}

/**
 * Top Priorities — at most 3 tasks, picked by:
 *   1. status != done
 *   2. archived=false, snoozed=false
 *   3. priority order: urgent > high > normal > low
 *   4. earliest dueAt (if any)
 *
 * Never shows the entire task database. Every priority has an obvious
 * next action (toggle done, or start focus).
 */
export function TopPrioritiesCard({ className }: TopPrioritiesCardProps) {
  const t = useTranslations();
  const tTasks = useTranslations("tasks");
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const openDialog = useDialogStore((s) => s.openDialog);

  const candidates: TaskCardData[] = tasks
    .filter((task) => task.status !== "done" && !task.archived && !task.snoozed)
    .sort(byPriorityAndDue)
    .slice(0, MAX_TOP_PRIORITIES)
    .map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      energy: task.energy,
      status: task.status,
      dueAt: task.dueAt ? new Date(task.dueAt) : null,
      projectTitle: task.projectTitle,
      subtaskCount: task.subtaskCount,
      subtaskDone: task.subtaskDone,
    }));

  const labels = {
    markDone: t("tasks.markDone"),
    markUndone: t("tasks.markUndone"),
    delete: t("common.delete"),
    startFocus: t("tasks.startFocus"),
    overdue: t("tasks.overdue"),
    subtasks: (done: number, total: number) => t("tasks.subtasks"),
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.sections.topPriorities")}</CardTitle>
        <CardDescription>{t("dashboard.sections.topPrioritiesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {candidates.length === 0 ? (
          <EmptyState
            title={t("dashboard.empty.noTasks")}
            icon={<ListTodo className="size-6" aria-hidden />}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openDialog("quickCapture")}
              >
                <Plus className="size-4" aria-hidden />
                <span className="ms-1">{t("brainDump.add")}</span>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {candidates.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  compact
                  onToggle={toggleTask}
                  onPlay={(id) => openDialog("startFocus", { initialTaskId: id })}
                  labels={labels}
                />
              </li>
            ))}
          </ul>
        )}
        {candidates.length >= MAX_TOP_PRIORITIES ? (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            {t("common.more")} ·{" "}
            {tTasks("count", { count: tasks.length - candidates.length })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function byPriorityAndDue(
  a: { priority: string; dueAt?: string | null },
  b: { priority: string; dueAt?: string | null }
): number {
  const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const pa = order[a.priority] ?? 99;
  const pb = order[b.priority] ?? 99;
  if (pa !== pb) return pa - pb;
  // Earliest dueAt first; tasks without a due date go last within the same priority.
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
  return ad - bd;
}
