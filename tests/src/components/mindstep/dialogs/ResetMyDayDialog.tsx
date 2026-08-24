"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/mindstep/LoadingButton";
import { EmptyState } from "@/components/mindstep/EmptyState";
import { useTaskStore, type Task } from "@/stores/task-store";
import { toast } from "sonner";
import { RefreshCw, Check, MoveRight, Archive, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResetMyDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Verdict = "keep" | "move" | "drop";

/**
 * Reset My Day — MindStep's signature "behind-day" recovery flow.
 *
 * The user triages each non-completed task into one of three buckets:
 *   - Keep: stays on today's list
 *   - Move: snoozed — comes back tomorrow
 *   - Drop: archived — recoverable from settings
 *
 * Critical UX rules:
 *   - Never shows "failed" tasks. Tasks are simply *not done yet*.
 *   - Never deletes data without confirmation (drop = archive, not delete).
 *   - Shows a summary before applying so the user can change their mind.
 */
export function ResetMyDayDialog({ open, onOpenChange }: ResetMyDayDialogProps) {
  const t = useTranslations("signature.resetMyDay");
  const tc = useTranslations("common");
  const tasks = useTaskStore((s) => s.tasks);
  const resetDay = useTaskStore((s) => s.resetDay);

  // Only show tasks that need triage — not done, not already archived/snoozed.
  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done" && !task.archived && !task.snoozed),
    [tasks]
  );

  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (open) {
      setVerdicts({});
      setShowSummary(false);
    }
  }, [open]);

  const setVerdict = (taskId: string, v: Verdict) => {
    setVerdicts((prev) => {
      if (prev[taskId] === v) {
        // Click the same verdict twice to clear.
        const { [taskId]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [taskId]: v };
    });
  };

  const counts = useMemo(() => {
    const keep = Object.keys(verdicts).filter((id) => verdicts[id] === "keep").length;
    const move = Object.keys(verdicts).filter((id) => verdicts[id] === "move").length;
    const drop = Object.keys(verdicts).filter((id) => verdicts[id] === "drop").length;
    const unmarked = pendingTasks.length - (keep + move + drop);
    return { keep, move, drop, unmarked };
  }, [verdicts, pendingTasks.length]);

  const apply = () => {
    const keepIds = Object.keys(verdicts).filter((id) => verdicts[id] === "keep");
    const moveIds = Object.keys(verdicts).filter((id) => verdicts[id] === "move");
    const dropIds = Object.keys(verdicts).filter((id) => verdicts[id] === "drop");
    resetDay(keepIds, moveIds, dropIds);
    onOpenChange(false);
    toast.success(t("subtitle"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        {pendingTasks.length === 0 ? (
          <EmptyState title={t("empty")} icon={<RefreshCw className="size-6" aria-hidden />} />
        ) : showSummary ? (
          <SummaryView counts={counts} onBack={() => setShowSummary(false)} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {pendingTasks.length} {tc("of").toLowerCase()} {tasks.length} {tc("today").toLowerCase()}
            </p>
            <ul className="max-h-[40vh] space-y-2 overflow-y-auto pe-1">
              {pendingTasks.map((task) => (
                <li key={task.id}>
                  <TaskTriageRow
                    task={task}
                    verdict={verdicts[task.id]}
                    onVerdict={(v) => setVerdict(task.id, v)}
                  />
                </li>
              ))}
            </ul>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t("keep")}: {counts.keep} · {t("move")}: {counts.move} · {t("drop")}: {counts.drop}
                {counts.unmarked > 0 ? ` · unmarked: ${counts.unmarked}` : ""}
              </p>
              <LoadingButton
                onClick={() => setShowSummary(true)}
                disabled={counts.keep + counts.move + counts.drop === 0}
              >
                {tc("next")}
              </LoadingButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  function SummaryView({
    counts,
    onBack,
  }: {
    counts: { keep: number; move: number; drop: number; unmarked: number };
    onBack: () => void;
  }) {
    return (
      <div className="space-y-4 fade-in">
        <p className="text-sm font-medium text-foreground">{t("summary.title")}</p>
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label={t("summary.kept")} value={counts.keep} tone="primary" />
          <SummaryStat label={t("summary.moved")} value={counts.move} tone="info" />
          <SummaryStat label={t("summary.dropped")} value={counts.drop} tone="warning" />
        </div>
        <p className="text-xs text-muted-foreground">
          {counts.unmarked > 0
            ? `${counts.unmarked} task(s) left unmarked — they stay on today's list as-is.`
            : null}
        </p>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="size-4 rtl-flip" aria-hidden />
            {tc("back")}
          </Button>
          <LoadingButton onClick={apply}>{t("apply")}</LoadingButton>
        </DialogFooter>
      </div>
    );
  }
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "info" | "warning";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary border-primary/20",
    info: "bg-info/10 text-info border-info/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  }[tone];

  return (
    <div className={cn("rounded-lg border p-3 text-center", toneClass)}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-wider opacity-80">{label}</p>
    </div>
  );
}

function TaskTriageRow({
  task,
  verdict,
  onVerdict,
}: {
  task: Task;
  verdict?: Verdict;
  onVerdict: (v: Verdict) => void;
}) {
  const t = useTranslations("signature.resetMyDay");
  return (
    <div className="rounded-lg border border-border bg-card p-3 transition-colors">
      <p className="text-sm font-medium text-foreground mb-2">{task.title}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <VerdictButton
          active={verdict === "keep"}
          onClick={() => onVerdict("keep")}
          icon={<Check className="size-3.5" aria-hidden />}
          label={t("keep")}
          hint={t("keepHint")}
          activeClass="bg-primary text-primary-foreground"
        />
        <VerdictButton
          active={verdict === "move"}
          onClick={() => onVerdict("move")}
          icon={<MoveRight className="size-3.5 rtl-flip" aria-hidden />}
          label={t("move")}
          hint={t("moveHint")}
          activeClass="bg-info text-info-foreground"
        />
        <VerdictButton
          active={verdict === "drop"}
          onClick={() => onVerdict("drop")}
          icon={<Archive className="size-3.5" aria-hidden />}
          label={t("drop")}
          hint={t("dropHint")}
          activeClass="bg-warning text-warning-foreground"
        />
      </div>
    </div>
  );
}

function VerdictButton({
  active,
  onClick,
  icon,
  label,
  hint,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
        active
          ? cn(activeClass, "border-transparent")
          : "border-border bg-background hover:bg-muted text-muted-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
