"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useUIStore } from "@/stores/ui-store";
import { useDialogStore } from "@/stores/dialog-store";
import { useTaskStore } from "@/stores/task-store";
import { useFocusStore } from "@/stores/focus-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useBrainDumpStore } from "@/stores/brain-dump-store";
import { useEnergyStore } from "@/stores/energy-store";
import { FocusCard, type FocusCardState } from "../FocusCard";
import { QuickActionsBar } from "../QuickActionsBar";
import { TopPrioritiesCard } from "../dashboard/TopPrioritiesCard";
import { RemindersCard } from "../dashboard/RemindersCard";
import { EnergyCheckCard } from "../dashboard/EnergyCheckCard";
import { ProgressCard } from "../dashboard/ProgressCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Timer, Sparkles, Plus, Bot } from "lucide-react";
import type { Locale } from "@/i18n/locale";
import { formatDuration } from "@/lib/locale-utils";
import { MindStepPurchaseButton } from "../MindStepPurchaseButton";

export function DashboardSection() {
  const t = useTranslations();
  const tFocus = useTranslations("focus");
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const openDialog = useDialogStore((s) => s.openDialog);
  const tasks = useTaskStore((s) => s.tasks);
  const activeFocus = useFocusStore((s) =>
    s.sessions.find((sess) => sess.id === s.activeSessionId)
  );
  const defaultFocusMinutes = usePreferencesStore((s) => s.defaultFocusMinutes);
  const locale = useLocale() as Locale;
  const addEntry = useBrainDumpStore((s) => s.addEntry);
  const brainDumpCount = useBrainDumpStore((s) => s.entries.length);
  const energyLatest = useEnergyStore((s) => s.entries[0] ?? null);
  const todaysFocusMinutes = useFocusStore((s) => s.todaysMinutes());
  const [quickDraft, setQuickDraft] = useState("");

  const [greetingKey, setGreetingKey] = useState<"night" | "morning" | "afternoon" | "evening">("morning");

useEffect(() => {
  const hour = new Date().getHours();
  setGreetingKey(hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
}, []);
  // Compute next-step (most urgent non-done task).
  const nextTask = tasks
    .filter((task) => task.status !== "done" && !task.archived && !task.snoozed)
    .sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (order[a.priority] ?? 99) - (order[b.priority] ?? 99);
    })[0];

  const tasksDoneToday = tasks.filter((t) => t.status === "done").length;

  const quickCapture = () => {
    const text = quickDraft.trim();
    if (!text) return;
    addEntry(text, { quickCapture: true });
    setQuickDraft("");
    toast.success(t("signature.quickCapture.saved"));
  };

  // For the dashboard FocusCard preview:
  const focusState: FocusCardState = activeFocus ? "running" : "idle";
  const remainingMinutes = activeFocus
    ? Math.max(
        0,
        activeFocus.plannedMinutes -
          Math.floor(
            (Date.now() - new Date(activeFocus.startedAt).getTime()) / 60000
          )
      )
    : defaultFocusMinutes;

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Greeting hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-background to-background p-5 sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">
          {t(`dashboard.hero.greeting.${greetingKey}`)}
        </p>
        <h1 className="t-hero mt-1 text-foreground">
          {t("dashboard.hero.whatMattersNow")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("dashboard.hero.subtitle")}
        </p>

        {/* Quick inline capture */}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            quickCapture();
          }}
        >
          <Textarea
            value={quickDraft}
            onChange={(e) => setQuickDraft(e.target.value)}
            placeholder={t("signature.quickCapture.placeholder")}
            rows={1}
            maxLength={1000}
            aria-label={t("signature.quickCapture.placeholder")}
            className="resize-none flex-1 min-h-10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                quickCapture();
              }
            }}
          />
          <Button
            type="submit"
            disabled={!quickDraft.trim()}
            size="icon"
            aria-label={t("signature.quickCapture.save")}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </form>
        <div className="mt-4">
          <MindStepPurchaseButton />
        </div>
      </section>

      {/* Quick actions — signature UX */}
      <section>
        <QuickActionsBar layout="grid" />
      </section>

      {/* Top priorities + Energy check side-by-side on desktop */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopPrioritiesCard />
        </div>
        <EnergyCheckCard />
      </section>

      {/* Next step — single-task hero */}
      {nextTask ? (
        <section>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" aria-hidden />
                {t("dashboard.sections.nextStep")}
              </CardTitle>
              <CardDescription>{t("dashboard.sections.nextStepDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-lg font-medium text-foreground">
                  {nextTask.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`tasks.priority.${nextTask.priority}`)} · {t(`tasks.energy.${nextTask.energy}`)}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => openDialog("startFocus", { initialTaskId: nextTask.id })}
                  className="flex-1 sm:flex-none"
                >
                  <Timer className="size-4 rtl-flip" aria-hidden />
                  <span className="ms-1">{t("signature.startFocus.begin")}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveSection("tasks")}
                >
                  {t("common.open")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Focus CTA + AI CTA */}
      <section className="grid gap-4 md:grid-cols-2">
        <FocusCard
          taskTitle={activeFocus?.taskTitle}
          remainingMinutes={remainingMinutes}
          plannedMinutes={activeFocus?.plannedMinutes ?? defaultFocusMinutes}
          state={focusState}
          interruptions={activeFocus?.interruptions ?? 0}
          labels={{
            title: tFocus("title"),
            subtitle: tFocus("subtitle"),
            sessionActive: tFocus("sessionActive"),
            sessionComplete: tFocus("sessionComplete"),
            interruptions: tFocus("interruptions"),
            start: tFocus("startSession"),
            pause: tFocus("pause"),
            resume: tFocus("resume"),
            stop: tFocus("stop"),
            complete: tFocus("complete"),
            noTask: tFocus("noTask"),
          }}
          onStart={() => openDialog("startFocus")}
        />

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-info" aria-hidden />
              {t("ai.title")}
            </CardTitle>
            <CardDescription>{t("dashboard.hero.aiHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t("ai.welcome")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveSection("ai")}
              className="w-full"
            >
              <Bot className="size-4" aria-hidden />
              <span className="ms-1">{t("ai.send")}</span>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Reminders + Progress */}
      <section className="grid gap-4 md:grid-cols-2">
        <RemindersCard />
        <ProgressCard />
      </section>

      {/* Today's rhythm (small stats) */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.sections.todayRhythm")}</CardTitle>
            <CardDescription>{t("dashboard.sections.todayRhythmDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RhythmCard
                label={t("dashboard.stats.tasksDone")}
                value={String(tasksDoneToday)}
              />
              <RhythmCard
                label={t("dashboard.stats.focusMinutes")}
                value={formatDuration(todaysFocusMinutes, locale)}
              />
              <RhythmCard
                label={t("dashboard.stats.brainDumps")}
                value={String(brainDumpCount)}
              />
              <RhythmCard
                label={t("dashboard.stats.energy")}
                value={energyLatest ? `${energyLatest.level}/5` : "—"}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RhythmCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
