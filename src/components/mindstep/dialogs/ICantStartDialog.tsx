"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/mindstep/LoadingButton";
import { ProgressRing } from "@/components/mindstep/ProgressRing";
import { useTaskStore } from "@/stores/task-store";
import { useFocusStore } from "@/stores/focus-store";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import {
  Heart,
  ChevronRight,
  Sparkles,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ICantStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const FIVE_MINUTES = 5;

/**
 * I Can't Start — MindStep's signature activation-support flow.
 *
 * 1. Acknowledge — validate that starting is hard.
 * 2. Pick one task — choose or type what's stuck.
 * 3. Shrink it — name the 2-minute version.
 * 4. Start a 5-minute focus — link into FocusCard.
 * 5. Success — celebrate the start (regardless of outcome).
 *
 * Never judgmental. Never exposes more than one decision at a time.
 */
export function ICantStartDialog({ open, onOpenChange }: ICantStartDialogProps) {
  const t = useTranslations("signature.iCantStart");
  const tc = useTranslations("common");
  const addTask = useTaskStore((s) => s.addTask);
  const startFocus = useFocusStore((s) => s.start);
  const setActiveSection = useUIStore((s) => s.setActiveSection);

  const [step, setStep] = useState<Step>(1);
  const [taskTitle, setTaskTitle] = useState("");
  const [tinyStep, setTinyStep] = useState("");

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setStep(1);
      setTaskTitle("");
      setTinyStep("");
    }
  }, [open]);

  // Auto-focus on text inputs when entering relevant step
  useEffect(() => {
    if (!open) return;
    const id = `i-cant-start-step-${step}`;
    const el = window.setTimeout(() => {
      document.getElementById(id)?.focus();
    }, 50);
    return () => window.clearTimeout(el);
  }, [step, open]);

  const next = () => setStep((s) => (s < 5 ? ((s + 1) as Step) : s));
  const back = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const startFiveMinuteFocus = () => {
    // Create the tiny step as a task so it appears in Tasks.
    const taskId = addTask({
      title: tinyStep.trim() || taskTitle.trim(),
      isTinyStep: true,
      energy: "low",
      priority: "high",
    });
    // Record a focus session entry — the FocusCard on the Focus section
    // will reflect the active session.
    startFocus({
      taskId,
      taskTitle: tinyStep.trim() || taskTitle.trim(),
      plannedMinutes: FIVE_MINUTES,
    });
    // Move to Focus section so the user sees their active session.
    setActiveSection("focus");
    onOpenChange(false);
    toast.success(t("success"));
  };

  const skipFocus = () => {
    // Still create the tiny-step task, but don't start a focus session.
    addTask({
      title: tinyStep.trim() || taskTitle.trim(),
      isTinyStep: true,
      energy: "low",
      priority: "high",
    });
    onOpenChange(false);
    toast.success(t("success"));
  };

  const progress = step / 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="size-5 text-primary" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            <StepPips step={step} />
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <ProgressRing
            value={progress}
            size={56}
            strokeWidth={6}
            label={
              <span className="text-xs font-medium text-muted-foreground">
                {step}/5
              </span>
            }
            ariaLabel={`Step ${step} of 5`}
          />
          <StepHeader step={step} />
        </div>

        {step === 1 ? <StepBody text={t("step1Body")} /> : null}
        {step === 2 ? (
          <>
            <StepBody text={t("step2Body")} />
            <Input
              id="i-cant-start-step-2"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={t("step2Placeholder")}
              maxLength={200}
              aria-label={t("step2Placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskTitle.trim()) {
                  e.preventDefault();
                  next();
                }
              }}
            />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <StepBody text={t("step3Body")} />
            <Input
              id="i-cant-start-step-3"
              value={tinyStep}
              onChange={(e) => setTinyStep(e.target.value)}
              placeholder={t("step3Placeholder")}
              maxLength={200}
              aria-label={t("step3Placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tinyStep.trim()) {
                  e.preventDefault();
                  next();
                }
              }}
            />
            {taskTitle.trim() ? (
              <p className="text-xs text-muted-foreground">
                · {t("step2Placeholder")}: <span className="text-foreground">{taskTitle}</span>
              </p>
            ) : null}
          </>
        ) : null}
        {step === 4 ? (
          <>
            <StepBody text={t("step4Body")} />
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Timer className="size-5 text-primary" aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {FIVE_MINUTES} min
                </p>
                <p className="text-xs text-muted-foreground">
                  {tinyStep.trim() || taskTitle.trim()}
                </p>
              </div>
            </div>
          </>
        ) : null}
        {step === 5 ? (
          <StepBody text={t("success")} icon={<CheckCircle2 className="size-5 text-success" aria-hidden />} />
        ) : null}

        <DialogFooter className="flex justify-between sm:justify-between">
          {step > 1 && step < 5 ? (
            <Button variant="ghost" onClick={back}>
              {tc("back")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
          )}

          <div className="flex gap-2">
            {step === 1 ? (
              <LoadingButton onClick={next}>
                {t("step1Action")}
                <ChevronRight className="size-4 rtl-flip" aria-hidden />
              </LoadingButton>
            ) : null}
            {step === 2 ? (
              <LoadingButton onClick={next} disabled={!taskTitle.trim()}>
                {tc("next")}
                <ChevronRight className="size-4 rtl-flip" aria-hidden />
              </LoadingButton>
            ) : null}
            {step === 3 ? (
              <LoadingButton onClick={next} disabled={!tinyStep.trim()}>
                {tc("next")}
                <ChevronRight className="size-4 rtl-flip" aria-hidden />
              </LoadingButton>
            ) : null}
            {step === 4 ? (
              <>
                <LoadingButton variant="ghost" onClick={skipFocus}>
                  {t("skipFocus")}
                </LoadingButton>
                <LoadingButton onClick={startFiveMinuteFocus}>
                  <Sparkles className="size-4" aria-hidden />
                  <span className="ms-1">{t("step4Action")}</span>
                </LoadingButton>
              </>
            ) : null}
            {step === 5 ? (
              <LoadingButton onClick={() => onOpenChange(false)}>{tc("close")}</LoadingButton>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepPips({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 rounded-full transition-all",
            n === step
              ? "w-6 bg-primary"
              : n < step
              ? "w-1.5 bg-primary/60"
              : "w-1.5 bg-muted"
          )}
        />
      ))}
    </div>
  );
}

function StepHeader({ step }: { step: Step }) {
  const t = useTranslations("signature.iCantStart");
  const titleKey = `step${step}Title` as const;
  return (
    <p className="text-sm font-medium text-foreground">
      {t(titleKey)}
    </p>
  );
}

function StepBody({
  text,
  icon,
}: {
  text: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      {icon}
      <p>{text}</p>
    </div>
  );
}
