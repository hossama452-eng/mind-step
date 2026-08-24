"use client";

/**
 * MindStep — Pi SDK Client Integration (Prompt 12 §2).
 *
 * Loads the official Pi SDK from https://sdk.minepi.com/pi-sdk.js, initializes
 * it with the current version, and exposes typed wrappers for the functions
 * MindStep needs.
 *
 * The Pi SDK ONLY works in the Pi Browser. In other browsers (Chrome, Safari)
 * the SDK script loads but `window.Pi` is undefined — we handle that gracefully.
 *
 * Reference (current per Pi docs):
 *   https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/piAppPlatform/piAppPlatformSDK
 *
 * NEVER put API keys in this file — only the public appId.
 */

import { useEffect, useState, useCallback } from "react";

// ============================================================
// TYPES — match the official Pi SDK shapes
// ============================================================

interface PiUser {
  uid: string;
  username?: string;
}

interface PiAuthResult {
  accessToken: string;
  user: PiUser;
}

interface PiPaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment: unknown) => void;
}

interface PiPaymentDTO {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  to_address: string;
  created_at: string;
  network: string;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    canceled: boolean;
    user_cancelled: boolean;
  };
}

export interface PiProduct {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_in_pi: number;
}

export interface RestoredPurchases {
  purchases?: Array<{ productId: string; quantity: number }>;
}

interface PiSDK {
  init: (config: { version: string; sandbox?: boolean }) => void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound: (payment: PiPaymentDTO) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (
    paymentData: PiPaymentData,
    callbacks: PiPaymentCallbacks,
  ) => Promise<PiPaymentDTO>;
  openShareDialog?: (title: string, message: string) => void;
  makePurchase?: (slug: string) => Promise<{ ok: boolean; productId?: string; paymentId?: string; txid?: string }>;
}

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}

// ============================================================
// TYPES — MindStep's own client-side state
// ============================================================

export interface PiClientConfig {
  network: "testnet" | "mainnet";
  appId: string;
  apiBaseUrl: string;
  sdkScriptUrl: string;
  sdkVersion: string;
  sandbox: boolean;
}

export interface PiSessionInfo {
  userId: string;
  piUid: string;
  piUsername: string | null;
  network: "testnet" | "mainnet";
  expiresAt: string;
  lastUsedAt: string;
}

// ============================================================
// LOAD THE SDK SCRIPT (idempotent)
// ============================================================

let sdkLoadPromise: Promise<PiSDK | null> | null = null;

async function loadPiSdk(scriptUrl: string): Promise<PiSDK | null> {
  if (typeof window === "undefined") return null;
  if (window.Pi) return window.Pi;

  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Pi ?? null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve(window.Pi ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

// ============================================================
// PUBLIC HOOK: usePiSdk()
// ============================================================

export interface UsePiSdkResult {
  /** True once the SDK script has been attempted to load (success or fail). */
  loaded: boolean;
  /** The Pi SDK instance, or null if not loaded / not in Pi Browser. */
  sdk: PiSDK | null;
  /** True iff the SDK is loaded AND the user is in the Pi Browser. */
  available: boolean;
  /** The public client config from /api/pi/client-config. */
  config: PiClientConfig | null;
  /** Error message if loading or config fetch failed. */
  error: string | null;
}

/**
 * Loads the Pi SDK and fetches the public client config.
 * Returns null SDK when not in the Pi Browser — callers should fall back
 * to a regular web UI in that case.
 */
export function usePiAuth(): {
  sdk: (PiSDK & { makePurchase: (slug: string) => Promise<{ ok: boolean; productId?: string; paymentId?: string; txid?: string }> }) | null;
  products: PiProduct[];
  restoredPurchases: RestoredPurchases | null;
} {
  const auth = usePiSdk();
  const [products, setProducts] = useState<PiProduct[]>([]);
  const [restoredPurchases, setRestoredPurchases] = useState<RestoredPurchases | null>(null);

  // Fetch products non-blocking — if it fails, products stays empty []
  // and MindStepPurchaseButton renders null (Dashboard unaffected).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pi/products")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setProducts(data?.products ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Look up the product by slug to get its actual amount.
  // This fixes the bug where every slug mapped to PREMIUM_MONTHLY.
  const purchaseSdk = auth.sdk
    ? {
        ...auth.sdk,
        makePurchase: async (slug: string) => {
          // Find the product by slug to get its real price.
          const product = products.find((p) => p.slug === slug);
          const amount = product?.price_in_pi ?? 1;
          const productKey = slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "PREMIUM_MONTHLY";
          const purchase = await startPiPayment({
            sdk: auth.sdk!,
            productKey,
            amount,
            memo: product?.name ?? "MindStep",
            metadata: { slug, productName: product?.name ?? "MindStep" },
            onApproveEndpoint: (id) => `/api/pi/payments/${id}/approve`,
            onCompleteEndpoint: (id) => `/api/pi/payments/${id}/complete`,
            onCancelEndpoint: (id) => `/api/pi/payments/${id}/cancel`,
            idempotencyKey: crypto.randomUUID(),
            recordPaymentEndpoint: "/api/pi/payments",
          });
          return { ok: purchase.ok, productId: slug, paymentId: purchase.paymentId, txid: purchase.txid };
        },
      }
    : null;

  return { sdk: purchaseSdk as never, products, restoredPurchases };
}

export function usePiSdk(): UsePiSdkResult {
  const [loaded, setLoaded] = useState(false);
  const [sdk, setSdk] = useState<PiSDK | null>(null);
  const [config, setConfig] = useState<PiClientConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch client config first (gives us the SDK URL + sandbox flag).
        const res = await fetch("/api/pi/client-config");
        if (!res.ok) {
          setError("Failed to fetch Pi client config.");
          setLoaded(true);
          return;
        }
        const data = await res.json();
        const cfg: PiClientConfig = data.config;
        if (cancelled) return;
        setConfig(cfg);

        // Load the SDK script.
        const pi = await loadPiSdk(cfg.sdkScriptUrl);
        if (cancelled) return;
        if (!pi) {
          // Not in Pi Browser — that's not an error, just unavailable.
          setLoaded(true);
          return;
        }
        // Initialize the SDK.
        pi.init({ version: cfg.sdkVersion, sandbox: cfg.sandbox });
        setSdk(pi);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loaded,
    sdk,
    available: !!sdk,
    config,
    error,
  };
}

// ============================================================
// PUBLIC HOOK: usePiSession()
// ============================================================

/**
 * Tracks the current Pi session state. Polls /api/pi/auth on mount and
 * whenever the window regains focus.
 */
export function usePiSession(): {
  session: PiSessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [session, setSession] = useState<PiSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pi/auth", { method: "GET" });
      if (res.status === 401) {
        setSession(null);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session ?? null);
    } catch {
      // Network error — leave the previous session state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { session, loading, refresh };
}

// ============================================================
// PUBLIC ACTION: signInWithPi()
// ============================================================

export async function signInWithPi(
  sdk: PiSDK,
  onIncompletePaymentFound: (payment: PiPaymentDTO) => void = () => {},
): Promise<{ ok: true; session: PiSessionInfo } | { ok: false; code: string; message: string }> {
  try {
    // Call Pi.authenticate per official docs.
    const authResult = await sdk.authenticate(["username", "payments"], onIncompletePaymentFound);

    // POST the access token to our backend for /me verification + session creation.
    const res = await fetch("/api/pi/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: authResult.accessToken,
        reportedUid: authResult.user.uid,
        reportedUsername: authResult.user.username,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, code: data?.error?.code ?? "AUTH_FAILED", message: data?.error?.message ?? "Authentication failed." };
    }
    const data = await res.json();
    return { ok: true, session: data.session ?? data.user ?? data };
  } catch (err) {
    // Pi SDK throws when the user cancels — recognize "Cancel" in the message.
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (/cancel/i.test(msg)) {
      return { ok: false, code: "USER_CANCELLED", message: "You cancelled the Pi sign-in." };
    }
    return { ok: false, code: "SDK_ERROR", message: msg };
  }
}

// ============================================================
// PUBLIC ACTION: signOutFromPi()
// ============================================================

export async function signOutFromPi(): Promise<void> {
  await fetch("/api/pi/logout", { method: "POST" });
}

// ============================================================
// PUBLIC ACTION: startPiPayment()
// ============================================================

export interface StartPaymentInput {
  sdk: PiSDK;
  productKey: string; // PREMIUM_MONTHLY | PREMIUM_YEARLY | PREMIUM_LIFETIME
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  // Server endpoints to call from the SDK callbacks.
  onApproveEndpoint: (paymentId: string) => string; // returns /api/pi/payments/[id]/approve
  onCompleteEndpoint: (paymentId: string, txid: string) => string; // /api/pi/payments/[id]/complete
  onCancelEndpoint: (paymentId: string) => string; // /api/pi/payments/[id]/cancel
  // The idempotency key the client generated for this purchase attempt.
  idempotencyKey: string;
  // The endpoint to record the payment (POST /api/pi/payments).
  recordPaymentEndpoint: string;
}

export interface StartPaymentResult {
  ok: boolean;
  paymentId?: string;
  txid?: string;
  entitlementGranted?: boolean;
  code?: string;
  message?: string;
}

/**
 * Starts a Pi payment using the official SDK, with all four callbacks
 * wired to our backend endpoints.
 *
 * Flow:
 *   1. Call Pi.createPayment() — the Pi Wallet opens for the user to confirm.
 *   2. The SDK fires onReadyForServerApproval(paymentId) → we POST to /approve.
 *   3. The user confirms the transaction in their Pi Wallet.
 *   4. The SDK fires onReadyForServerCompletion(paymentId, txid) → we POST to /complete.
 *   5. /complete calls Pi Platform API /complete (server-side) and grants entitlement.
 *   6. We return the result.
 *
 * If the user cancels, the SDK fires onCancel(paymentId) → we POST to /cancel.
 *
 * Idempotency: the client generates an idempotencyKey once per purchase intent.
 * The backend deduplicates on this key — if the SDK retries createPayment, the
 * same payment row is reused.
 */
export async function startPiPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  const { sdk, productKey, amount, memo, metadata, idempotencyKey } = input;

  let paymentId: string | undefined;
  let txid: string | undefined;
  let entitlementGranted = false;

  try {
    // Wrap the SDK call so we can intercept the callbacks.
    const result = await sdk.createPayment(
      { amount, memo, metadata: { ...metadata, productKey, idempotencyKey } },
      {
        onReadyForServerApproval: async (pid: string) => {
          paymentId = pid;
          // First, record the payment in our DB with the idempotency key
          // (so duplicate callbacks are no-ops).
          try {
            await fetch(input.recordPaymentEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productKey,
                piPaymentId: pid,
                idempotencyKey,
                amount,
                currency: "PI",
              }),
            });
          } catch {
            // Best-effort — the approve call below will fail if this fails.
          }
          // Then call our /approve endpoint (which calls Pi Platform API /approve).
          try {
            await fetch(input.onApproveEndpoint(pid), { method: "POST" });
          } catch {
            // Logged on the server — continue.
          }
        },
        onReadyForServerCompletion: async (pid: string, tx: string) => {
          txid = tx;
          try {
            const res = await fetch(input.onCompleteEndpoint(pid, tx), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ txid: tx }),
            });
            if (res.ok) {
              const data = await res.json();
              entitlementGranted = data?.entitlementGranted === true;
            }
          } catch {
            // Logged on the server — the user can manually sync later.
          }
        },
        onCancel: async (pid: string) => {
          try {
            await fetch(input.onCancelEndpoint(pid), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "user_cancelled_via_sdk" }),
            });
          } catch {
            // Best-effort.
          }
        },
        onError: (_error: Error, _payment: unknown) => {
          // Errors are logged via the server. We don't throw here — the
          // createPayment promise will reject if the error is fatal.
        },
      },
    );
    return {
      ok: true,
      paymentId: result.identifier ?? paymentId,
      txid,
      entitlementGranted,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (/cancel/i.test(msg)) {
      return { ok: false, code: "USER_CANCELLED", message: "You cancelled the payment." };
    }
    return { ok: false, code: "PAYMENT_FAILED", message: msg };
  }
}
