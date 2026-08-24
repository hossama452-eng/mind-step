/**
 * MindStep Service Worker (Prompt 10 — PWA).
 *
 * Strategy:
 *   - App shell: cache-first (instant loads, with background update).
 *   - API reads (GET): network-first, fall back to cache (offline-friendly).
 *   - API writes (POST/PATCH/DELETE): network-only; on failure, the client
 *     queues them via OfflineMutation table — we DO NOT replay them here
 *     because we cannot authenticate from the SW. The sync flow is owned
 *     by the React client (see /lib/offline/).
 *   - Static assets (/_next/static/*, fonts, images): stale-while-revalidate.
 *   - Navigation requests: network-first, fall back to cached app shell
 *     (so offline users still see the UI). If both fail, serve /offline.html.
 *
 * Update handling (Prompt 10 — PWA Update handling):
 *   - The SW calls `skipWaiting()` when activated but the new SW only takes
 *     over once all tabs are closed OR the user clicks "Update" in the toast.
 *   - The client sends a `{ type: "SKIP_WAITING" }` message when the user
 *     accepts the update.
 *
 * IMPORTANT: This file is served as-is from `/public/sw.js`. It must NOT
 * import any modules (no ESM imports) — it must run in the SW scope.
 */

const SW_VERSION = "mindstep-v1";
const APP_SHELL_CACHE = `${SW_VERSION}-app-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";

// Files that make up the app shell. Cached on install so the app works offline.
// These are intentionally minimal — the build's hashed assets are cached
// on-demand at runtime via the fetch handler.
const APP_SHELL_FILES = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  console.log("[SW] install", SW_VERSION);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      // Use individual try/catch so one missing file doesn't kill the install.
      await Promise.all(
        APP_SHELL_FILES.map(async (file) => {
          try {
            const res = await fetch(file, { cache: "no-cache" });
            if (res && res.ok) await cache.put(file, res.clone());
          } catch {
            // Ignore — file may not exist in some environments.
          }
        }),
      );
      // Take over immediately — the client will show a "ready to update" toast
      // when a new SW arrives. Don't `self.skipWaiting()` here; let the user
      // opt-in (Prompt 10 — Update handling).
    })(),
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate", SW_VERSION);
  event.waitUntil(
    (async () => {
      // Clean up old caches.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      // Take control of all clients immediately.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // User clicked "Update" in the toast → take over now.
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests. Cross-origin (fonts, CDN, API) is
  // best left to the browser's default behavior.
  if (url.origin !== self.location.origin) return;

  // Never handle non-GET API writes — they go to the network. The client
  // OfflineMutation queue handles offline writes (Prompt 10 — Offline).
  if (request.method !== "GET") return;

  // Skip Next.js HMR/dev-only paths (only matters in dev).
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Navigation requests (HTML pages): network-first → cached shell → offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Static assets (/_next/static/, /icons/, /fonts/, /logo.svg, etc.):
  // stale-while-revalidate — instant from cache, refresh in background.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/logo.svg" ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // API GET reads: network-first, fall back to cache (offline-friendly).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  // Everything else: try network, fall back to cache if any.
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })(),
  );
});

// ============================================================
// CACHING STRATEGIES
// ============================================================

async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    // Cache successful HTML responses for offline use.
    if (networkResponse && networkResponse.ok && networkResponse.headers.get("content-type")?.includes("text/html")) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Network failed — try the cached app shell first.
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to the cached root shell (so the SPA still loads).
    const rootShell = await caches.match("/");
    if (rootShell) return rootShell;
    // Last resort: the offline page.
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;
    return new Response("You are offline.", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain" } });
  }
}

async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Network failed — try the cache.
    const cached = await caches.match(request);
    if (cached) {
      // Tag the response so the client knows it's stale.
      const headers = new Headers(cached.headers);
      headers.set("X-MindStep-Source", "cache");
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response(JSON.stringify({ error: "offline", message: "You are offline. Data may be stale." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "X-MindStep-Source": "offline" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}
