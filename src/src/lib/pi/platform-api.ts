/**
 * MindStep — Pi Platform API Client (Prompt 12 §1, §3).
 *
 * Server-side HTTP calls to https://api.minepi.com/v2/*.
 *
 * Two auth modes (per official Pi docs):
 *   - Bearer <accessToken>  — for /me (verifies the Pioneer's identity)
 *   - Key <api_key>         — for /payments/* (server-to-server, NEVER client)
 *
 * Reference (current as of 2025):
 *   https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/piAppPlatform/piAppPlatformAPIs
 *   https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md
 *
 * NEVER expose the API key to the client. NEVER call these endpoints from
 * a client component — only from API routes.
 */

import { getPiServerConfig, type PiNetwork } from "./config";

// ============================================================
// TYPES — mirror the Pi Platform API DTOs
// ============================================================

export interface PiUserDTO {
  uid: string; // app-specific Pioneer identifier
  username?: string; // only present if `username` scope was granted
  credentials?: {
    scopes: string[];
    valid_until: { timestamp: number; iso8601: string };
  };
}

export interface PiPaymentStatus {
  developer_approved: boolean;
  transaction_verified: boolean;
  developer_completed: boolean;
  canceled: boolean;
  user_cancelled: boolean;
}

export interface PiPaymentDTO {
  identifier: string; // payment id
  user_uid: string; // app-specific Pioneer uid
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  to_address: string;
  from_address?: string;
  direction?: string;
  created_at: string;
  network: string; // "pi_testnet" | "pi_mainnet"
  status: PiPaymentStatus;
}

// ============================================================
// INTERNAL FETCH HELPER
// ============================================================

async function piFetch<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  auth: { type: "bearer"; token: string } | { type: "key"; apiKey: string },
  body?: unknown,
): Promise<T> {
  const cfg = getPiServerConfig();
  const url = `${cfg.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: auth.type === "bearer" ? `Bearer ${auth.token}` : `Key ${auth.apiKey}`,
  };
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: bodyStr, cache: "no-store" });
  if (!res.ok) {
    let errBody: { code?: number; message?: string } | null = null;
    try {
      errBody = await res.json();
    } catch {
      // Not JSON — fall through.
    }
    const err = new Error(
      `Pi API ${method} ${path} failed: HTTP ${res.status}${errBody?.message ? ` — ${errBody.message}` : ""}`,
    );
    (err as any).status = res.status;
    (err as any).piError = errBody;
    throw err;
  }
  // Some endpoints return 204 — handle that.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ============================================================
// /me — VERIFY PIONEER IDENTITY (Prompt 12 §1)
// ============================================================

/**
 * Verifies a Pioneer's identity by calling GET /me with the access token
 * returned from Pi.authenticate().
 *
 * Per Pi docs: "the request will fail (401 HTTP error code) if the token
 * has been tampered with."
 *
 * Returns the verified UserDTO — NEVER trust the client-reported uid.
 */
export async function getMe(accessToken: string): Promise<PiUserDTO> {
  return piFetch<PiUserDTO>("/me", "GET", { type: "bearer", token: accessToken });
}

// ============================================================
// /payments/{payment_id} — GET (verify a payment)
// ============================================================

/**
 * Returns the PaymentDTO for a given payment id.
 * Used by our /complete and /cancel routes to verify the actual state of
 * the payment on the Pi Servers before we grant any entitlement.
 */
export async function getPayment(paymentId: string): Promise<PiPaymentDTO> {
  const cfg = getPiServerConfig();
  return piFetch<PiPaymentDTO>(`/payments/${encodeURIComponent(paymentId)}`, "GET", { type: "key", apiKey: cfg.apiKey });
}

// ============================================================
// /payments/{payment_id}/approve — SERVER-SIDE APPROVAL
// ============================================================

/**
 * Marks a payment as developer-approved on the Pi Servers. This is Phase I
 * of the payment flow — once approved, the Pioneer can submit the
 * blockchain transaction in their Pi Wallet.
 *
 * Called from /api/pi/payments/[id]/approve in response to the
 * `onReadyForServerApproval(paymentId)` SDK callback.
 */
export async function approvePayment(paymentId: string): Promise<PiPaymentDTO> {
  const cfg = getPiServerConfig();
  return piFetch<PiPaymentDTO>(
    `/payments/${encodeURIComponent(paymentId)}/approve`,
    "POST",
    { type: "key", apiKey: cfg.apiKey },
  );
}

// ============================================================
// /payments/{payment_id}/complete — SERVER-SIDE COMPLETION
// ============================================================

/**
 * Marks a payment as developer-completed by proving our app has obtained
 * the blockchain transaction ID (txid). This is Phase III of the payment
 * flow — the final step before the payment flow closes.
 *
 * Per Pi security note: "Do not complete any payment within your app until
 * the payment has completed and had a paymentDTO returned from the /complete
 * API endpoint."
 *
 * The returned PaymentDTO.status.transaction_verified MUST be true before we
 * grant any entitlement.
 *
 * Called from /api/pi/payments/[id]/complete in response to the
 * `onReadyForServerCompletion(paymentId, txid)` SDK callback.
 */
export async function completePayment(paymentId: string, txid: string): Promise<PiPaymentDTO> {
  const cfg = getPiServerConfig();
  return piFetch<PiPaymentDTO>(
    `/payments/${encodeURIComponent(paymentId)}/complete`,
    "POST",
    { type: "key", apiKey: cfg.apiKey },
    { txid },
  );
}

// ============================================================
// /payments/{payment_id}/cancel — CANCEL A PAYMENT
// ============================================================

/**
 * Cancels a payment on the Pi Servers. Used when the user cancels in the
 * Pi Wallet or when our backend decides to abort.
 *
 * Safe to call multiple times — Pi idempotently returns the current state.
 */
export async function cancelPayment(paymentId: string): Promise<PiPaymentDTO> {
  const cfg = getPiServerConfig();
  return piFetch<PiPaymentDTO>(
    `/payments/${encodeURIComponent(paymentId)}/cancel`,
    "POST",
    { type: "key", apiKey: cfg.apiKey },
  );
}

// ============================================================
// /payments/incomplete_server_payments — RECOVER INCOMPLETE A2U PAYMENTS
// ============================================================

/**
 * For A2U (App-to-User) payments only — MindStep does NOT use A2U at this
 * time, so this is provided for completeness only. Returns payments that
 * have been created on the server but not yet completed.
 */
export async function getIncompleteServerPayments(): Promise<{ incomplete_server_payments: PiPaymentDTO[] }> {
  const cfg = getPiServerConfig();
  return piFetch<{ incomplete_server_payments: PiPaymentDTO[] }>(
    "/payments/incomplete_server_payments",
    "GET",
    { type: "key", apiKey: cfg.apiKey },
  );
}

// ============================================================
// HELPERS — extract lifecycle state from PaymentDTO
// ============================================================

/**
 * Returns a normalized MindStep status string from the Pi PaymentDTO.
 *
 * The Pi payment lifecycle (per Pi docs):
 *   1. pending                    (payment created, no approval yet)
 *   2. developer_approved          (we called /approve — Pioneer can now confirm)
 *   3. user_approved               (Pioneer confirmed in Pi Wallet — but we can't
 *                                  directly observe this; we infer it from
 *                                  transaction_verified being set, since the
 *                                  tx wouldn't be on the blockchain otherwise)
 *   4. transaction_verified        (Pi Server confirmed the blockchain tx)
 *   5. developer_completed         (we called /complete — final success state)
 *   cancelled                      (user cancelled in Pi Wallet OR we cancelled)
 *   failed                         (Pi Server reports the blockchain tx failed)
 */
export function normalizePaymentStatus(dto: PiPaymentDTO): string {
  const s = dto.status;
  if (s.canceled || s.user_cancelled) return "cancelled";
  if (s.developer_completed && s.transaction_verified) return "completed";
  if (s.transaction_verified) return "transaction_verified";
  if (s.developer_approved) return "developer_approved";
  return "pending";
}

/**
 * Returns true iff this PaymentDTO represents a verified, completed
 * payment that is safe to grant an entitlement against.
 *
 * Per the official docs: status.developer_completed AND
 * status.transaction_verified MUST both be true. We additionally
 * require !canceled and !user_cancelled for belt-and-suspenders safety.
 */
export function isPaymentFullyVerified(dto: PiPaymentDTO, expectedNetwork: PiNetwork): boolean {
  if (dto.status.canceled || dto.status.user_cancelled) return false;
  if (!dto.status.developer_completed) return false;
  if (!dto.status.transaction_verified) return false;
  // Critical compliance check: the network on the PaymentDTO must match
  // the server's active network. Prevents test-Pi transactions from
  // granting mainnet entitlements and vice versa.
  if (dto.network !== (expectedNetwork === "testnet" ? "pi_testnet" : "pi_mainnet")) return false;
  return true;
}
