"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "../LoadingButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Plus, Trash2, GripVertical, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";

interface SmartBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task to break down. */
  taskId: string;
  taskTitle: string;
  /** Optional task description for better suggestions. */
  taskDescription?: string | null;
  /** Called after the user approves — gives the caller the created subtasks. */
  onApproved?: (subtasks: Array<{ id: string; title: string; done: boolean; position: number }>) => void;
}

/**
 * Smart Breakdown Dialog — the Suggest → Review → Approve → Persist flow.
 *
 * CRITICAL (Prompt 04 §38-43):
 *   - The suggest endpoint is DETERMINISTIC — never claims to be AI.
 *   - The dialog NEVER creates subtasks on open or on suggestion fetch.
 *   - The user can edit, delete, add, and reorder suggestions.
 *   - Nothing is persisted until the user clicks "Approve and create".
 *   - On Approve: calls /api/smart-breakdown/approve, which creates the
 *     subtasks server-side. Only then does the database have new records.
 *
 * The flow:
 *   1. Open dialog → fetch suggestions from /api/smart-breakdown/suggest
 *      (no DB writes).
 *   2. User edits/deletes/adds/reorders the suggested steps.
 *   3. User clicks "Approve and create" → POST /api/smart-breakdown/approve
 *      with the final step list.
 *   4. Server creates subtasks. Client receives the created subtasks and
 *      calls onApproved so the parent view can refresh.
 */
export function SmartBreakdownDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  taskDescription,
  onApproved,
}: SmartBreakdownDialogProps) {
  const t = useTranslations();
  const tBreakdown = useTranslations("breakdown");
  const locale = useLocale() as Locale;

  const [steps, setSteps] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStep, setNewStep] = useState("");

  // Fetch suggestions when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSteps([]);
      setSourceLabel("");
      try {
        const res = await fetch("/api/smart-breakdown/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mindstep-user-id": "demo-user",
            "x-mindstep-auto-create-user": "true",
          },
          body: JSON.stringify({
            taskTitle,
            taskDescription,
            taskId,
            locale,
          }),
        });
        if (!res.ok) {
          throw new Error("Failed to fetch suggestions");
        }
        const data = await res.json();
        if (!cancelled) {
          setSteps(data.steps || []);
          setSourceLabel(data.sourceLabel || tBreakdown("sourceDisclosure"));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskTitle, taskDescription, taskId, locale, tBreakdown]);

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const deleteStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const addStep = () => {
    const trimmed = newStep.trim();
    if (!trimmed) return;
    setSteps((prev) => [...prev, trimmed]);
    setNewStep("");
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= steps.length - 1) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  };

  const approve = async () => {
    const trimmed = steps.map((s) => s.trim()).filter((s) => s.length > 0);
    if (trimmed.length === 0) {
      setError(tBreakdown("empty"));
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/smart-breakdown/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mindstep-user-id": "demo-user",
        },
        body: JSON.stringify({
          taskId,
          subtasks: trimmed,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Failed to create subtasks");
      }
      const data = await res.json();
      onApproved?.(data.subtasks || []);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setApproving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            {tBreakdown("title")}
          </DialogTitle>
          <DialogDescription>
            {tBreakdown("subtitle")} — <span className="font-medium text-foreground">{taskTitle}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Honest disclosure — never claims to be AI */}
        {sourceLabel ? (
          <Alert className="border-info/30 bg-info/5">
            <Info className="size-4 text-info" aria-hidden />
            <AlertDescription className="text-xs text-muted-foreground">{sourceLabel}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-muted animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        ) : error ? (
          <Alert variant="default" className="border-destructive/30 bg-destructive/5">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        ) : steps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{tBreakdown("empty")}</p>
        ) : (
          <ol className="space-y-2 max-h-[40vh] overflow-y-auto pe-1">
            {steps.map((step, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                  {index + 1}
                </span>
                <Input
                  value={step}
                  onChange={(e) => updateStep(index, e.target.value)}
                  maxLength={200}
                  className="flex-1"
                  aria-label={tBreakdown("edit")}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label={t("subtasks.moveUp")}
                >
                  <GripVertical className="size-3.5 rotate-180" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => moveDown(index)}
                  disabled={index >= steps.length - 1}
                  aria-label={t("subtasks.moveDown")}
                >
                  <GripVertical className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteStep(index)}
                  aria-label={tBreakdown("delete")}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
        )}

        {/* Add a new step */}
        {!loading && steps.length > 0 ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addStep();
            }}
          >
            <Input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder={tBreakdown("addStep")}
              maxLength={200}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!newStep.trim()}>
              <Plus className="size-4" aria-hidden />
            </Button>
          </form>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={approving}>
            {tBreakdown("cancel")}
          </Button>
          <LoadingButton
            onClick={approve}
            loading={approving}
            disabled={loading || steps.length === 0}
          >
            {tBreakdown("approve")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
