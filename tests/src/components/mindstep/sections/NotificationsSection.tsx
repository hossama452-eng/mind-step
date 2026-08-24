"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUIStore } from "@/stores/ui-store";
import { useDialogStore } from "@/stores/dialog-store";
import { useNetworkStore } from "@/stores/network-store";
import { toast } from "sonner";
import {
  Bell,
  Check,
  CheckCheck,
  X,
  RefreshCw,
  Clock,
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronDown,
  CalendarClock,
  CheckCircle2,
  AlarmClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import { formatRelativeTime } from "@/lib/locale-utils";
import { offlineFetch } from "@/lib/offline/offline-fetch";

const NOTIF_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
  snoozedCount: number;
  priority: string;
  createdAt: string;
  metadata?: string | null;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  task_due: Clock,
  task_overdue: AlertTriangle,
  focus_start: Bell,
  focus_end: Check,
  missed_plan: CalendarIcon,
  planning_reminder: CalendarIcon,
  ai_nudge: Bell,
  system: Bell,
  // Prompt 10 — new types
  habit_reminder: Bell,
  calendar_event: CalendarIcon,
  bill_due: AlertTriangle,
  routine_reminder: Clock,
  milestone: CheckCircle2,
  project: CheckCircle2,
  focus_reminder: Clock,
  recovery_suggestion: RefreshCw,
  planned_task: Clock,
  focus_end_check: Check,
  ai_insight: Bell,
  habit: Bell,
};

// AlarmClock presets — wire to the server's accepted values.
const SNOOZE_PRESETS: Array<{ key: "10min" | "30min" | "1hour" | "tomorrow"; labelKey: string }> = [
  { key: "10min", labelKey: "10min" },
  { key: "30min", labelKey: "30min" },
  { key: "1hour", labelKey: "1hour" },
  { key: "tomorrow", labelKey: "tomorrow" },
];

export function NotificationsSection() {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const openDialog = useDialogStore((s) => s.openDialog);
  const online = useNetworkStore((s) => s.online);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which notification is being rescheduled (open the calendar dialog).
  const [rescheduling, setRescheduling] = useState<Notification | null>(null);
  // Track busy state per-notification (so the user can't double-tap).
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Run the scheduler first (idempotent — won't create duplicates).
      // Uses offlineFetch so this doesn't fail hard when offline.
      await offlineFetch("/api/notifications/schedule", {
        method: "POST",
        headers: NOTIF_HEADERS,
      }).catch(() => {});

      const res = await fetch(`/api/notifications?filter=${filter}`, {
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Smart reminder actions
  const setBusyFor = (id: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: value }));

  const handleAlarmClock = async (notif: Notification, duration: "10min" | "30min" | "1hour" | "tomorrow") => {
    if (busy[notif.id]) return; // Prevent duplicate submission
    setBusyFor(notif.id, true);
    try {
      const res = await offlineFetch(`/api/notifications/${notif.id}/snooze`, {
        method: "PATCH",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ duration }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.capped) {
        toast.info(t("snooze.capped"));
      } else if (res.ok) {
        toast.success(t("snoozeResult.success"));
        if (duration === "tomorrow") toast.success(t("snoozeResult.tomorrowScheduled"));
        // Remove from local list (it's snoozed — hidden until snoozedUntil).
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
        setUnreadCount((c) => Math.max(0, c - 1));
      } else {
        throw new Error(data?.error?.message ?? "Failed to snooze");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to snooze.");
    } finally {
      setBusyFor(notif.id, false);
    }
  };

  const handleComplete = async (notif: Notification) => {
    if (busy[notif.id]) return;
    setBusyFor(notif.id, true);
    try {
      const res = await offlineFetch(`/api/notifications/${notif.id}/complete`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Failed to complete");
      }
      // Show contextual success message based on entity type.
      const entityMsg = (() => {
        switch (notif.entityType) {
          case "task": return t("completeResult.taskCompleted");
          case "reminder": return t("completeResult.reminderCompleted");
          case "bill": return t("completeResult.billPaid");
          case "habit": return t("completeResult.habitMarkedDone");
          default: return t("completeResult.success");
        }
      })();
      toast.success(entityMsg);
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete.");
    } finally {
      setBusyFor(notif.id, false);
    }
  };

  const handleRescheduleSubmit = async (notif: Notification, newTime: Date) => {
    if (busy[notif.id]) return;
    setBusyFor(notif.id, true);
    try {
      const res = await offlineFetch(`/api/notifications/${notif.id}/reschedule`, {
        method: "PATCH",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ newTime: newTime.toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error?.message?.includes("future")) {
          toast.error(t("reschedule.pastTime"));
          return;
        }
        throw new Error(data?.error?.message ?? "Failed to reschedule");
      }
      toast.success(t("reschedule.success"));
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setUnreadCount((c) => Math.max(0, c - 1));
      setRescheduling(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule.");
    } finally {
      setBusyFor(notif.id, false);
    }
  };

  const handleMarkRead = async (id: string) => {
    if (busy[id]) return;
    setBusyFor(id, true);
    try {
      await offlineFetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Failed to mark as read.");
    } finally {
      setBusyFor(id, false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await offlineFetch("/api/notifications/mark-all-read", {
        method: "POST",
        headers: NOTIF_HEADERS,
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      );
      setUnreadCount(0);
      toast.success(t("aria.markedAllRead"));
    } catch {
      toast.error("Failed to mark all as read.");
    }
  };

  const handleDismiss = async (id: string) => {
    if (busy[id]) return;
    setBusyFor(id, true);
    try {
      await offlineFetch(`/api/notifications/${id}/dismiss`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
      toast.success(t("aria.dismissed"));
    } catch {
      toast.error("Failed to dismiss.");
    } finally {
      setBusyFor(id, false);
    }
  };

  const handleAction = (notif: Notification) => {
    // Mark as read when the user interacts.
    if (!notif.readAt) handleMarkRead(notif.id);

    // Navigate based on entity type.
    if (notif.entityType === "task") {
      setActiveSection("tasks");
    } else if (notif.entityType === "time_block") {
      setActiveSection("planner");
    } else if (notif.entityType === "habit") {
      setActiveSection("habits");
    } else if (notif.entityType === "calendar_event") {
      setActiveSection("planner");
    } else if (notif.entityType === "bill" || notif.entityType === "routine") {
      setActiveSection("dashboard");
    } else if (notif.type === "focus_start" || notif.type === "focus_end") {
      setActiveSection("focus");
    } else if (notif.type === "missed_plan" || notif.type === "planning_reminder") {
      setActiveSection("planner");
    } else {
      setActiveSection("dashboard");
    }
  };

  // Group: Today vs Earlier.
  const today: Notification[] = [];
  const earlier: Notification[] = [];
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  for (const n of notifications) {
    if (new Date(n.createdAt) >= dayStart) today.push(n);
    else earlier.push(n);
  }

  if (loading) return <LoadingState lines={4} />;
  if (error) return <ErrorState onRetry={fetchNotifications} />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("title")}
        description={t("unreadCount", { count: unreadCount })}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-9" onClick={fetchNotifications} aria-label={t("refresh")}>
              <RefreshCw className="size-4" aria-hidden />
            </Button>
            {unreadCount > 0 ? (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="size-4" aria-hidden />
                <span className="ms-1 hidden sm:inline">{t("markAllRead")}</span>
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px]",
            filter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {t("all")}
        </button>
        <button
          onClick={() => setFilter("unread")}
          aria-pressed={filter === "unread"}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px]",
            filter === "unread" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {t("unread")} {unreadCount > 0 ? <Badge variant="secondary" className="ms-1 text-xs">{unreadCount}</Badge> : null}
        </button>
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-6" aria-hidden />}
          title={t("empty")}
          description={t("empty")}
        />
      ) : (
        <div className="space-y-6">
          {/* Today */}
          {today.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("today")}</p>
              <ul className="space-y-2">
                {today.map((notif) => (
                  <NotificationItem
                    key={notif.id}
                    notif={notif}
                    isBusy={busy[notif.id] ?? false}
                    onMarkRead={handleMarkRead}
                    onDismiss={handleDismiss}
                    onOpen={handleAction}
                    onAlarmClock={handleAlarmClock}
                    onReschedule={(n) => setRescheduling(n)}
                    onComplete={handleComplete}
                    t={t}
                    tCommon={tCommon}
                    locale={locale}
                    online={online}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {/* Earlier */}
          {earlier.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("earlier")}</p>
              <ul className="space-y-2">
                {earlier.map((notif) => (
                  <NotificationItem
                    key={notif.id}
                    notif={notif}
                    isBusy={busy[notif.id] ?? false}
                    onMarkRead={handleMarkRead}
                    onDismiss={handleDismiss}
                    onOpen={handleAction}
                    onAlarmClock={handleAlarmClock}
                    onReschedule={(n) => setRescheduling(n)}
                    onComplete={handleComplete}
                    t={t}
                    tCommon={tCommon}
                    locale={locale}
                    online={online}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {/* Reschedule dialog */}
      <RescheduleDialog
        notif={rescheduling}
        open={!!rescheduling}
        onOpenChange={(o) => !o && setRescheduling(null)}
        onConfirm={(newTime) => rescheduling && handleRescheduleSubmit(rescheduling, newTime)}
        t={t}
      />
    </div>
  );
}

function NotificationItem({
  notif,
  isBusy,
  onMarkRead,
  onDismiss,
  onOpen,
  onAlarmClock,
  onReschedule,
  onComplete,
  t,
  tCommon,
  locale,
  online,
}: {
  notif: Notification;
  isBusy: boolean;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpen: (notif: Notification) => void;
  onAlarmClock: (notif: Notification, duration: "10min" | "30min" | "1hour" | "tomorrow") => void;
  onReschedule: (notif: Notification) => void;
  onComplete: (notif: Notification) => void;
  t: ReturnType<typeof useTranslations<"notifications">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
  locale: Locale;
  online: boolean;
}) {
  const isUnread = !notif.readAt;
  const Icon = TYPE_ICONS[notif.type] ?? Bell;
  const typeLabel = t(`types.${notif.type}` as never) ?? notif.type;
  const isAlarmClockd = !!notif.snoozedUntil && new Date(notif.snoozedUntil) > new Date();

  return (
    <li>
      <Card className={cn(
        "transition-colors",
        isUnread && !isAlarmClockd && "border-primary/30 bg-primary/5",
        isAlarmClockd && "opacity-60",
      )}>
        <CardContent className="flex items-start gap-3 p-3">
          <div className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <Icon className="size-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn("text-sm font-medium text-foreground break-words", isUnread && "font-semibold")}>
                {notif.title}
              </p>
              {isUnread ? (
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground break-words">{notif.body}</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{typeLabel}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(notif.createdAt, locale)}</span>
              {isAlarmClockd ? (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    <AlarmClock className="inline size-3 me-1" aria-hidden />
                    {t("snoozeResult.success")}
                  </span>
                </>
              ) : null}
            </div>

            {/* Smart reminder actions (Prompt 10) */}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpen(notif)}
                disabled={isBusy}
                className="text-xs min-h-[36px]"
              >
                {t("open")}
              </Button>

              {/* AlarmClock dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    className="text-xs min-h-[36px]"
                    aria-label={t("actions.snooze")}
                  >
                    <AlarmClock className="size-3" aria-hidden />
                    <span className="ms-1">{t("actions.snooze")}</span>
                    <ChevronDown className="size-3 ms-1 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{t("actions.snooze")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SNOOZE_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.key}
                      onClick={() => onAlarmClock(notif, preset.key)}
                      disabled={isBusy}
                    >
                      {t(`snooze.${preset.labelKey}` as never)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Reschedule */}
              <Button
                size="sm"
                variant="ghost"
                disabled={isBusy}
                onClick={() => onReschedule(notif)}
                className="text-xs min-h-[36px]"
              >
                <CalendarClock className="size-3" aria-hidden />
                <span className="ms-1">{t("actions.reschedule")}</span>
              </Button>

              {/* Complete */}
              <Button
                size="sm"
                variant="ghost"
                disabled={isBusy}
                onClick={() => onComplete(notif)}
                className="text-xs min-h-[36px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                <Check className="size-3" aria-hidden />
                <span className="ms-1">{t("actions.complete")}</span>
              </Button>

              {isUnread ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onMarkRead(notif.id)}
                  disabled={isBusy}
                  className="text-xs min-h-[36px]"
                >
                  <Check className="size-3" aria-hidden />
                  <span className="ms-1">{t("read")}</span>
                </Button>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(notif.id)}
                disabled={isBusy}
                className="text-xs min-h-[36px] text-muted-foreground hover:text-destructive"
                aria-label={t("actions.dismiss")}
              >
                <X className="size-3" aria-hidden />
                <span className="ms-1">{t("actions.dismiss")}</span>
              </Button>
            </div>

            {!online ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                <RefreshCw className="inline size-3 me-1 animate-spin" aria-hidden />
                {tCommon("loading")}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function RescheduleDialog({
  notif,
  open,
  onOpenChange,
  onConfirm,
  t,
}: {
  notif: Notification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newTime: Date) => void;
  t: ReturnType<typeof useTranslations<"notifications">>;
}) {
  const [date, setDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (open) setDate(undefined);
  }, [open]);

  const confirm = () => {
    if (!date) return;
    // Default time: 9 AM on the picked date.
    const dt = new Date(date);
    dt.setHours(9, 0, 0, 0);
    onConfirm(dt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reschedule.title")}</DialogTitle>
          <DialogDescription>{t("reschedule.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-h-[44px]">
                <CalendarIcon className="size-4 me-2" aria-hidden />
                {date ? date.toLocaleDateString() : t("reschedule.pickTime")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => setDate(d ?? undefined)}
                initialFocus
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
            {t("reschedule.cancel")}
          </Button>
          <Button onClick={confirm} disabled={!date} className="min-h-[44px]">
            {t("reschedule.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
