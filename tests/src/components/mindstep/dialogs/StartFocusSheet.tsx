"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/mindstep/LoadingButton";
import { useTaskStore } from "@/stores/task-store";
import { useFocusStore } from "@/stores/focus-store";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import { Play, Timer as TimerIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StartFocusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-selected task ID. */
  initialTaskId?: string | null;
}

const PRESETS = [
  { minutes: 5, key: "quick5" as const },
  { minutes: 15, key: "focus15" as const },
  { minutes: 25, key: "focus25" as const },
  { minutes: 45, key: "focus45" as const },
  { minutes: 90, key: "focus90" as const },
];

/**
 * Start Focus — mobile-first bottom sheet for choosing a task and duration
 * and immediately starting a focus session.
 *
 * Designed to be opened from the Dashboard's "Start focus" CTA, the
 * TaskCard's "start focus on this" action, or the Focus section itself.
 */
export function StartFocusSheet({ open, onOpenChange, initialTaskId }: StartFocusSheetProps) {
  const t = useTranslations("signature.startFocus");
  const tc = useTranslations("common");
  const tasks = useTaskStore((s) => s.tasks);
  const startTask = useTaskStore((s) => s.startTask);
  const startFocusSession = useFocusStore((s) => s.start);
  const setActiveSection = useUIStore((s) => s.setActiveSection);

  const todoTasks = tasks.filter((t) => t.status !== "done" && !t.archived && !t.snoozed);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null);
  const [freelanceText, setFreelanceText] = useState("");
  const [minutes, setMinutes] = useState<number>(15);

  useEffect(() => {
    if (open) {
      setSelectedTaskId(initialTaskId ?? null);
      setFreelanceText("");
      setMinutes(15);
    }
  }, [open, initialTaskId]);

  const canStart = Boolean(selectedTaskId) || freelanceText.trim().length > 0;

  const begin = () => {
    let taskId: string | null = null;
    let taskTitle: string | undefined;

    if (selectedTaskId) {
      const task = tasks.find((t) => t.id === selectedTaskId);
      if (task) {
        taskId = task.id;
        taskTitle = task.title;
        startTask(task.id);  // mark in_progress
      }
    } else if (freelanceText.trim()) {
      taskTitle = freelanceText.trim();
    }

    startFocusSession({ taskId, taskTitle, plannedMinutes: minutes });
    onOpenChange(false);
    setActiveSection("focus");
    toast.success(t("begin"));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full sm:max-w-lg rounded-t-2xl pb-safe"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TimerIcon className="size-5 text-primary" aria-hidden />
            {t("title")}
          </SheetTitle>
          <SheetDescription>{t("subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Task picker */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("pickTask")}
            </Label>
            {todoTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("orFreelance")} ↓</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                {todoTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      onClick={() => {
                        setSelectedTaskId(
                          selectedTaskId === task.id ? null : task.id
                        );
                        if (selectedTaskId === task.id) setFreelanceText("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                        selectedTaskId === task.id
                          ? "bg-primary/12 text-primary"
                          : "hover:bg-muted"
                      )}
                      aria-pressed={selectedTaskId === task.id}
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          selectedTaskId === task.id ? "bg-primary" : "bg-muted-foreground/40"
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{task.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("orFreelance")}</p>
            <Input
              value={freelanceText}
              onChange={(e) => {
                setFreelanceText(e.target.value);
                if (e.target.value) setSelectedTaskId(null);
              }}
              placeholder={t("freelancePlaceholder")}
              maxLength={200}
              aria-label={t("freelancePlaceholder")}
            />
          </div>

          {/* Duration picker */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("duration")}
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  onClick={() => setMinutes(preset.minutes)}
                  aria-pressed={minutes === preset.minutes}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    minutes === preset.minutes
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted text-muted-foreground"
                  )}
                >
                  <span className="block text-base tabular-nums">{preset.minutes}m</span>
                  <span className="block text-[10px] uppercase tracking-wider opacity-70">
                    {t(`presets.${preset.key}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <LoadingButton
            onClick={begin}
            disabled={!canStart}
            className="w-full"
            size="lg"
          >
            <Play className="size-4 rtl-flip" aria-hidden />
            <span className="ms-1">{t("begin")}</span>
          </LoadingButton>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              setActiveSection("focus");
            }}
            className="w-full"
            size="sm"
          >
            {t("openFullFocus")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
