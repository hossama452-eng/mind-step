"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield,
  LogIn,
  LogOut,
  RefreshCw,
  Loader2,
  Crown,
  Lock,
  Check,
  AlertTriangle,
  Coins,
  History,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/locale-utils";
import {
  usePiSdk,
  usePiSession,
  signInWithPi,
  signOutFromPi,
  startPiPayment,
  type PiSessionInfo,
} from "@/lib/pi/client";

// ============================================================
// TYPES — match server response shapes
// ============================================================

interface Entitlement {
  id: string;
  userId: string;
  plan: string;
  status: string;
  durationDays: number | null;
  startedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  grantingPaymentId: string | null;
  features: string[];
  lastVerifiedAt: string | null;
  lastVerifiedBy: string | null;
}

interface Product {
  key: string;
  amount: number;
  currency: string;
  durationDays: number | null;
  entitlementPlan: string;
  memo: string;
  features: string[];
}

interface PaymentHistoryItem {
  id: string;
  piPaymentId: string;
  product: string;
  amount: number;
  currency: string;
  status: string;
  txid: string | null;
  network: string;
  verifiedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  error: string | null;
  createdAt: string;
}

interface PiStatus {
  ok: boolean;
  network: "testnet" | "mainnet";
  configured: boolean;
  apiBaseUrl: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PiAccountSection() {
  const t = useTranslations("pi");
  const locale = useLocale() as Locale;
  const piSdk = usePiSdk();
  const { session, refresh: refreshSession } = usePiSession();

  const [status, setStatus] = useState<PiStatus | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [busyProductKey, setBusyProductKey] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, entRes, prodRes, histRes] = await Promise.all([
        fetch("/api/pi/status").then((r) => r.json()).catch(() => null),
        fetch("/api/pi/entitlement", { headers: { "x-mindstep-user-id": "demo-user", "x-mindstep-auto-create-user": "true" } })
          .then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/pi/products").then((r) => r.json()).catch(() => null),
        fetch("/api/pi/payments/history", { headers: { "x-mindstep-user-id": "demo-user", "x-mindstep-auto-create-user": "true" } })
          .then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      setStatus(statusRes);
      setEntitlement(entRes?.entitlement ?? null);
      setProducts(prodRes?.products ?? []);
      setHistory(histRes?.payments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Refresh session after sign-in or sign-out.
  useEffect(() => {
    refreshSession();
  }, [refreshSession, entitlement, history.length]);

  // ============================================================
  // ACTIONS
  // ============================================================

  const handleSignIn = useCallback(async () => {
    if (!piSdk.sdk || signingIn) return;
    setSigningIn(true);
    try {
      const result = await signInWithPi(piSdk.sdk);
      if (!result.ok) {
        if (result.code === "USER_CANCELLED") {
          toast.info(t("errors.authCancelled"));
        } else {
          toast.error(t("errors.authFailed"));
        }
        return;
      }
      toast.success(t("aria.signedIn"));
      await refreshSession();
      await refreshAll();
    } finally {
      setSigningIn(false);
    }
  }, [piSdk.sdk, signingIn, t, refreshSession, refreshAll]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutFromPi();
      toast.success(t("aria.signedOut"));
      await refreshSession();
      await refreshAll();
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, t, refreshSession, refreshAll]);

  const handleBuy = useCallback(async (product: Product) => {
    if (!piSdk.sdk || busyProductKey) return;
    setBusyProductKey(product.key);
    try {
      // Generate an idempotency key for this purchase attempt.
      const idempotencyKey = `pi-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const result = await startPiPayment({
        sdk: piSdk.sdk,
        productKey: product.key,
        amount: product.amount,
        memo: product.memo,
        metadata: { productKey: product.key, idempotencyKey },
        idempotencyKey,
        recordPaymentEndpoint: "/api/pi/payments",
        onApproveEndpoint: (pid) => `/api/pi/payments/${encodeURIComponent(pid)}/approve`,
        onCompleteEndpoint: (pid) => `/api/pi/payments/${encodeURIComponent(pid)}/complete`,
        onCancelEndpoint: (pid) => `/api/pi/payments/${encodeURIComponent(pid)}/cancel`,
      });
      if (!result.ok) {
        if (result.code === "USER_CANCELLED") {
          toast.info(t("products.cancelled"));
        } else {
          toast.error(t("products.failed"));
        }
        return;
      }
      if (result.entitlementGranted) {
        toast.success(t("products.success"));
      } else {
        toast.info(t("products.processing"));
      }
      await refreshAll();
    } finally {
      setBusyProductKey(null);
    }
  }, [piSdk.sdk, busyProductKey, t, refreshAll]);

  const handleRefreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/pi/payments/history", {
        headers: { "x-mindstep-user-id": "demo-user", "x-mindstep-auto-create-user": "true" },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.payments ?? []);
      }
    } catch {
      // Ignore.
    }
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading && !status) return <LoadingState lines={4} />;
  if (error) return <ErrorState onRetry={refreshAll} />;

  const isConfigured = status?.configured ?? false;
  const isInPiBrowser = piSdk.available;
  const activeNetwork = status?.network ?? "testnet";

  return (
    <div className="space-y-6">
      <SectionHeader title={t("title")} description={t("subtitle")} />

      {/* Compliance banner — always visible */}
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-5 text-primary" aria-hidden />
            {t("compliance.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ComplianceItem icon={<Lock className="size-4" aria-hidden />} title={t("compliance.noPassphrases")} description={t("compliance.noPassphrasesDescription")} />
          <ComplianceItem icon={<Check className="size-4" aria-hidden />} title={t("compliance.serverVerified")} description={t("compliance.serverVerifiedDescription")} />
          <ComplianceItem icon={<AlertTriangle className="size-4" aria-hidden />} title={t("compliance.testnetVsMainnet")} description={t("compliance.testnetVsMainnetDescription")} />
        </CardContent>
      </Card>

      {/* Status banner: not in Pi Browser */}
      {!isInPiBrowser && isConfigured && (
        <Card className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/30">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t("errors.notInPiBrowser")}
            </p>
            <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
              {t("errors.notInPiBrowserDescription")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Status banner: not configured */}
      {!isConfigured && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-destructive">
              {t("errors.notConfigured")}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {t("errors.notConfiguredDescription")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Session card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Globe className="size-5 text-muted-foreground" aria-hidden />
              {t("network")}:{" "}
              <Badge variant="outline" className="font-mono">
                {t("networkValue", { network: activeNetwork })}
              </Badge>
            </span>
            {session ? (
              <span className="text-xs text-muted-foreground">
                {t("signedInAs", { username: session.piUsername ?? session.piUid.slice(0, 12) })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("notSignedIn")}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session ? (
            <Button onClick={handleSignOut} disabled={signingOut || !isInPiBrowser} className="min-h-[44px]">
              {signingOut ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <LogOut className="size-4 me-2" aria-hidden />}
              {signingOut ? t("signingOut") : t("signOut")}
            </Button>
          ) : (
            <Button onClick={handleSignIn} disabled={signingIn || !isInPiBrowser || !isConfigured} className="min-h-[44px]">
              {signingIn ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <LogIn className="size-4 me-2" aria-hidden />}
              {signingIn ? t("signingIn") : t("signInWithPi")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Premium entitlement card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="size-5 text-amber-500" aria-hidden />
            {t("premium.title")}
          </CardTitle>
          <CardDescription>
            {entitlement?.status === "active"
              ? entitlement.durationDays === null
                ? t("premium.lifetime")
                : t("premium.expiresOn", { date: entitlement.expiresAt ? formatDate(entitlement.expiresAt, locale) : "—" })
              : t("premium.noEntitlementDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entitlement?.status === "active" ? (
            <div className="space-y-3">
              <Badge variant="default" className="gap-1.5 bg-success/15 text-success border-success/30">
                <Check className="size-3" aria-hidden /> {t("premium.active")}
              </Badge>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t("premium.features")}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {entitlement.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-sm">
                      <Check className="size-3 text-success" aria-hidden /> <span className="font-mono text-xs">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Crown className="size-6" aria-hidden />}
              title={t("premium.noEntitlement")}
              description={t("premium.noEntitlementDescription")}
            />
          )}
        </CardContent>
      </Card>

      {/* Products grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("products.title")}</CardTitle>
          <CardDescription>{t("products.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">{t("loadingProducts")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {products.map((product) => {
                const isBusy = busyProductKey === product.key;
                const isLifetime = product.durationDays === null;
                const isYearly = product.durationDays === 365;
                return (
                  <div
                    key={product.key}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-4 transition-colors",
                      isYearly ? "border-primary/40 bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {product.key === "PREMIUM_MONTHLY" ? t("products.monthly")
                          : product.key === "PREMIUM_YEARLY" ? t("products.yearly")
                          : t("products.lifetime")}
                      </p>
                      {isYearly ? <Badge variant="secondary" className="text-[10px]">{t("products.bestValue")}</Badge> : null}
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                      {t("products.piAmount", { amount: product.amount })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isLifetime ? t("products.oneTime")
                        : product.durationDays === 30 ? t("products.perMonth")
                        : t("products.perYear")}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleBuy(product)}
                      disabled={isBusy || !isInPiBrowser || !isConfigured || !session}
                      className="mt-2 min-h-[40px]"
                    >
                      {isBusy ? <Loader2 className="size-4 me-2 animate-spin" aria-hidden /> : <Coins className="size-4 me-2" aria-hidden />}
                      {isBusy ? t("products.processing")
                        : product.key === "PREMIUM_MONTHLY" ? t("products.buyMonthly")
                        : product.key === "PREMIUM_YEARLY" ? t("products.buyYearly")
                        : t("products.buyLifetime")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {!session && (
            <p className="text-xs text-muted-foreground mt-3 italic">
              {t("signInWithPi")} →
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <History className="size-5 text-muted-foreground" aria-hidden />
              {t("history.title")}
            </span>
            <Button variant="ghost" size="icon" className="size-9" onClick={handleRefreshHistory} aria-label={t("history.refresh")}>
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState
              icon={<History className="size-6" aria-hidden />}
              title={t("history.empty")}
              description={t("history.emptyDescription")}
            />
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto pe-1">
              {history.map((item) => (
                <li key={item.id} className="rounded-md border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {item.product === "PREMIUM_MONTHLY" ? t("products.monthly")
                          : item.product === "PREMIUM_YEARLY" ? t("products.yearly")
                          : t("products.lifetime")}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono tabular-nums">
                        {item.amount} {item.currency} · {formatDate(item.createdAt, locale)}
                      </p>
                      {item.txid ? (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate" title={item.txid}>
                          {t("history.txid")}: {item.txid.slice(0, 16)}…
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={statusVariant(item.status)} className="shrink-0 text-xs">
                      {t(`history.status.${item.status}` as never) ?? item.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ComplianceItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0 text-primary">{icon}</div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "cancelled" || status === "failed") return "destructive";
  if (status === "transaction_verified") return "outline";
  return "secondary";
}
