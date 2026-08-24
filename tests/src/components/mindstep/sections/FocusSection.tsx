"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { ProgressRing } from "../ProgressRing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardDescription as CD } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFocusTimer, formatTimerDisplay, type FocusSessionData } from "@/hooks/use-focus-timer";
import { useDialogStore } from "@/stores/dialog-store";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import {
  Play, Pause, Square, Timer as TimerIcon,
  AlertCircle, Plus, Wind, Footprints, Undo2,
  Zap, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Default focus API header for the test-user. */
const FOCUS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

const DURATION_PRESETS = [
  { minutes: 5, key: "focus5" as const },
  { minutes: 10, key: "focus10" as const },
  { minutes: 15, key: "focus15" as const },
  { minutes: 25, key: "focus25" as const },
  { minutes: 30, key: "focus30" as const },
  { minutes: 45, key: "focus45" as const },
  { minutes: 60, key: "focus60" as const },
  { minutes: 90, key: "focus90" as const },
];

type SessionStatus = "active" | "paused" | "completed" | "cancelled";

interface ApiSession {
  id: string;
  taskId: string | null;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: SessionStatus;
  pausedAt: string | null;
  accumulatedPausedMs: number;
  interruptions: number;
  notes: string | null;
  taskTitle: string | null;
}

export function FocusSection() {
  const t = useTranslations("focus");
  const tc = useTranslations("common");
  const tFocus = useTranslations("focus");
  const tRoot = useTranslations();
  const tAdhdCards = useTranslations("dashboard.adhdCards");
  const tSignature = useTranslations("signature");
  const openDialog = useDialogStore((s) => s.openDialog);
  const setActiveSection = useUIStore((s) => s.setActiveSection);

  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distractionDraft, setDistractionDraft] = useState("");
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [pendingAction, setPendingAction] = useState(false);

  // Planned minutes for the idle state (when no session is active).
  const [plannedMinutes, setPlannedMinutes] = useState(15);

  // Convert the API session to the timer hook's expected format.
  const timerSession: FocusSessionData | null = session
    ? {
        id: session.id,
        startedAt: session.startedAt,
        plannedMinutes: session.plannedMinutes,
        pausedAt: session.pausedAt,
        accumulatedPausedMs: session.accumulatedPausedMs,
        status: session.status,
      }
    : null;

  const timer = useFocusTimer(timerSession);

  // ===== Screen reader announcements =====
  // Declared as a useCallback near the top so every handler below captures an
  // already-defined binding (avoids the `react-hooks/immutability` "accessed
  // before declared" error and is stable across renders).
  const announce = useCallback((msg: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("locale-live-region");
    if (el) {
      el.textContent = "";
      window.setTimeout(() => { el.textContent = msg; }, 50);
    }
  }, []);

  // ===== Fetch the active session on mount (refresh recovery — Prompt 05 §9) =====
  const fetchActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/focus-sessions/active", { headers: FOCUS_HEADERS });
      if (!res.ok) throw new Error("Failed to fetch active session");
      const data = await res.json();
      setSession(data.session ?? null);
      // If the session is already completed but was just fetched, show completion.
      if (data.session?.status === "completed") {
        setShowCompletion(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // ===== Auto-complete when timer reaches zero (Prompt 05 §14) =====
  // NOTE: `handleComplete` is declared above this effect (not below) so the
  // effect's closure captures an already-defined binding. Reordering here is
  // purely lexical — runtime behavior is unchanged.
  const completedRef = useRef(false);

  // ===== API actions =====
  const handleComplete = async () => {
    if (!session) return;
    setPendingAction(true);
    try {
      const res = await fetch(`/api/focus-sessions/${session.id}/complete`, {
        method: "PATCH",
        headers: FOCUS_HEADERS,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to complete session");
      const data = await res.json();
      setSession(data.session);
      setShowCompletion(true);
      announce(tFocus("aria.timerCompleted"));
    } catch {
      toast.error(tFocus("subtitle"));
    } finally {
      setPendingAction(false);
    }
  };

  useEffect(() => {
    if (timer.isExpired && session && session.status === "active" && !completedRef.current) {
      completedRef.current = true;
      handleComplete();
    }
  }, [timer.isExpired, session?.status]);

  // Reset the completion flag when session changes.
  useEffect(() => {
    completedRef.current = false;
  }, [session?.id]);

  // ===== API actions =====
  const startSession = async (minutes: number, taskId?: string, taskTitle?: string) => {
    setPendingAction(true);
    setError(null);
    try {
      const res = await fetch("/api/focus-sessions/start", {
        method: "POST",
        headers: FOCUS_HEADERS,
        body: JSON.stringify({
          plannedMinutes: minutes,
          taskId: taskId ?? null,
          taskTitle: taskTitle ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Failed to start session");
      }
      const data = await res.json();
      setSession(data.session);
      setShowCompletion(false);
      // Screen reader announcement.
      announce(tFocus("aria.timerStarted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPendingAction(false);
    }
  };

  const pauseSession = async () => {
    if (!session) return;
    setPendingAction(true);
    try {
      const res = await fetch(`/api/focus-sessions/${session.id}/pause`, {
        method: "PATCH",
        headers: FOCUS_HEADERS,
      });
      if (!res.ok) throw new Error("Failed to pause");
      const data = await res.json();
      setSession(data.session);
      announce(tFocus("aria.timerPaused"));
    } catch {
      // Network error — don't catastrophically stop (Prompt 05 §57).
      toast.error(tFocus("subtitle"));
    } finally {
      setPendingAction(false);
    }
  };

  const resumeSession = async () => {
    if (!session) return;
    setPendingAction(true);
    try {
      const res = await fetch(`/api/focus-sessions/${session.id}/resume`, {
        method: "PATCH",
        headers: FOCUS_HEADERS,
      });
      if (!res.ok) throw new Error("Failed to resume");
      const data = await res.json();
      setSession(data.session);
      announce(tFocus("aria.timerResumed"));
    } catch {
      toast.error(tFocus("subtitle"));
    } finally {
      setPendingAction(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    setPendingAction(true);
    try {
      const res = await fetch(`/api/focus-sessions/${session.id}/end`, {
        method: "PATCH",
        headers: FOCUS_HEADERS,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to end session");
      const data = await res.json();
      setSession(null);
      announce(tFocus("aria.timerEnded"));
    } catch {
      toast.error(tFocus("subtitle"));
    } finally {
      setPendingAction(false);
    }
  };

  const captureDistraction = async () => {
    const trimmed = distractionDraft.trim();
    if (!trimmed || !session) return;
    try {
      const res = await fetch(`/api/focus-sessions/${session.id}/distraction`, {
        method: "POST",
        headers: FOCUS_HEADERS,
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to capture distraction");
      // Update local session state to reflect the incremented interruption count.
      setSession((prev) => prev ? { ...prev, interruptions: prev.interruptions + 1 } : prev);
      setDistractionDraft("");
      toast.success(tFocus("distractionSaved"));
      announce(tFocus("aria.distractionCaptured"));
    } catch {
      toast.error(tFocus("subtitle"));
    }
  };

  // ===== RENDER =====
  if (loading) return <LoadingState lines={4} />;
  if (error && !session) return <ErrorState onRetry={fetchActive} />;

  // ===== Welcome Back (Prompt 05 §35) — active or paused session =====
  if (session && (session.status === "active" || session.status === "paused") && !showCompletion) {
    const isPaused = session.status === "paused";
    const taskLabel = session.taskTitle ?? tFocus("noTask");

    return (
      <div className="space-y-6">
        <SectionHeader title={tFocus("title")} description={tFocus("subtitle")} />

        {/* Active session card with timestamp-based timer */}
        <Card className={cn(
          "overflow-hidden border-primary/40",
          timer.isExpired && "border-success/40 bg-success/5"
        )}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className={cn("flex items-center gap-2", !isPaused && !timer.isExpired && "text-primary")}>
                <TimerIcon className={cn("size-4", !isPaused && !timer.isExpired && "breathe")} aria-hidden />
                {timer.isExpired ? tFocus("sessionComplete") : isPaused ? tFocus("sessionPaused") : tFocus("sessionActive")}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {tFocus("interruptions")}: {session.interruptions}
              </span>
            </CardTitle>
            <CD className="text-xs truncate">{taskLabel}</CD>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ProgressRing
              value={timer.fraction}
              size={140}
              strokeWidth={10}
              color={timer.isExpired ? "success" : "primary"}
              label={
                <div className="text-center">
                  <p className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums"
                     style={{ direction: "ltr" }}
                     aria-label={tFocus("aria.minutesRemaining", { minutes: timer.remainingMinutes })}>
                    {timer.display}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {session.plannedMinutes} min
                  </p>
                </div>
              }
              ariaLabel={`${timer.remainingMinutes} minutes remaining of ${session.plannedMinutes} minute session`}
            />

            <div className="flex flex-wrap items-center justify-center gap-2">
              {!isPaused && !timer.isExpired ? (
                <Button onClick={pauseSession} variant="outline" disabled={pendingAction}>
                  <Pause className="size-4" aria-hidden />
                  <span className="ms-2">{tFocus("pause")}</span>
                </Button>
              ) : null}
              {isPaused ? (
                <Button onClick={resumeSession} disabled={pendingAction}>
                  <Play className="size-4 rtl-flip" aria-hidden />
                  <span className="ms-2">{tFocus("resume")}</span>
                </Button>
              ) : null}
              {!timer.isExpired ? (
                <Button onClick={endSession} variant="ghost" disabled={pendingAction}>
                  <Square className="size-4" aria-hidden />
                  <span className="ms-2">{tFocus("endFocus")}</span>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Distraction capture (Prompt 05 §18, §19, §38) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4 text-info" aria-hidden />
              {tFocus("distractionCapture")}
            </CardTitle>
            <CD>{tFocus("distractionPlaceholder")}</CD>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={distractionDraft}
                onChange={(e) => setDistractionDraft(e.target.value)}
                placeholder={tFocus("distractionPlaceholder")}
                aria-label={tFocus("distractionPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    captureDistraction();
                  }
                }}
              />
              <Button onClick={captureDistraction} disabled={!distractionDraft.trim()} variant="outline">
                <Plus className="size-4" aria-hidden />
                <span className="ms-1 hidden sm:inline">{tFocus("captureDistraction")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick action buttons — I Can't Start, Overwhelm Mode, One Step (Prompt 05 §20, §21, §22) */}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => openDialog("iCantStart")}>
            <Footprints className="size-4" aria-hidden />
            <span className="ms-1">{tAdhdCards("iCantStart.title")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => endSession()}>
            <Wind className="size-4" aria-hidden />
            <span className="ms-1">{tFocus("endFocus")}</span>
          </Button>
        </div>
      </div>
    );
  }

  // ===== Completion screen (Prompt 05 §28) =====
  if (showCompletion && session?.status === "completed") {
    const actualMin = session.actualMinutes ?? session.plannedMinutes;
    return (
      <div className="space-y-6">
        <SectionHeader title={tFocus("title")} description={tFocus("subtitle")} />

        <Card className="border-success/40 bg-success/5">
          <CardHeader className="items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
              <Zap className="size-8" aria-hidden />
            </div>
            <CardTitle className="mt-2 text-base">{tFocus("completion.title")}</CardTitle>
            <CD>
              {tFocus("completion.duration", { minutes: actualMin })}
              {session.taskTitle ? ` · ${session.taskTitle}` : ""}
            </CD>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {tFocus("completion.whatDidYouDo")}
              </label>
              <Textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder={tFocus("completion.whatDidYouDoPlaceholder")}
                rows={2}
                maxLength={2000}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (completionNote.trim() && session) {
                    // Save the note to the session.
                    await fetch(`/api/focus-sessions/${session.id}/end`, {
                      method: "PATCH",
                      headers: FOCUS_HEADERS,
                      body: JSON.stringify({ notes: completionNote.trim() }),
                    }).catch(() => {});
                  }
                  setShowCompletion(false);
                  setSession(null);
                  setCompletionNote("");
                }}
              >
                {tFocus("completion.done")}
              </Button>
              <Button variant="outline" onClick={() => startSession(15)}>
                {tFocus("completion.startAnother")}
              </Button>
              <Button variant="ghost" onClick={() => setActiveSection("tasks")}>
                {tFocus("completion.backToTasks")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Idle state — no active session =====
  return (
    <div className="space-y-6">
      <SectionHeader title={tFocus("title")} description={tFocus("subtitle")} />

      {/* Just 5 minutes — ultra-low-friction (Prompt 05 §6) */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-foreground">{tFocus("justFive")}</p>
            <p className="text-xs text-muted-foreground">{tFocus("subtitle")}</p>
          </div>
          <Button
            size="lg"
            onClick={() => startSession(5)}
            disabled={pendingAction}
          >
            <Play className="size-4 rtl-flip" aria-hidden />
            <span className="ms-1">5 min</span>
          </Button>
        </CardContent>
      </Card>

      {/* Duration presets (Prompt 05 §5) */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {tFocus("duration")}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              onClick={() => setPlannedMinutes(preset.minutes)}
              aria-pressed={plannedMinutes === preset.minutes}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                plannedMinutes === preset.minutes
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-muted text-muted-foreground"
              )}
            >
              <span className="block text-base tabular-nums">{preset.minutes}m</span>
              <span className="block text-[10px] uppercase tracking-wider opacity-70">
                {tFocus(`preset.${preset.key}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <Button
        size="lg"
        className="w-full"
        onClick={() => startSession(plannedMinutes)}
        disabled={pendingAction}
      >
        <Play className="size-4 rtl-flip" aria-hidden />
        <span className="ms-2">{tFocus("startSession")}</span>
      </Button>

      {/* Signature UX entry points */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" size="sm" onClick={() => openDialog("startFocus")}>
          <TimerIcon className="size-4" aria-hidden />
          <span className="ms-1">{tFocus("startSession")}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => openDialog("iCantStart")}>
          <Footprints className="size-4" aria-hidden />
          <span className="ms-1">{tAdhdCards("iCantStart.title")}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => openDialog("resetMyDay")}>
          <Undo2 className="size-4 rtl-flip" aria-hidden />
          <span className="ms-1">{tAdhdCards("resetMyDay.title")}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => openDialog("quickCapture")}>
          <Wind className="size-4" aria-hidden />
          <span className="ms-1">{tSignature("quickCapture.title")}</span>
        </Button>
      </div>

      {/* Focus History + Stats */}
      <FocusHistoryAndStats />
    </div>
  );
}

// ===== Focus History + Statistics (Prompt 05 §29, §30, §31, §32) =====
function FocusHistoryAndStats() {
  const tFocus = useTranslations("focus");
  const [stats, setStats] = useState<{
    totalMinutes: number;
    totalSessions: number;
    completedSessions: number;
    averageSessionMinutes: number;
    longestSessionMinutes: number;
    byDay: Array<{ date: string; minutes: number; sessions: number }>;
    byTask: Array<{ taskId: string; taskTitle: string; totalMinutes: number }>;
  } | null>(null);
  const [history, setHistory] = useState<Array<{
    id: string;
    plannedMinutes: number;
    actualMinutes: number | null;
    status: string;
    taskTitle: string | null;
    endedAt: string | null;
  }>>([]);
  const [range, setRange] = useState<"today" | "week" | "month">("today");
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/focus-sessions/stats", {
        headers: FOCUS_HEADERS,
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch {
      // Silent fail — don't block the UI.
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/focus-sessions/history?range=${range}`, {
        headers: FOCUS_HEADERS,
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.sessions ?? []);
    } catch {
      // Silent fail.
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  if (loading && !stats) return null;

  // Zero-data state (Prompt 05 §30).
  if (stats && stats.totalSessions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tFocus("stats.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title={tFocus("stats.empty")}
            description={tFocus("history.empty")}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Statistics */}
      {stats ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tFocus("stats.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={tFocus("stats.totalMinutes")} value={`${stats.totalMinutes}`} />
              <StatCard label={tFocus("stats.totalSessions")} value={`${stats.totalSessions}`} />
              <StatCard label={tFocus("stats.averageSession")} value={`${stats.averageSessionMinutes}m`} />
              <StatCard label={tFocus("stats.longestSession")} value={`${stats.longestSessionMinutes}m`} />
            </div>
            {/* Trends (Prompt 05 §32 — neutral, non-judgmental) */}
            {stats.totalMinutes > 0 ? (
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>{tFocus("stats.trendWeek", { minutes: stats.byDay.reduce((sum, d) => sum + d.minutes, 0) })}</p>
                {stats.longestSessionMinutes > 0 ? (
                  <p>{tFocus("stats.trendLongest", { minutes: stats.longestSessionMinutes })}</p>
                ) : null}
              </div>
            ) : null}

            {/* By task (Prompt 05 §31) */}
            {stats.byTask.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {tFocus("stats.byTask")}
                </p>
                <ul className="space-y-1">
                  {stats.byTask.map((item) => (
                    <li key={item.taskId} className="flex items-center justify-between text-sm">
                      <span className="truncate text-foreground">{item.taskTitle}</span>
                      <span className="ms-2 tabular-nums text-muted-foreground">{item.totalMinutes} min</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{tFocus("history.title")}</CardTitle>
            <div className="flex gap-1">
              {(["today", "week", "month"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    range === r
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tFocus(`history.${r === "today" ? "today" : r === "week" ? "thisWeek" : "thisMonth"}`)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState title={tFocus("history.empty")} />
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pe-1">
              {history.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    s.status === "completed" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}>
                    <TimerIcon className="size-4" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.taskTitle ?? tFocus("noTask")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.actualMinutes ?? s.plannedMinutes} min · {s.status}
                    </p>
                  </div>
                  {s.endedAt ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
