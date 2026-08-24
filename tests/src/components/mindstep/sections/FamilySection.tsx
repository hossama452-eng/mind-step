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
import { ShieldCheck, Users, Gift, Heart, Info } from "lucide-react";
import { MEDICAL_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import { formatRelativeTime } from "@/lib/locale-utils";

const FAM_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

interface Child {
  id: string;
  name: string | null;
  email: string;
  relationshipId: string;
  permissions: string[];
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueAt: string | null }>;
  focusSessions: Array<{ id: string; actualMinutes: number | null; startedAt: string; taskTitle: string | null }>;
  rewards: Array<{ id: string; title: string; points: number; redeemed: boolean }>;
  stats: { totalTasks: number; totalFocusSessions: number; totalHabitEntries: number };
}

export function FamilySection() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/family/children", { headers: FAM_HEADERS });
      if (!res.ok) throw new Error("Failed to load family data");
      const data = await res.json();
      setChildren(data.children ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChildren(); }, [fetchChildren]);

  if (loading) return <LoadingState lines={4} />;
  if (error) return <ErrorState onRetry={fetchChildren} />;

  return (
    <div className="space-y-6">
      <SectionHeader title={t("family")} description="Parent dashboard and child overview." />

      <Alert variant="default" className="border-info/30 bg-info/5">
        <ShieldCheck className="size-4 text-info" aria-hidden />
        <AlertTitle className="text-info">Privacy First</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Parents can only access information explicitly permitted by the child. Consent is required for all relationships.
        </AlertDescription>
      </Alert>

      {children.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="No family connections yet"
          description="Invite a family member to share routines, tasks, and rewards."
        />
      ) : (
        <div className="space-y-4">
          {children.map((child) => (
            <Card key={child.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Heart className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-base">{child.name ?? child.email}</CardTitle>
                    <CardDescription className="text-xs">
                      {child.stats.totalTasks} tasks · {child.stats.totalFocusSessions} focus sessions
                    </CardDescription>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {child.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Tasks (only if permitted) */}
                {child.tasks.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Open Tasks</p>
                    <ul className="space-y-1">
                      {child.tasks.slice(0, 5).map((task) => (
                        <li key={task.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate text-foreground">{task.title}</span>
                          <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Focus sessions (only if permitted) */}
                {child.focusSessions.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent Focus</p>
                    <ul className="space-y-1">
                      {child.focusSessions.slice(0, 3).map((s) => (
                        <li key={s.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate text-muted-foreground">{s.taskTitle ?? "—"}</span>
                          <span className="text-xs tabular-nums">{s.actualMinutes ?? 0}m</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Rewards (only if permitted) */}
                {child.rewards.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Rewards</p>
                    <ul className="space-y-1">
                      {child.rewards.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-sm">
                          <Gift className="size-3 text-warning" aria-hidden />
                          <span className="flex-1 truncate text-foreground">{r.title}</span>
                          <span className="text-xs tabular-nums">{r.points} pts</span>
                          {r.redeemed ? <Badge variant="secondary" className="text-[10px]">Redeemed</Badge> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Alert className="border-warning/30 bg-warning/5">
        <Info className="size-4 text-warning" aria-hidden />
        <AlertDescription className="text-xs text-muted-foreground">{MEDICAL_DISCLAIMER}</AlertDescription>
      </Alert>
    </div>
  );
}
