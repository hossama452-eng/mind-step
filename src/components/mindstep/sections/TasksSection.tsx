"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { TaskCard } from "../TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaskStore } from "@/stores/task-store";
import { useDialogStore } from "@/stores/dialog-store";
import { ListTodo, Plus } from "lucide-react";

export function TasksSection() {
  const t = useTranslations();
  const allTasks = useTaskStore((s) => s.tasks);
  // Tasks section shows today's tasks — snoozed (moved to tomorrow) and
  // archived (dropped via Reset My Day) are filtered out. They remain in
  // the store and are recoverable.
  const tasks = allTasks.filter((task) => !task.snoozed && !task.archived);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const openDialog = useDialogStore((s) => s.openDialog);

  const add = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed });
  };

  const labels = {
    markDone: t("tasks.markDone"),
    markUndone: t("tasks.markUndone"),
    delete: t("common.delete"),
    startFocus: t("tasks.startFocus"),
    overdue: t("tasks.overdue"),
    subtasks: () => t("tasks.subtasks"),
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("tasks.title")} description={t("tasks.subtitle")} />

      <QuickAdd onSubmit={add} placeholder={t("tasks.placeholder")} buttonLabel={t("tasks.add")} />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="size-6" aria-hidden />}
          title={t("tasks.empty")}
          description={t("tasks.subtitle")}
        />
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={{
                  ...task,
                  dueAt: task.dueAt ? new Date(task.dueAt) : null,
                }}
                onToggle={toggleTask}
                onPlay={(id) => openDialog("startFocus", { initialTaskId: id })}
                onDelete={deleteTask}
                labels={labels}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAdd({
  onSubmit,
  placeholder,
  buttonLabel,
}: {
  onSubmit: (value: string) => void;
  placeholder: string;
  buttonLabel: string;
}) {
  const [draft, setDraft] = useDraftState();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
        setDraft("");
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
        className="flex-1"
      />
      <Button type="submit" disabled={!draft.trim()}>
        <Plus className="size-4" aria-hidden />
        <span className="ms-1 hidden sm:inline">{buttonLabel}</span>
      </Button>
    </form>
  );
}

// Tiny local hook to avoid importing useState from React across multiple files.
function useDraftState(): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  return [value, setValue];
}
