"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Repeat, Plus, Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface Habit {
  id: string;
  name: string;
  cue?: string;
  routine?: string;
  reward?: string;
  streak: number;
  doneToday: boolean;
}

export function HabitsSection() {
  const t = useTranslations();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftCue, setDraftCue] = useState("");

  const addHabit = () => {
    const name = draftName.trim();
    if (!name) return;
    setHabits((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        cue: draftCue.trim() || undefined,
        streak: 0,
        doneToday: false,
      },
    ]);
    setDraftName("");
    setDraftCue("");
  };

  const toggleDone = (id: string) =>
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              doneToday: !h.doneToday,
              streak: !h.doneToday ? h.streak + 1 : Math.max(0, h.streak - 1),
            }
          : h
      )
    );

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("habits.title")}
        description={t("habits.subtitle")}
      />

      {/* New habit form */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <label htmlFor="habit-name" className="text-xs font-medium text-muted-foreground">
              {t("habits.fields.name")}
            </label>
            <Input
              id="habit-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t("habits.fields.name")}
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor="habit-cue" className="text-xs font-medium text-muted-foreground">
              {t("habits.fields.cue")}
            </label>
            <Input
              id="habit-cue"
              value={draftCue}
              onChange={(e) => setDraftCue(e.target.value)}
              placeholder={t("habits.fields.cue")}
              maxLength={300}
            />
          </div>
          <Button onClick={addHabit} disabled={!draftName.trim()} size="sm" className="w-full">
            <Plus className="size-4" aria-hidden />
            <span className="ms-1">{t("habits.add")}</span>
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      {habits.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-6" aria-hidden />}
          title={t("habits.empty")}
          description={t("habits.subtitle")}
        />
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => (
            <li key={habit.id}>
              <Card className={cn("transition-colors", habit.doneToday && "border-primary/40 bg-primary/5")}>
                <CardContent className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => toggleDone(habit.id)}
                    aria-pressed={habit.doneToday}
                    aria-label={habit.doneToday ? t("tasks.markUndone") : t("tasks.markDone")}
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      habit.doneToday
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <Check className="size-4" aria-hidden />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{habit.name}</p>
                    {habit.cue ? (
                      <p className="truncate text-xs text-muted-foreground">↪ {habit.cue}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Flame className={cn("size-3.5", habit.streak > 0 && "text-warning")} aria-hidden />
                    <span className="tabular-nums">{habit.streak}</span>
                    <span className="hidden sm:inline">{t("habits.streak").toLowerCase()}</span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
