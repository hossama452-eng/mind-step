"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { useDialogStore } from "@/stores/dialog-store";
import { EXPERIMENT_TYPES } from "@/lib/insights/personal-experiments-types";

const NOTIF_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

export function StartExperimentDialog({
  open,
  onOpenChange,
  experimentType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experimentType?: string | null;
}) {
  const t = useTranslations("experiments");
  const closeDialog = useDialogStore((s) => s.closeDialog);

  const [type, setType] = useState<string>(experimentType ?? "shorter_focus");
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If the parent passed an initial type (from the weekly review suggestion),
  // sync it when the dialog opens.
  useEffect(() => {
    if (open && experimentType) setType(experimentType);
  }, [open, experimentType]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/personal-experiments", {
        method: "POST",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: title || undefined, hypothesis: hypothesis || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Failed to start experiment");
      }
      toast.success(t("started"));
      onOpenChange(false);
      // Trigger refresh in the parent — easiest is to reload the section by
      // dispatching a window event.
      window.dispatchEvent(new CustomEvent("mindstep:refresh-insights"));
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-5 text-accent" aria-hidden />
            {t("startTitle")}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>{t("fields.type")}</Label>
            <RadioGroup value={type} onValueChange={setType} className="gap-2">
              {EXPERIMENT_TYPES.map((tType) => (
                <label
                  key={tType}
                  htmlFor={`exp-type-${tType}`}
                  className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <RadioGroupItem value={tType} id={`exp-type-${tType}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t(`types.${tType}` as never)}</p>
                    <p className="text-xs text-muted-foreground">{t(`descriptions.${tType}` as never)}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Optional title */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-title">{t("fields.title")}</Label>
            <Input
              id="exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(`types.${type}` as never)}
              maxLength={120}
              className="min-h-[40px]"
            />
          </div>

          {/* Optional hypothesis */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-hypothesis">{t("fields.hypothesis")}</Label>
            <Textarea
              id="exp-hypothesis"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="I think this will help me…"
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="min-h-[40px]">
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[40px]">
            <FlaskConical className="size-4 me-1.5" aria-hidden />
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
