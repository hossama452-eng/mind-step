"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useBrainDumpStore, type BrainDumpCategory } from "@/stores/brain-dump-store";
import { Brain, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: BrainDumpCategory[] = ["uncategorized", "task", "idea", "reminder"];

const CATEGORY_COLORS: Record<BrainDumpCategory, string> = {
  task: "bg-primary/15 text-primary",
  idea: "bg-info/15 text-info",
  reminder: "bg-warning/15 text-warning",
  uncategorized: "bg-muted text-muted-foreground",
};

export function BrainDumpSection() {
  const t = useTranslations();
  const entries = useBrainDumpStore((s) => s.entries);
  const addEntry = useBrainDumpStore((s) => s.addEntry);
  const setCategory = useBrainDumpStore((s) => s.setCategory);
  const deleteEntry = useBrainDumpStore((s) => s.deleteEntry);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();

  const capture = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    startTransition(() => {
      addEntry(trimmed);
      setDraft("");
    });
  };

  const cycleCategory = (id: string, current: BrainDumpCategory) => {
    const idx = CATEGORY_ORDER.indexOf(current);
    const next = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length];
    setCategory(id, next);
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("brainDump.title")} description={t("brainDump.subtitle")} />

      {/* Capture box */}
      <div className="rounded-xl border border-border bg-card p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("brainDump.placeholder")}
          rows={3}
          maxLength={1000}
          aria-label={t("brainDump.placeholder")}
          className="resize-none border-0 p-0 focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              capture();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <p className="text-xs text-muted-foreground">{draft.length}/1000</p>
          <Button onClick={capture} disabled={!draft.trim()} size="sm">
            <Sparkles className="size-4" aria-hidden />
            <span className="ms-1">{t("brainDump.add")}</span>
          </Button>
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<Brain className="size-6" aria-hidden />}
          title={t("brainDump.empty")}
          description={t("brainDump.subtitle")}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground break-words">{entry.content}</div>
                {entry.quickCapture ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    · {t("signature.quickCapture.title")}
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => cycleCategory(entry.id, entry.category)}
                aria-label={t("brainDump.categorize")}
              >
                <Badge
                  variant="secondary"
                  className={cn("cursor-pointer text-xs", CATEGORY_COLORS[entry.category])}
                >
                  {t(`brainDump.categories.${entry.category}`)}
                </Badge>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteEntry(entry.id)}
                aria-label={t("common.delete")}
              >
                <Sparkles className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
