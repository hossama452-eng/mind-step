"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDialogStore } from "@/stores/dialog-store";
import { toast } from "sonner";
import {
  Shield,
  RefreshCw,
  TrendingUp,
  Timer,
  Clock,
  ListTodo,
  Battery,
  CalendarRange,
  FlaskConical,
  X,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  PartyPopper,
  GitCompareArrows,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { formatShortDate, formatDuration } from "@/lib/locale-utils";

const NOTIF_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

// ============================================================
// TYPES — mirrors the API response shape from /api/insights
// ============================================================

interface InsightData {
  chartType?: "bar" | "line";
  chartData?: Array<{ label: string; value: number }>;
  chartCaption?: string;
  metrics?: Record<string, number | string>;
  items?: Array<{ label: string; value: number }>;
}

interface Insight {
  id: string;
  kind: "pattern" | "observation" | "suggestion" | "warning" | "celebration" | "correlation" | "experiment";
  category: "focus" | "time" | "task" | "energy" | "weekly" | "general";
  title: string;
  body: string;
  data?: InsightData;
}

interface WeeklyReview {
  periodStart: string;
  periodEnd: string;
  worked: string[];
  difficult: string[];
  changed: string[];
  suggestedExperiment: {
    type: string;
    title: string;
    description: string;
    rationale: string;
  };
  metrics: {
    totalFocusMinutes: number;
    completedTasks: number;
    completedSessions: number;
    avgEnergy: number | null;
    interruptions: number;
  };
}

interface ComputedInsights {
  focus: Insight[];
  time: Insight[];
  task: Insight[];
  energy: Insight[];
  weeklyReview: WeeklyReview;
  all: Insight[];
}

interface Experiment {
  id: string;
  type: string;
  title: string;
  hypothesis: string | null;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  baselineSnapshot: string | null;
  postSnapshot: string | null;
  delta: string | null;
  resultSummary: string | null;
}

// ============================================================
// ICONS & COLOR TONES
// ============================================================

const KIND_ICONS: Record<string, typeof Sparkles> = {
  pattern: Sparkles,
  observation: TrendingUp,
  suggestion: Lightbulb,
  warning: AlertTriangle,
  celebration: PartyPopper,
  correlation: GitCompareArrows,
  experiment: FlaskConical,
};

const KIND_TONES: Record<string, string> = {
  pattern: "border-s-4 border-s-info/40 bg-info/5",
  observation: "border-s-4 border-s-info/40 bg-info/5",
  suggestion: "border-s-4 border-s-primary/40 bg-primary/5",
  warning: "border-s-4 border-s-warning/40 bg-warning/5",
  celebration: "border-s-4 border-s-success/40 bg-success/5",
  correlation: "border-s-4 border-s-accent/40 bg-accent/5",
  experiment: "border-s-4 border-s-accent/40 bg-accent/5",
};

const BAR_COLORS = ["#7c9885", "#c9a87c", "#8a9bb5", "#b58aa8", "#9bb58a", "#b5a87c"];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function InsightsSection() {
  const t = useTranslations("insights");
  const tExp = useTranslations("experiments");
  const locale = useLocale() as Locale;
  const openDialog = useDialogStore((s) => s.openDialog);

  const [insights, setInsights] = useState<ComputedInsights | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, expRes] = await Promise.all([
        fetch("/api/insights", { headers: NOTIF_HEADERS }),
        fetch("/api/personal-experiments", { headers: NOTIF_HEADERS }),
      ]);
      if (!insightsRes.ok) throw new Error("Failed to load insights");
      const insightsData = await insightsRes.json();
      setInsights(insightsData);

      if (expRes.ok) {
        const expData = await expRes.json();
        setExperiments(expData.experiments ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Listen for the refresh event dispatched by StartExperimentDialog after submit.
  useEffect(() => {
    const handler = () => fetchInsights();
    window.addEventListener("mindstep:refresh-insights", handler);
    return () => window.removeEventListener("mindstep:refresh-insights", handler);
  }, [fetchInsights]);

  const handleDismiss = useCallback(async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/insights?id=${encodeURIComponent(`prompt11-demo-user-${id}`)}&action=dismiss`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
    } catch {
      // Best-effort.
    }
  }, []);

  const handleStartExperiment = useCallback((experimentType?: string) => {
    openDialog("startExperiment", experimentType ? { experimentType } : undefined);
  }, [openDialog]);

  if (loading) return <LoadingState lines={4} />;
  if (error) return <ErrorState onRetry={fetchInsights} />;
  if (!insights) return <EmptyState icon={<TrendingUp className="size-6" aria-hidden />} title={t("empty")} description={t("emptyDescription")} />;

  const hasInsights = insights.all.length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Button variant="ghost" size="icon" className="size-9" onClick={fetchInsights} aria-label={t("refresh")}>
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        }
      />

      {/* Privacy banner */}
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-3">
          <Shield className="size-5 shrink-0 text-primary mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">{t("privacy")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("privacyDescription")}</p>
          </div>
        </CardContent>
      </Card>

      {!hasInsights ? (
        <EmptyState
          icon={<TrendingUp className="size-6" aria-hidden />}
          title={t("empty")}
          description={t("emptyDescription")}
        />
      ) : (
        <Tabs defaultValue="focus" className="w-full">
          <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/40 p-1" aria-label={t("title")}>
            <TabsTrigger value="focus" className="gap-1.5 text-xs sm:text-sm">
              <Timer className="size-3.5" aria-hidden /> {t("tabs.focus")}
            </TabsTrigger>
            <TabsTrigger value="time" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="size-3.5" aria-hidden /> {t("tabs.time")}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5 text-xs sm:text-sm">
              <ListTodo className="size-3.5" aria-hidden /> {t("tabs.tasks")}
            </TabsTrigger>
            <TabsTrigger value="energy" className="gap-1.5 text-xs sm:text-sm">
              <Battery className="size-3.5" aria-hidden /> {t("tabs.energy")}
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-1.5 text-xs sm:text-sm">
              <CalendarRange className="size-3.5" aria-hidden /> {t("tabs.weekly")}
            </TabsTrigger>
            <TabsTrigger value="experiments" className="gap-1.5 text-xs sm:text-sm">
              <FlaskConical className="size-3.5" aria-hidden /> {t("tabs.experiments")}
            </TabsTrigger>
          </TabsList>

          {/* FOCUS */}
          <TabsContent value="focus" className="space-y-3 mt-4">
            {insights.focus.length === 0 ? (
              <EmptyState icon={<Timer className="size-6" aria-hidden />} title={t("empty")} description={t("emptyDescription")} />
            ) : (
              insights.focus.map((insight) => (
                <InsightCard key={insight.id} insight={insight} dismissed={dismissedIds.has(insight.id)} onDismiss={handleDismiss} t={t} locale={locale} />
              ))
            )}
          </TabsContent>

          {/* TIME */}
          <TabsContent value="time" className="space-y-3 mt-4">
            {insights.time.length === 0 ? (
              <EmptyState icon={<Clock className="size-6" aria-hidden />} title={t("empty")} description={t("emptyDescription")} />
            ) : (
              insights.time.map((insight) => (
                <InsightCard key={insight.id} insight={insight} dismissed={dismissedIds.has(insight.id)} onDismiss={handleDismiss} t={t} locale={locale} />
              ))
            )}
          </TabsContent>

          {/* TASKS */}
          <TabsContent value="tasks" className="space-y-3 mt-4">
            {insights.task.length === 0 ? (
              <EmptyState icon={<ListTodo className="size-6" aria-hidden />} title={t("empty")} description={t("emptyDescription")} />
            ) : (
              insights.task.map((insight) => (
                <InsightCard key={insight.id} insight={insight} dismissed={dismissedIds.has(insight.id)} onDismiss={handleDismiss} t={t} locale={locale} />
              ))
            )}
          </TabsContent>

          {/* ENERGY */}
          <TabsContent value="energy" className="space-y-3 mt-4">
            {insights.energy.length === 0 ? (
              <EmptyState icon={<Battery className="size-6" aria-hidden />} title={t("empty")} description={t("emptyDescription")} />
            ) : (
              insights.energy.map((insight) => (
                <InsightCard key={insight.id} insight={insight} dismissed={dismissedIds.has(insight.id)} onDismiss={handleDismiss} t={t} locale={locale} />
              ))
            )}
          </TabsContent>

          {/* WEEKLY */}
          <TabsContent value="weekly" className="space-y-3 mt-4">
            <WeeklyReviewCard review={insights.weeklyReview} onStartExperiment={() => handleStartExperiment(insights.weeklyReview.suggestedExperiment.type)} t={t} tExp={tExp} locale={locale} />
          </TabsContent>

          {/* EXPERIMENTS */}
          <TabsContent value="experiments" className="space-y-3 mt-4">
            <ExperimentsList experiments={experiments} onStartExperiment={handleStartExperiment} onRefresh={fetchInsights} tExp={tExp} locale={locale} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============================================================
// INSIGHT CARD — renders one insight with optional chart
// ============================================================

function InsightCard({
  insight,
  dismissed,
  onDismiss,
  t,
  locale,
}: {
  insight: Insight;
  dismissed: boolean;
  onDismiss: (id: string) => void;
  t: ReturnType<typeof useTranslations<"insights">>;
  locale: Locale;
}) {
  if (dismissed) return null;
  const Icon = KIND_ICONS[insight.kind] ?? Sparkles;
  const kindLabel = t(`kinds.${insight.kind}` as never) as string;
  const hasChart = !!insight.data?.chartData && (insight.data.chartData.length > 0);

  return (
    <Card className={cn("transition-opacity", KIND_TONES[insight.kind])}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/60 text-foreground">
            <Icon className="size-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px] font-normal">
                  {kindLabel}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDismiss(insight.id)}
                aria-label={t("dismiss")}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1.5 break-words whitespace-pre-line">{insight.body}</p>

            {/* Chart */}
            {hasChart && (
              <div className="mt-3">
                <SimpleBarChart
                  data={insight.data!.chartData!}
                  ariaLabel={t("aria.chart", { title: insight.title })}
                  barsLabel={t("aria.bars", { count: insight.data!.chartData!.length })}
                />
                {insight.data?.chartCaption ? (
                  <p className="mt-2 text-xs text-muted-foreground italic">{insight.data.chartCaption}</p>
                ) : null}
              </div>
            )}

            {/* Items list (for high-friction, postponed, etc.) */}
            {insight.data?.items && insight.data.items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {insight.data.items.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate pe-2">{item.label}</span>
                    <Badge variant="outline" className="text-xs font-mono tabular-nums">{item.value}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// SIMPLE BAR CHART — wraps recharts, but with a fixed simple style
// ============================================================

function SimpleBarChart({
  data,
  ariaLabel,
  barsLabel,
}: {
  data: Array<{ label: string; value: number }>;
  ariaLabel: string;
  barsLabel: string;
}) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{ariaLabel}</p>;
  }
  return (
    <div role="img" aria-label={`${ariaLabel} — ${barsLabel}`} className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "currentColor" }}
            stroke="currentColor"
            strokeOpacity={0.2}
            interval={0}
            tickFormatter={(value: string) => value.length > 8 ? value.slice(0, 8) + "…" : value}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            stroke="currentColor"
            strokeOpacity={0.2}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// WEEKLY REVIEW CARD
// ============================================================

function WeeklyReviewCard({
  review,
  onStartExperiment,
  t,
  tExp,
  locale,
}: {
  review: WeeklyReview;
  onStartExperiment: (experimentType: string) => void;
  t: ReturnType<typeof useTranslations<"insights">>;
  tExp: ReturnType<typeof useTranslations<"experiments">>;
  locale: Locale;
}) {
  const periodStr = t("weeklyReview.period", {
    start: formatShortDate(review.periodStart, locale),
    end: formatShortDate(review.periodEnd, locale),
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="size-5 text-primary" aria-hidden />
            {t("weeklyReview.title")}
          </CardTitle>
          <CardDescription>{periodStr}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label={t("weeklyReview.metrics.totalFocusMinutes")} value={formatDuration(review.metrics.totalFocusMinutes, locale)} />
            <Metric label={t("weeklyReview.metrics.completedTasks")} value={String(review.metrics.completedTasks)} />
            <Metric label={t("weeklyReview.metrics.completedSessions")} value={String(review.metrics.completedSessions)} />
            <Metric label={t("weeklyReview.metrics.avgEnergy")} value={review.metrics.avgEnergy !== null ? `${review.metrics.avgEnergy}/5` : "—"} />
            <Metric label={t("weeklyReview.metrics.interruptions")} value={String(review.metrics.interruptions)} />
          </div>

          {/* What worked */}
          <ReviewSection title={t("weeklyReview.whatWorked")} items={review.worked} tone="success" />

          {/* What was difficult */}
          <ReviewSection title={t("weeklyReview.whatWasDifficult")} items={review.difficult} tone="warning" />

          {/* What changed */}
          <ReviewSection title={t("weeklyReview.whatChanged")} items={review.changed} tone="info" />

          {/* Suggested experiment */}
          <Card className="border-dashed border-accent/40 bg-accent/5">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-4 text-accent" aria-hidden />
                <p className="text-sm font-semibold">{t("weeklyReview.suggestedExperiment")}</p>
              </div>
              <p className="text-sm font-medium">{review.suggestedExperiment.title}</p>
              <p className="text-xs text-muted-foreground">{review.suggestedExperiment.description}</p>
              <p className="text-xs text-muted-foreground italic">{review.suggestedExperiment.rationale}</p>
              <Button size="sm" variant="outline" onClick={() => onStartExperiment(review.suggestedExperiment.type)} className="mt-2 min-h-[36px]">
                <FlaskConical className="size-3 me-1" aria-hidden />
                {t("weeklyReview.startExperiment")}
              </Button>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ReviewSection({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" | "info" }) {
  const toneClasses = {
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    info: "border-info/30 bg-info/5",
  };
  return (
    <div className={cn("rounded-md border p-3", toneClasses[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-foreground break-words">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// EXPERIMENTS LIST
// ============================================================

function ExperimentsList({
  experiments,
  onStartExperiment,
  onRefresh,
  tExp,
  locale,
}: {
  experiments: Experiment[];
  onStartExperiment: (experimentType?: string) => void;
  onRefresh: () => void;
  tExp: ReturnType<typeof useTranslations<"experiments">>;
  locale: Locale;
}) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const handleComplete = async (id: string) => {
    if (busy[id]) return;
    if (!confirm(tExp("completeConfirm"))) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/personal-experiments/${id}/complete`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) throw new Error("Failed to complete experiment");
      toast.success(tExp("completed"));
      onRefresh();
    } catch {
      toast.error(tExp("failed"));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const handleAbandon = async (id: string) => {
    if (busy[id]) return;
    if (!confirm(tExp("abandonConfirm"))) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/personal-experiments/${id}/abandon`, {
        method: "PATCH",
        headers: NOTIF_HEADERS,
      });
      if (!res.ok) throw new Error("Failed to abandon experiment");
      toast.success(tExp("abandoned"));
      onRefresh();
    } catch {
      toast.error(tExp("failed"));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-5 text-accent" aria-hidden />
            {tExp("title")}
          </CardTitle>
          <CardDescription>{tExp("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => onStartExperiment()} className="min-h-[40px]">
            <FlaskConical className="size-4 me-1" aria-hidden />
            {tExp("start")}
          </Button>
        </CardContent>
      </Card>

      {experiments.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="size-6" aria-hidden />}
          title={tExp("empty")}
          description={tExp("emptyDescription")}
        />
      ) : (
        experiments.map((exp) => (
          <ExperimentCard
            key={exp.id}
            experiment={exp}
            isBusy={busy[exp.id] ?? false}
            onComplete={handleComplete}
            onAbandon={handleAbandon}
            tExp={tExp}
            locale={locale}
          />
        ))
      )}
    </div>
  );
}

function ExperimentCard({
  experiment,
  isBusy,
  onComplete,
  onAbandon,
  tExp,
  locale,
}: {
  experiment: Experiment;
  isBusy: boolean;
  onComplete: (id: string) => void;
  onAbandon: (id: string) => void;
  tExp: ReturnType<typeof useTranslations<"experiments">>;
  locale: Locale;
}) {
  const typeLabel = tExp(`types.${experiment.type}` as never) as string;
  const typeDesc = tExp(`descriptions.${experiment.type}` as never) as string;
  const statusLabel = tExp(`status.${experiment.status}` as never) as string;
  const statusTone: Record<string, string> = {
    active: "border-info/40 bg-info/5",
    completed: "border-success/40 bg-success/5",
    abandoned: "border-muted/40 bg-muted/30",
  };

  // Parse delta + snapshots for completed experiments
  let baseline: any = null;
  let post: any = null;
  let delta: any = null;
  try {
    if (experiment.baselineSnapshot) baseline = JSON.parse(experiment.baselineSnapshot);
    if (experiment.postSnapshot) post = JSON.parse(experiment.postSnapshot);
    if (experiment.delta) delta = JSON.parse(experiment.delta);
  } catch {
    // Ignore parse errors.
  }

  return (
    <Card className={cn("transition-opacity", statusTone[experiment.status])}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{experiment.title}</p>
              <Badge variant="outline" className="text-[10px]">{statusLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{typeLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5 italic">{typeDesc}</p>
            {experiment.hypothesis ? (
              <p className="text-xs text-muted-foreground mt-2 italic border-s-2 ps-2">"{experiment.hypothesis}"</p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-2">
              {formatShortDate(experiment.startedAt, locale)}
              {experiment.endedAt ? ` → ${formatShortDate(experiment.endedAt, locale)}` : ""}
            </p>
          </div>
        </div>

        {/* Active experiment — show baseline + actions */}
        {experiment.status === "active" ? (
          <div className="space-y-2">
            {baseline ? (
              <div className="rounded-md border border-border bg-card/40 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tExp("result.baseline")}</p>
                <div className="grid grid-cols-2 gap-1 text-xs mt-1">
                  <BaselineMetric label={tExp("result.baseline")} baseline={baseline} />
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={isBusy} onClick={() => onComplete(experiment.id)} className="min-h-[36px]">
                {tExp("complete")}
              </Button>
              <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => onAbandon(experiment.id)} className="min-h-[36px] text-muted-foreground hover:text-destructive">
                {tExp("abandon")}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Completed experiment — show delta + description */}
        {experiment.status === "completed" ? (
          <div className="space-y-2">
            {experiment.resultSummary ? (
              <div className="rounded-md border border-border bg-card/40 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tExp("result.description")}</p>
                <p className="text-xs mt-1 text-foreground">{experiment.resultSummary}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{tExp("result.noDescription")}</p>
            )}
            {delta && post && baseline ? (
              <DeltaTable baseline={baseline} post={post} delta={delta} tExp={tExp} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BaselineMetric({ label, baseline }: { label: string; baseline: any }) {
  // Render key metrics from the snapshot
  const keys = ["totalFocusMinutes", "completedSessions", "completedTasks", "completionRate"];
  return (
    <>
      {keys.map((k) => (
        <div key={k} className="flex items-center justify-between">
          <span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
          <span className="font-mono tabular-nums">{baseline[k] ?? "—"}</span>
        </div>
      ))}
    </>
  );
}

function DeltaTable({ baseline, post, delta, tExp }: { baseline: any; post: any; delta: any; tExp: ReturnType<typeof useTranslations<"experiments">> }) {
  const metrics: Array<{ key: string; label: string }> = [
    { key: "totalFocusMinutes", label: tExp("result.baseline") + " (focus min)" },
    { key: "completedSessions", label: "completed sessions" },
    { key: "completionRate", label: "completion rate %" },
    { key: "completedTasks", label: "completed tasks" },
    { key: "avgSessionMinutes", label: "avg session min" },
    { key: "interruptionsPerSession", label: "interruptions/session" },
  ];
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-start font-normal">metric</th>
            <th className="text-end font-normal">{tExp("result.baseline")}</th>
            <th className="text-end font-normal">{tExp("result.post")}</th>
            <th className="text-end font-normal">{tExp("result.delta")}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ key, label }) => {
            const d = delta[key];
            if (!d || d.delta === null) return null;
            const tone = d.delta > 0 ? "text-success" : d.delta < 0 ? "text-warning" : "text-muted-foreground";
            const sign = d.delta > 0 ? "+" : "";
            return (
              <tr key={key} className="border-t border-border/50">
                <td className="py-1 text-muted-foreground">{label}</td>
                <td className="py-1 text-end font-mono tabular-nums">{d.baseline ?? "—"}</td>
                <td className="py-1 text-end font-mono tabular-nums">{d.post ?? "—"}</td>
                <td className={cn("py-1 text-end font-mono tabular-nums", tone)}>{sign}{d.delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
