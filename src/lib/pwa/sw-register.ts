/**
 * MindStep PWA Service Worker registration (Prompt 10 — PWA).
 *
 * Handles:
 *   - SW registration on first load.
 *   - Update detection (when a new SW is waiting).
 *   - "Update available" toast prompting the user to reload.
 *   - Online/offline detection with `online`/`offline` window events +
 *     `navigator.connection` change events.
 *
 * The actual SW logic lives in `/public/sw.js`. This file just registers
 * it and surfaces its lifecycle events to the rest of the app via a
 * Zustand store (see `/stores/network-store.ts`).
 */

export interface SWUpdateInfo {
  isUpdateAvailable: boolean;
  waitingSW: ServiceWorker | null;
}

/**
 * Register the service worker. Returns a controller that lets the caller
 * trigger the update flow (SKIP_WAITING) when the user accepts.
 *
 * The callback receives:
 *   - onWaiting: called when a new SW has installed and is waiting to take over.
 *   - onControllerChange: called when the active SW changed (after the user
 *     accepts the update — the page should reload to pick up new assets).
 */
export async function registerSW(handlers: {
  onWaiting?: (waitingSW: ServiceWorker) => void;
  onControllerChange?: () => void;
}): Promise<{ unregister?: () => Promise<boolean> } | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  // Only register in production OR when explicitly enabled (avoids weird dev cache hits).
  const isDev = process.env.NODE_ENV === "development";
  if (isDev && !localStorage.getItem("mindstep.sw.dev")) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none", // always fetch the freshest SW script
    });

    // When a new SW installs and goes into the "waiting" state, surface it.
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          // A new SW is waiting — prompt the user to update.
          handlers.onWaiting?.(installing);
        }
      });
    });

    // When the controller changes (after the user accepts), reload the page
    // so the new SW's cached assets are used.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      handlers.onControllerChange?.();
      // Reload to ensure the new SW's cached app shell is what the user sees.
      window.location.reload();
    });

    // Also check for waiting SWs on every load (in case the user dismissed the
    // toast last time and the SW is still waiting).
    if (reg.waiting) {
      handlers.onWaiting?.(reg.waiting);
    }

    return {
      unregister: async () => {
        const all = await navigator.serviceWorker.getRegistrations();
        await Promise.all(all.map((r) => r.unregister()));
        return true;
      },
    };
  } catch (err) {
    console.warn("[PWA] SW registration failed:", err);
    return null;
  }
}

/**
 * Tell the waiting service worker to skip waiting (take over now).
 * The user has accepted the update.
 */
export function applySWUpdate(waitingSW: ServiceWorker | null): void {
  if (!waitingSW) {
    // Fall back to the global controller's waiting SW if available.
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    return;
  }
  waitingSW.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Subscribe to online/offline events. Returns an unsubscribe function.
 * Both the simple `online`/`offline` window events and the more granular
 * `navigator.connection` change events are wired up.
 */
export function subscribeToNetworkState(handlers: {
  onOnline: () => void;
  onOffline: () => void;
  onConnectionChange?: () => void;
}): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => handlers.onOnline();
  const handleOffline = () => handlers.onOffline();

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // navigator.connection is non-standard but widely supported in Chromium.
  // It fires `change` when the effective type changes (e.g. 4G → 3G).
  let connection: any;
  if ("connection" in navigator) {
    connection = (navigator as any).connection;
    connection?.addEventListener?.("change", () => handlers.onConnectionChange?.());
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    connection?.removeEventListener?.("change", () => handlers.onConnectionChange?.());
  };
}

/**
 * Request notification permission. Returns the new permission state.
 * The user must explicitly grant permission before any web push
 * notifications can be shown.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Show a local notification (when permission is granted and the app
 * is not focused). Falls back silently when not permitted.
 */
export async function showLocalNotification(title: string, body: string, tag?: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // If the document is focused and visible, don't bother with a system
  // notification — the in-app notifications panel will handle it.
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const notif = new Notification(title, {
      body,
      tag: tag || "mindstep",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      silent: false,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Some browsers throw on `new Notification` in insecure contexts —
    // we silently ignore.
  }
}
