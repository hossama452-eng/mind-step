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
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/mindstep/LoadingButton";
import { useBrainDumpStore } from "@/stores/brain-dump-store";
import { toast } from "sonner";
import { Sparkles, CornerDownLeft } from "lucide-react";

interface QuickCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick Capture — global, keyboard-shortcut-accessible brain dump.
 * The user types anything, hits Enter or "Capture", and the entry is
 * added to the brain dump store with category=uncategorized.
 * Sorting happens later, in the Brain Dump section.
 */
export function QuickCaptureDialog({ open, onOpenChange }: QuickCaptureDialogProps) {
  const t = useTranslations("signature.quickCapture");
  const tc = useTranslations("common");
  const addEntry = useBrainDumpStore((s) => s.addEntry);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  // Reset draft when dialog opens/closes
  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  // Auto-focus when opening
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => {
        const el = document.getElementById("quick-capture-textarea");
        el?.focus();
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPending(true);
    addEntry(trimmed, { quickCapture: true });
    setPending(false);
    setDraft("");
    onOpenChange(false);
    toast.success(t("saved"));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to submit (without Shift — Shift+Enter = newline)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    // Escape to close (Dialog also handles this)
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <Textarea
          id="quick-capture-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholder")}
          rows={3}
          maxLength={1000}
          aria-label={t("placeholder")}
          className="resize-none"
          onKeyDown={handleKeyDown}
        />

        <DialogFooter className="items-center justify-between sm:justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CornerDownLeft className="size-3" aria-hidden />
            <span>{tc("save")}</span>
          </p>
          <div className="flex gap-2">
            <LoadingButton
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tc("cancel")}
            </LoadingButton>
            <LoadingButton
              onClick={submit}
              loading={pending}
              disabled={!draft.trim()}
            >
              {t("save")}
            </LoadingButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
