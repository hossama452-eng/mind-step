"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Briefcase, FileText, Download, Check, ShieldCheck } from "lucide-react";
import { MEDICAL_DISCLAIMER } from "@/lib/constants";
import { toast } from "sonner";
import type { Locale } from "@/i18n/locale";
import { formatRelativeTime } from "@/lib/locale-utils";

const PRO_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

interface Report {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  label: string;
  shared: boolean;
  createdAt: string;
}

export function ProfessionalSection() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/generate", { headers: PRO_HEADERS });
      if (!res.ok) throw new Error("Failed to load reports");
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const generateReport = async (type: string) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...PRO_HEADERS },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Failed to generate report");
      toast.success("Report generated.");
      fetchReports();
    } catch {
      toast.error("Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const exportReport = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/export/${id}`, { headers: PRO_HEADERS });
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mindstep-report.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported.");
    } catch {
      toast.error("Failed to export report.");
    }
  };

  if (loading) return <LoadingState lines={4} />;
  if (error) return <ErrorState onRetry={fetchReports} />;

  return (
    <div className="space-y-6">
      <SectionHeader title={t("professional")} description="Professional workspace, progress, and reports." />

      <Alert variant="default" className="border-warning/30 bg-warning/5">
        <ShieldCheck className="size-4 text-warning" aria-hidden />
        <AlertTitle className="text-warning">Not a Medical Tool</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">{MEDICAL_DISCLAIMER}</AlertDescription>
      </Alert>

      {/* Generate report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden />
            Generate Report
          </CardTitle>
          <CardDescription>Based on real user activity data — not medical diagnosis.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["weekly", "monthly", "focus", "habits", "energy", "comprehensive"].map((type) => (
              <Button key={type} size="sm" variant="outline" onClick={() => generateReport(type)} disabled={generating}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reports list */}
      {reports.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" aria-hidden />}
          title="No reports yet"
          description="Generate your first report above."
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="size-4" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground capitalize">{report.type}</p>
                    <Badge variant="secondary" className="text-[10px]">{report.label.includes("not") ? "Tracking data" : "Report"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{report.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(report.createdAt, locale)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => exportReport(report.id)} aria-label="Export">
                  <Download className="size-4" aria-hidden />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
