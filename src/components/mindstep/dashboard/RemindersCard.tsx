"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/mindstep/EmptyState";
import { useTaskStore } from "@/stores/task-store";
import { Bell, Check, Clock, AlertTriangle, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import { useLocale, useTranslations as useT } from "next-intl";
import { formatRelativeTime } from "@/lib/locale-utils";

interface RemindersCardProps {
  className?: string;
}

interface Reminder {
  id: string;
  title: string;
  /** ISO date string. */
  dueAt: string;
  /** Source: "task" | "bill" | "subscription" | "calendar" — only "task" for now. */
  source: string;
}

/**
 * Reminders — items due soon or overdue.
 * Reads from the task store. Phase 2 will add bills, subscriptions,
 * and calendar events to the same view.
 *
 * Never shows notifications (a separate concern) and never overflows
 * past ~6 items.
 */
export function RemindersCard({ className }: RemindersCardProps) {
  const t = useTranslations("reminders");
  const tT = useTranslations("tasks");
  const tc = useTranslations("common");
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const locale = useLocale() as Locale;

  const now = Date.now();
  const reminders: Reminder[] = tasks
    .filter((task) => task.dueAt && task.status !== "done")
    .map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt as string,
      source: "task",
    }))
    .filter((r) => {
      // Only show reminders within the next 7 days (including overdue).
      const due = new Date(r.dueAt).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      return due >= now - sevenDays && due <= now + sevenDays;
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 6);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Bell className="size-4 text-primary" aria-hidden />
            {t("title")}
          </span>
          {reminders.length === 0 ? (
            <BellOff className="size-4 text-muted-foreground" aria-hidden />
          ) : null}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {reminders.length === 0 ? (
          <EmptyState
            title={t("empty")}
            description={t("subtitle")}
            icon={<Bell className="size-6" aria-hidden />}
          />
        ) : (
          <ul className="space-y-1">
            {reminders.map((reminder) => {
              const due = new Date(reminder.dueAt);
              const overdue = due.getTime() < now;
              const relative = formatRelativeTime(due, locale);
              return (
                <li
                  key={reminder.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-card p-2.5 transition-colors hover:bg-muted/30"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      overdue
                        ? "bg-destructive/10 text-destructive"
                        : "bg-info/10 text-info"
                    )}
                    aria-hidden
                  >
                    {overdue ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {reminder.title}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        overdue ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {overdue ? t("overdue") : t("dueSoon")} · {relative}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-success hover:bg-success/10"
                    onClick={() => toggleTask(reminder.id)}
                    aria-label={t("markDone")}
                    title={t("markDone")}
                  >
                    <Check className="size-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
