"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDialogStore } from "@/stores/dialog-store";
import { toast } from "sonner";
import {
  Shield,
  Lock,
  Eye,
  Database,
  KeyRound,
  HeartHandshake,
  Download,
  Trash2,
  AlertTriangle,
  MessageSquareOff,
  FileText,
  Share2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { MEDICAL_DISCLAIMER } from "@/lib/constants";

const NOTIF_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

// ============================================================
// TYPES
// ============================================================

interface Consent {
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  ageConfirmedAt: string | null;
  marketingOptIn: boolean;
  dataProcessingOptIn: boolean;
}

interface Preferences {
  aiCoachEnabled: boolean;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PrivacySection() {
  const t = useTranslations();
  const tPrivacy = useTranslations("privacy");
  const locale = useLocale();

  const [consent, setConsent] = useState<Consent | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deletingAI, setDeletingAI] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [savingConsent, setSavingConsent] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Local state for consent toggles (so user can edit before saving)
  const [consentDraft, setConsentDraft] = useState<Consent | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [consentRes, prefsRes] = await Promise.all([
        fetch("/api/privacy/consent", { headers: NOTIF_HEADERS }),
        fetch("/api/notifications/preferences", { headers: NOTIF_HEADERS }),
      ]);
      if (consentRes.ok) {
        const data = await consentRes.json();
        setConsent(data.consent);
        setConsentDraft(data.consent);
      }
      if (prefsRes.ok) {
        const data = await prefsRes.json();
        setPrefs({ aiCoachEnabled: data.preferences?.aiCoachEnabled ?? true });
      }
    } catch {
      // Silent fail — loading state shows.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ============================================================
  // ACTIONS
  // ============================================================

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/privacy/export", { headers: NOTIF_HEADERS });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      // Get filename from Content-Disposition header, or fallback.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `mindstep-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      // Trigger download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(tPrivacy("center.dataExport.success"));
    } catch {
      toast.error(tPrivacy("center.dataExport.failed"));
    } finally {
      setExporting(false);
    }
  }, [exporting, tPrivacy]);

  const handleDeleteAIHistory = useCallback(async () => {
    if (deletingAI) return;
    setDeletingAI(true);
    try {
      const res = await fetch("/api/privacy/delete-ai-history", {
        method: "POST",
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(tPrivacy("center.deleteAIHistory.success"));
    } catch {
      toast.error(tPrivacy("center.deleteAIHistory.failed"));
    } finally {
      setDeletingAI(false);
    }
  }, [deletingAI, tPrivacy]);

  const handleDeleteAccount = useCallback(async () => {
    if (deletingAccount) return;
    if (deleteConfirmText !== "DELETE") {
      toast.error(tPrivacy("center.deleteAccount.failed"));
      return;
    }
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/privacy/delete-account", {
        method: "POST",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(tPrivacy("center.deleteAccount.success"));
      // Clear local state and reload.
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch {
      toast.error(tPrivacy("center.deleteAccount.failed"));
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmText("");
    }
  }, [deletingAccount, deleteConfirmText, tPrivacy]);

  const handleSaveConsent = useCallback(async () => {
    if (savingConsent || !consentDraft) return;
    setSavingConsent(true);
    try {
      const res = await fetch("/api/privacy/consent", {
        method: "POST",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          termsAccepted: !!consentDraft.termsAcceptedAt,
          privacyAccepted: !!consentDraft.privacyAcceptedAt,
          ageConfirmed: !!consentDraft.ageConfirmedAt,
          marketingOptIn: consentDraft.marketingOptIn,
          dataProcessingOptIn: consentDraft.dataProcessingOptIn,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setConsent(data.consent);
      setConsentDraft(data.consent);
      toast.success(tPrivacy("center.consentManagement.saved"));
    } catch {
      toast.error(tPrivacy("center.deleteAccount.failed"));
    } finally {
      setSavingConsent(false);
    }
  }, [savingConsent, consentDraft, tPrivacy]);

  const handleWithdrawAll = useCallback(async () => {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/privacy/withdraw-consent", {
        method: "POST",
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) throw new Error("Withdraw failed");
      const data = await res.json();
      setConsent(data.consent);
      setConsentDraft(data.consent);
      toast.success(tPrivacy("center.consentManagement.withdrawn"));
    } catch {
      toast.error(tPrivacy("center.deleteAccount.failed"));
    } finally {
      setWithdrawing(false);
    }
  }, [withdrawing, tPrivacy]);

  const handleToggleSharing = useCallback(async (key: "aiCoachEnabled", value: boolean) => {
    // Update preferences store (already exists at /api/notifications/preferences).
    setPrefs((prev) => ({ ...prev, [key]: value } as Preferences));
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { ...NOTIF_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // Best-effort.
    }
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      <SectionHeader title={t("nav.privacy")} description={tPrivacy("subtitle")} />

      {/* Medical disclaimer — most important */}
      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshake className="size-5 text-warning" aria-hidden />
            {t("nav.privacy")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {MEDICAL_DISCLAIMER}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Privacy principles */}
      <div className="grid gap-3 sm:grid-cols-2">
        <PrincipleCard icon={Lock} title={tPrivacy("principles.dataIsYours")} description={tPrivacy("principles.dataIsYoursDescription")} />
        <PrincipleCard icon={Eye} title={tPrivacy("principles.noDarkPatterns")} description={tPrivacy("principles.noDarkPatternsDescription")} />
        <PrincipleCard icon={Database} title={tPrivacy("principles.localFirst")} description={tPrivacy("principles.localFirstDescription")} />
        <PrincipleCard icon={KeyRound} title={tPrivacy("principles.noPassphrases")} description={tPrivacy("principles.noPassphrasesDescription")} />
        <PrincipleCard icon={Shield} title={tPrivacy("principles.strictOwnership")} description={tPrivacy("principles.strictOwnershipDescription")} />
        <PrincipleCard icon={HeartHandshake} title={tPrivacy("principles.calmByDesign")} description={tPrivacy("principles.calmByDesignDescription")} />
      </div>

      {/* Privacy Center */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tPrivacy("center.title")}</CardTitle>
          <CardDescription>{tPrivacy("center.subtitle")}</CardDescription>
        </CardHeader>
      </Card>

      {/* === DATA EXPORT === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-5 text-primary" aria-hidden />
            {tPrivacy("center.dataExport.title")}
          </CardTitle>
          <CardDescription>{tPrivacy("center.dataExport.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting} className="min-h-[44px]">
            {exporting ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <Download className="size-4 me-2" aria-hidden />}
            {tPrivacy("center.dataExport.button")}
          </Button>
        </CardContent>
      </Card>

      {/* === DELETE AI HISTORY === */}
      <Card className="border-warning/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareOff className="size-5 text-warning" aria-hidden />
            {tPrivacy("center.deleteAIHistory.title")}
          </CardTitle>
          <CardDescription>{tPrivacy("center.deleteAIHistory.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={deletingAI} className="min-h-[44px]">
                {deletingAI ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <Trash2 className="size-4 me-2" aria-hidden />}
                {tPrivacy("center.deleteAIHistory.button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tPrivacy("center.deleteAIHistory.title")}</AlertDialogTitle>
                <AlertDialogDescription>{tPrivacy("center.deleteAIHistory.confirm")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAIHistory}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* === DELETE ACCOUNT === */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
            {tPrivacy("center.deleteAccount.title")}
          </CardTitle>
          <CardDescription>{tPrivacy("center.deleteAccount.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">{tPrivacy("center.deleteAccount.warning")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm" className="text-sm font-medium">
              {tPrivacy("center.deleteAccount.confirm")}
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={tPrivacy("center.deleteAccount.confirmPlaceholder")}
              className="min-h-[44px]"
              autoComplete="off"
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deletingAccount || deleteConfirmText !== "DELETE"}
            className="min-h-[44px]"
          >
            {deletingAccount ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <Trash2 className="size-4 me-2" aria-hidden />}
            {tPrivacy("center.deleteAccount.button")}
          </Button>
        </CardContent>
      </Card>

      {/* === CONSENT MANAGEMENT === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-5 text-primary" aria-hidden />
            {tPrivacy("center.consentManagement.title")}
          </CardTitle>
          <CardDescription>{tPrivacy("center.consentManagement.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground italic">{tPrivacy("loading")}</p>
          ) : (
            <>
              <ConsentToggle
                label={tPrivacy("center.consentManagement.terms")}
                description={tPrivacy("center.consentManagement.termsDescription")}
                checked={!!consentDraft?.termsAcceptedAt}
                onChange={(v) => setConsentDraft((prev) => prev ? { ...prev, termsAcceptedAt: v ? new Date().toISOString() : null } : prev)}
              />
              <ConsentToggle
                label={tPrivacy("center.consentManagement.privacy")}
                description={tPrivacy("center.consentManagement.privacyDescription")}
                checked={!!consentDraft?.privacyAcceptedAt}
                onChange={(v) => setConsentDraft((prev) => prev ? { ...prev, privacyAcceptedAt: v ? new Date().toISOString() : null } : prev)}
              />
              <ConsentToggle
                label={tPrivacy("center.consentManagement.ageConfirmed")}
                description={tPrivacy("center.consentManagement.ageConfirmedDescription")}
                checked={!!consentDraft?.ageConfirmedAt}
                onChange={(v) => setConsentDraft((prev) => prev ? { ...prev, ageConfirmedAt: v ? new Date().toISOString() : null } : prev)}
              />
              <ConsentToggle
                label={tPrivacy("center.consentManagement.marketing")}
                description={tPrivacy("center.consentManagement.marketingDescription")}
                checked={!!consentDraft?.marketingOptIn}
                onChange={(v) => setConsentDraft((prev) => prev ? { ...prev, marketingOptIn: v } : prev)}
              />
              <ConsentToggle
                label={tPrivacy("center.consentManagement.dataProcessing")}
                description={tPrivacy("center.consentManagement.dataProcessingDescription")}
                checked={!!consentDraft?.dataProcessingOptIn}
                onChange={(v) => setConsentDraft((prev) => prev ? { ...prev, dataProcessingOptIn: v } : prev)}
              />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveConsent} disabled={savingConsent} className="min-h-[44px]">
                  {savingConsent ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4 me-2" aria-hidden />}
                  {tPrivacy("center.consentManagement.save")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={withdrawing} className="min-h-[44px]">
                      {tPrivacy("center.consentManagement.withdrawAll")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{tPrivacy("center.consentManagement.withdrawAll")}</AlertDialogTitle>
                      <AlertDialogDescription>{tPrivacy("center.consentManagement.withdrawAllConfirm")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleWithdrawAll}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {tPrivacy("center.consentManagement.withdrawAll")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* === DATA SHARING CONTROLS === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="size-5 text-primary" aria-hidden />
            {tPrivacy("center.dataSharing.title")}
          </CardTitle>
          <CardDescription>{tPrivacy("center.dataSharing.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConsentToggle
            label={tPrivacy("center.dataSharing.aiCoach")}
            description={tPrivacy("center.dataSharing.aiCoachDescription")}
            checked={!!prefs?.aiCoachEnabled}
            onChange={(v) => handleToggleSharing("aiCoachEnabled", v)}
          />
          <ConsentToggle
            label={tPrivacy("center.dataSharing.insights")}
            description={tPrivacy("center.dataSharing.insightsDescription")}
            checked={true}
            onChange={() => {}}
            disabled
          />
          <ConsentToggle
            label={tPrivacy("center.dataSharing.analytics")}
            description={tPrivacy("center.dataSharing.analyticsDescription")}
            checked={false}
            onChange={() => {}}
            disabled
          />
          <p className="text-xs text-muted-foreground italic pt-2">{tPrivacy("center.dataSharing.note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function PrincipleCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
