"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useNetworkStore } from "@/stores/network-store";
import {
  registerSW,
  applySWUpdate,
  subscribeToNetworkState,
} from "@/lib/pwa/sw-register";
import { replayQueue } from "@/lib/offline/offline-fetch";
import { listPending } from "@/lib/offline/mutation-queue";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Network & PWA Provider (Prompt 10).
 *
 *   - Registers the service worker.
 *   - Listens to online/offline events.
 *   - When coming back online, replays the offline mutation queue.
 *   - Renders a non-intrusive network status banner (top of viewport).
 *   - Shows an "Update available" toast when a new SW is waiting.
 *
 * Renders nothing on the first paint — the banner only appears when the
 * network state changes (so it doesn't compete with the app shell).
 */
export function NetworkPWAProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("pwa");
  const online = useNetworkStore((s) => s.online);
  const syncState = useNetworkStore((s) => s.syncState);
  const pendingCount = useNetworkStore((s) => s.pendingCount);
  const swUpdateAvailable = useNetworkStore((s) => s.swUpdateAvailable);
  const swWaitingRef = useNetworkStore((s) => s.swWaitingRef);
  const setOnline = useNetworkStore((s) => s.setOnline);
  const setSyncState = useNetworkStore((s) => s.setSyncState);
  const setPendingCount = useNetworkStore((s) => s.setPendingCount);
  const setSWUpdateAvailable = useNetworkStore((s) => s.setSWUpdateAvailable);
  const clearSWUpdate = useNetworkStore((s) => s.clearSWUpdate);

  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerKind, setBannerKind] = useState<"offline" | "syncing" | "synced" | "failed">("offline");

  // 1. Register SW on mount.
  useEffect(() => {
    registerSW({
      onWaiting: (sw) => setSWUpdateAvailable(true, sw),
    });
  }, [setSWUpdateAvailable]);

  // 2. Subscribe to network state changes.
  useEffect(() => {
    const unsub = subscribeToNetworkState({
      onOnline: async () => {
        setOnline(true);
        // On reconnect, replay the offline queue.
        setSyncState("syncing");
        const pending = await listPending();
        if (pending.length > 0) {
          toast.success(t("online.reconnectedWithPending", { count: pending.length }));
          await replayQueue();
        } else {
          setSyncState("complete");
          toast.success(t("online.reconnected"));
        }
      },
      onOffline: () => {
        setOnline(false);
        toast.warning(t("offline.toast"));
      },
    });
    return unsub;
  }, [setOnline, setSyncState, t]);

  // 3. On first mount, check pending and queue state.
  useEffect(() => {
    (async () => {
      const pending = await listPending();
      setPendingCount(pending.length);
      // If we're online and have pending, replay.
      if (typeof navigator !== "undefined" && navigator.onLine && pending.length > 0) {
        setSyncState("syncing");
        await replayQueue();
      }
    })();
  }, [setPendingCount, setSyncState]);

  // 4. Show/hide the banner based on state.
  useEffect(() => {
    if (!online) {
      setBannerKind("offline");
      setBannerVisible(true);
    } else if (syncState === "syncing") {
      setBannerKind("syncing");
      setBannerVisible(true);
    } else if (syncState === "failed") {
      setBannerKind("failed");
      setBannerVisible(true);
    } else if (syncState === "complete" && pendingCount === 0) {
      // Brief "synced" flash then hide.
      setBannerKind("synced");
      setBannerVisible(true);
      const timeoutId = window.setTimeout(() => setBannerVisible(false), 2500);
      return () => window.clearTimeout(timeoutId);
    } else {
      setBannerVisible(false);
    }
  }, [online, syncState, pendingCount]);

  // 5. SW update toast.
  useEffect(() => {
    if (!swUpdateAvailable) return;
    const toastId = toast(
      <div className="flex items-center gap-3">
        <Download className="size-5 text-primary" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">{t("update.title")}</p>
          <p className="text-sm text-muted-foreground">{t("update.description")}</p>
        </div>
      </div>,
      {
        duration: Infinity, // stays until the user clicks
        action: {
          label: t("update.action"),
          onClick: () => {
            applySWUpdate(swWaitingRef);
            clearSWUpdate();
          },
        },
        cancel: {
          label: t("update.dismiss"),
          onClick: () => clearSWUpdate(),
        },
      },
    );
    return () => {
      toast.dismiss(toastId);
    };
  }, [swUpdateAvailable, swWaitingRef, clearSWUpdate, t]);

  const handleRetrySync = useCallback(async () => {
    setSyncState("syncing");
    await replayQueue();
  }, [setSyncState]);

  return (
    <>
      {children}
      {/* Network banner (top of viewport, non-intrusive) */}
      {bannerVisible && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed top-2 left-1/2 z-[60] -translate-x-1/2 transition-all duration-300",
            "max-w-[calc(100vw-1rem)] sm:max-w-md",
          )}
        >
          <Card className={cn("border shadow-lg", bannerClasses[bannerKind])}>
            <CardContent className="flex items-center gap-3 p-3">
              {bannerKind === "offline" ? (
                <WifiOff className="size-4 shrink-0" aria-hidden />
              ) : bannerKind === "syncing" ? (
                <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : bannerKind === "synced" ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
              )}
              <p className="flex-1 text-sm font-medium">
                {bannerKind === "offline" && t("offline.banner", { count: pendingCount })}
                {bannerKind === "syncing" && t("syncing.banner", { count: pendingCount })}
                {bannerKind === "synced" && t("synced.banner")}
                {bannerKind === "failed" && t("failed.banner")}
              </p>
              {bannerKind === "failed" && (
                <Button size="sm" variant="outline" onClick={handleRetrySync} className="text-xs">
                  <RefreshCw className="size-3 mr-1" aria-hidden />
                  {t("failed.retry")}
                </Button>
              )}
              {bannerKind === "offline" && pendingCount === 0 && (
                <button
                  onClick={() => setBannerVisible(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("dismiss")}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

const bannerClasses: Record<string, string> = {
  offline: "border-amber-400/50 bg-amber-50/95 dark:bg-amber-950/80",
  syncing: "border-blue-400/50 bg-blue-50/95 dark:bg-blue-950/80",
  synced: "border-emerald-400/50 bg-emerald-50/95 dark:bg-emerald-950/80",
  failed: "border-red-400/50 bg-red-50/95 dark:bg-red-950/80",
};
