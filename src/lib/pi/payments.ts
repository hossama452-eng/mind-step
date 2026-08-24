/**
 * MindStep — Pi Payment Service (Prompt 12 §3).
 *
 * Implements the full Pi payment lifecycle with server-side verification:
 *
 *   1. Create payment    — client calls Pi.createPayment; we record the
 *                          pending payment with an idempotency key.
 *   2. Show payment state — client can poll our DB for the current state.
 *   3. User approval      — handled by the Pi Wallet (Phase II of Pi's flow).
 *   4. Payment callbacks  — Pi SDK calls onReadyForServerApproval(paymentId)
 *                          and onReadyForServerCompletion(paymentId, txid);
 *                          our client forwards these to our backend.
 *   5. Server-side verification — we call Pi Platform API /approve and
 *                          /complete ourselves, NEVER trusting the client.
 *   6. Completion          — after /complete returns a verified PaymentDTO,
 *                          we grant the entitlement.
 *   7. Cancellation        — client onCancel(paymentId) → we mark cancelled
 *                          AND call Pi Platform API /cancel for safety.
 *   8. Error handling      — every step catches, logs, and persists errors
 *                          on the PiPayment row.
 *   9. Duplicate prevention — idempotency key prevents double-charges if
 *                          the SDK retries. The unique constraint on
 *                          `clientPaymentIdempotencyKey` is the gate.
 *  10. Persistent entitlement — granted by entitlements.ts, durable.
 *
 * === SECURITY ===
 *
 *   - NEVER trust the client-reported amount/product. We look up the
 *     product by key and use the SERVER's amount.
 *   - The userId is taken from the session, never from the request body.
 *   - The network is taken from the server config, never from the client.
 *   - Entitlements are only granted after Pi's /complete returns a fully
 *     verified PaymentDTO (developer_completed + transaction_verified).
 */

import { db } from "@/lib/db";
import { getPiServerConfig, networkToPiNetwork } from "./config";
import {
  approvePayment,
  completePayment,
  cancelPayment,
  getPayment,
  isPaymentFullyVerified,
  normalizePaymentStatus,
  type PiPaymentDTO,
} from "./platform-api";
import { validateProductPayment, type Product } from "./products";
import { grantEntitlementFromPayment } from "./entitlements";

// ============================================================
// TYPES
// ============================================================

export interface CreatePaymentInput {
  productKey: string;
  // The Pi payment id returned by Pi.createPayment (we don't initiate the
  // payment — the client does via the Pi SDK).
  piPaymentId: string;
  // Idempotency key — the client generates this; we use it to dedup.
  idempotencyKey: string;
  // The amount the client THINKS they're paying. We verify this matches
  // the centrally-configured product — never trust the client.
  amount: number;
  currency: string;
}

export interface CreatePaymentResult {
  ok: boolean;
  payment?: {
    id: string;
    piPaymentId: string;
    product: string;
    amount: number;
    currency: string;
    status: string;
    network: string;
  };
  code?: string;
  message?: string;
}

// ============================================================
// 1. CREATE PAYMENT (record the pending payment with idempotency)
// ============================================================

/**
 * Records a pending Pi payment. Called when the client has just called
 * Pi.createPayment() and received a paymentId from the SDK.
 *
 * Idempotency: if `idempotencyKey` already exists, we return the existing
 * payment row (no new row created). This is the duplicate-prevention
 * mechanism (Prompt 12 §3 §9).
 *
 * VALIDATION:
 *   - productKey must be a known product
 *   - amount + currency must match the product's configured value
 *   - piPaymentId must not already exist with a DIFFERENT idempotencyKey
 *     (would indicate a client bug or replay attack)
 */
export async function createPaymentRecord(
  userId: string,
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const cfg = getPiServerConfig();
  // Validate product.
  const validation = validateProductPayment(input.productKey, input.amount, input.currency);
  if (!validation.valid || !validation.product) {
    return { ok: false, code: "INVALID_PRODUCT", message: validation.reason };
  }
  const product = validation.product;

  // Idempotency check #1: same idempotency key → return existing row.
  if (input.idempotencyKey) {
    const existing = await db.piPayment.findUnique({
      where: { clientPaymentIdempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      // If the existing row is for the same user, return it. Otherwise reject.
      if (existing.userId !== userId) {
        return { ok: false, code: "IDEMPOTENCY_KEY_MISMATCH", message: "Idempotency key belongs to a different user." };
      }
      return {
        ok: true,
        payment: {
          id: existing.id,
          piPaymentId: existing.piPaymentId,
          product: existing.product,
          amount: existing.amount,
          currency: existing.currency,
          status: existing.status,
          network: existing.network,
        },
      };
    }
  }

  // Idempotency check #2: piPaymentId must not already exist for a DIFFERENT
  // idempotencyKey (would indicate a bug or replay).
  const existingByPiId = await db.piPayment.findUnique({
    where: { piPaymentId: input.piPaymentId },
  });
  if (existingByPiId) {
    if (existingByPiId.userId !== userId) {
      return { ok: false, code: "PAYMENT_ID_MISMATCH", message: "Pi payment id belongs to a different user." };
    }
    // Same user — return the existing row (idempotent).
    return {
      ok: true,
      payment: {
        id: existingByPiId.id,
        piPaymentId: existingByPiId.piPaymentId,
        product: existingByPiId.product,
        amount: existingByPiId.amount,
        currency: existingByPiId.currency,
        status: existingByPiId.status,
        network: existingByPiId.network,
      },
    };
  }

  // Create the payment row.
  const row = await db.piPayment.create({
    data: {
      userId,
      piPaymentId: input.piPaymentId,
      amount: product.amount,
      currency: product.currency,
      product: product.key,
      status: "pending",
      network: cfg.network,
      clientPaymentIdempotencyKey: input.idempotencyKey,
      metadata: JSON.stringify({ productKey: product.key, plan: product.entitlementPlan }),
    },
  });

  return {
    ok: true,
    payment: {
      id: row.id,
      piPaymentId: row.piPaymentId,
      product: row.product,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      network: row.network,
    },
  };
}

// ============================================================
// 2. SERVER-SIDE APPROVAL (Phase I)
// ============================================================

/**
 * Called by our /api/pi/payments/[id]/approve endpoint when the client
 * receives the SDK callback `onReadyForServerApproval(paymentId)`.
 *
 * Calls Pi Platform API POST /payments/{paymentId}/approve.
 *
 * NEVER trusts the client — calls the Pi Platform API directly.
 *
 * Idempotent: if the payment is already developer_approved, we still
 * call /approve (Pi is idempotent).
 */
export async function serverApprovePayment(
  userId: string,
  piPaymentId: string,
): Promise<{ ok: boolean; paymentDTO?: PiPaymentDTO; message?: string; code?: string }> {
  // Fetch the payment row to verify ownership.
  const row = await db.piPayment.findUnique({
    where: { piPaymentId },
    select: { id: true, userId: true, status: true, network: true },
  });
  if (!row || row.userId !== userId) {
    return { ok: false, code: "NOT_FOUND", message: "Payment not found for this user." };
  }
  const cfg = getPiServerConfig();
  if (row.network !== cfg.network) {
    return { ok: false, code: "NETWORK_MISMATCH", message: `Payment is on ${row.network}, server is ${cfg.network}.` };
  }

  // Call Pi Platform API /approve.
  let dto: PiPaymentDTO;
  try {
    dto = await approvePayment(piPaymentId);
  } catch (err: any) {
    await db.piPayment.update({
      where: { id: row.id },
      data: { error: JSON.stringify({ code: "APPROVE_FAILED", message: err?.message ?? "Unknown" }) },
    });
    return { ok: false, code: "APPROVE_FAILED", message: err?.message ?? "Pi /approve failed." };
  }

  const status = normalizePaymentStatus(dto);
  await db.piPayment.update({
    where: { id: row.id },
    data: {
      status,
      piPaymentDTO: JSON.stringify(dto),
      verifiedAt: new Date(),
    },
  });

  return { ok: true, paymentDTO: dto };
}

// ============================================================
// 3. SERVER-SIDE COMPLETION (Phase III) + ENTITLEMENT GRANT
// ============================================================

/**
 * Called by our /api/pi/payments/[id]/complete endpoint when the client
 * receives the SDK callback `onReadyForServerCompletion(paymentId, txid)`.
 *
 * Calls Pi Platform API POST /payments/{paymentId}/complete with the txid.
 *
 * CRITICAL: NEVER grants an entitlement unless the returned PaymentDTO is
 * FULLY VERIFIED (developer_completed AND transaction_verified AND network
 * matches the server).
 *
 * Idempotent: if the payment is already completed AND entitlement granted,
 * returns the existing state without re-calling /complete.
 */
export async function serverCompletePayment(
  userId: string,
  piPaymentId: string,
  txid: string,
): Promise<{
  ok: boolean;
  paymentDTO?: PiPaymentDTO;
  entitlementGranted?: boolean;
  message?: string;
  code?: string;
}> {
  // Fetch the payment row to verify ownership.
  const row = await db.piPayment.findUnique({
    where: { piPaymentId },
    select: { id: true, userId: true, status: true, network: true, product: true },
  });
  if (!row || row.userId !== userId) {
    return { ok: false, code: "NOT_FOUND", message: "Payment not found for this user." };
  }
  const cfg = getPiServerConfig();
  if (row.network !== cfg.network) {
    return { ok: false, code: "NETWORK_MISMATCH", message: `Payment is on ${row.network}, server is ${cfg.network}.` };
  }

  // Idempotency: if we already completed AND granted an entitlement,
  // return the existing state without re-calling Pi.
  if (row.status === "completed") {
    const linkedEntitlement = await db.premiumEntitlement.findUnique({
      where: { grantingPaymentId: row.id },
      select: { id: true },
    });
    return {
      ok: true,
      paymentDTO: undefined,
      entitlementGranted: !!linkedEntitlement,
      message: "Payment already completed — no-op.",
    };
  }

  // Call Pi Platform API /complete.
  let dto: PiPaymentDTO;
  try {
    dto = await completePayment(piPaymentId, txid);
  } catch (err: any) {
    await db.piPayment.update({
      where: { id: row.id },
      data: {
        error: JSON.stringify({ code: "COMPLETE_FAILED", message: err?.message ?? "Unknown" }),
      },
    });
    return { ok: false, code: "COMPLETE_FAILED", message: err?.message ?? "Pi /complete failed." };
  }

  const status = normalizePaymentStatus(dto);
  await db.piPayment.update({
    where: { id: row.id },
    data: {
      status,
      txid,
      piPaymentDTO: JSON.stringify(dto),
      completedAt: status === "completed" ? new Date() : null,
      verifiedAt: new Date(),
    },
  });

  // Verify the payment is FULLY verified before granting the entitlement.
  if (!isPaymentFullyVerified(dto, cfg.network)) {
    return {
      ok: true,
      paymentDTO: dto,
      entitlementGranted: false,
      message: "Payment not fully verified — entitlement NOT granted.",
    };
  }

  // Grant the entitlement. Look up the product from our allow-list.
  const product = (await import("./products")).getProduct(row.product);
  if (!product) {
    return { ok: true, paymentDTO: dto, entitlementGranted: false, message: `Unknown product ${row.product} — entitlement not granted.` };
  }
  try {
    await grantEntitlementFromPayment(row.id, dto, product);
  } catch (err: any) {
    // Log the grant failure but don't fail the whole request — the user
    // can contact support with the paymentId and we can grant manually.
    await db.piPayment.update({
      where: { id: row.id },
      data: { error: JSON.stringify({ code: "ENTITLEMENT_GRANT_FAILED", message: err?.message ?? "Unknown" }) },
    });
    return { ok: true, paymentDTO: dto, entitlementGranted: false, message: "Entitlement grant failed — see error on payment row." };
  }

  return { ok: true, paymentDTO: dto, entitlementGranted: true };
}

// ============================================================
// 4. CANCEL (client-initiated via SDK onCancel callback)
// ============================================================

/**
 * Called by our /api/pi/payments/[id]/cancel endpoint when the client
 * receives the SDK callback `onCancel(paymentId)`.
 *
 * Marks our payment row as cancelled AND calls Pi Platform API /cancel
 * to ensure the Pi Servers are also aware.
 */
export async function serverCancelPayment(
  userId: string,
  piPaymentId: string,
  reason?: string,
): Promise<{ ok: boolean; paymentDTO?: PiPaymentDTO; message?: string; code?: string }> {
  const row = await db.piPayment.findUnique({
    where: { piPaymentId },
    select: { id: true, userId: true, status: true, network: true },
  });
  if (!row || row.userId !== userId) {
    return { ok: false, code: "NOT_FOUND", message: "Payment not found for this user." };
  }

  // Call Pi Platform API /cancel (idempotent — safe to call on already-cancelled payments).
  let dto: PiPaymentDTO | null = null;
  try {
    dto = await cancelPayment(piPaymentId);
  } catch (err: any) {
    // We still mark as cancelled locally — the Pi /cancel call failure
    // could be transient. Log it.
    await db.piPayment.update({
      where: { id: row.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        error: JSON.stringify({ code: "PI_CANCEL_FAILED", message: err?.message ?? "Unknown", reason }),
      },
    });
    return { ok: true, message: "Cancelled locally — Pi /cancel call failed but local state updated." };
  }

  await db.piPayment.update({
    where: { id: row.id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      piPaymentDTO: JSON.stringify(dto),
    },
  });

  return { ok: true, paymentDTO: dto };
}

// ============================================================
// 5. GET PAYMENT STATE (for client polling)
// ============================================================

export interface PaymentState {
  id: string;
  piPaymentId: string;
  product: string;
  amount: number;
  currency: string;
  status: string;
  txid: string | null;
  network: string;
  verifiedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  error: string | null;
  createdAt: Date;
}

/**
 * Returns the current state of a payment. The client can poll this
 * to display "pending → approved → completed" to the user.
 *
 * The client never sees the API key or any server-only state — only
 * what's safe to display.
 */
export async function getPaymentState(userId: string, piPaymentId: string): Promise<PaymentState | null> {
  const row = await db.piPayment.findUnique({
    where: { piPaymentId },
    select: {
      id: true, piPaymentId: true, product: true, amount: true, currency: true,
      status: true, txid: true, network: true, verifiedAt: true,
      completedAt: true, cancelledAt: true, error: true, createdAt: true,
      userId: true,
    },
  });
  if (!row || row.userId !== userId) return null;
  // Don't expose the error JSON verbatim — it might contain internal context.
  // Just expose whether there's an error.
  const safeError = row.error ? "An error occurred. Contact support with this payment id." : null;
  return {
    id: row.id,
    piPaymentId: row.piPaymentId,
    product: row.product,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    txid: row.txid,
    network: row.network,
    verifiedAt: row.verifiedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    error: safeError,
    createdAt: row.createdAt,
  };
}

// ============================================================
// 6. GET PAYMENT HISTORY
// ============================================================

/**
 * Returns the user's payment history (minimum required transaction info).
 * Per Prompt 12 §7: don't expose sensitive server-side info.
 */
export async function getPaymentHistory(userId: string, limit: number = 50): Promise<PaymentState[]> {
  const rows = await db.piPayment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    select: {
      id: true, piPaymentId: true, product: true, amount: true, currency: true,
      status: true, txid: true, network: true, verifiedAt: true,
      completedAt: true, cancelledAt: true, error: true, createdAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    error: row.error ? "An error occurred." : null,
  }));
}

// ============================================================
// 7. SYNC FROM PI (re-fetch a payment's current state from Pi Servers)
// ============================================================

/**
 * Re-fetches the current state of a payment from the Pi Platform API
 * and updates our local row. Used by:
 *   - Background sync (in case the SDK callback was missed)
 *   - User-initiated "refresh" in the UI
 *   - Recovery from incomplete payments
 *
 * Returns the new state, or null if the payment doesn't exist on the
 * Pi Servers.
 */
export async function syncPaymentFromPi(userId: string, piPaymentId: string): Promise<PaymentState | null> {
  const row = await db.piPayment.findUnique({
    where: { piPaymentId },
    select: { id: true, userId: true, network: true, product: true, status: true },
  });
  if (!row || row.userId !== userId) return null;

  let dto: PiPaymentDTO;
  try {
    dto = await getPayment(piPaymentId);
  } catch (err: any) {
    if (err?.status === 404) return null;
    throw err;
  }

  const status = normalizePaymentStatus(dto);
  const cfg = getPiServerConfig();
  const wasCompleted = row.status === "completed";

  await db.piPayment.update({
    where: { id: row.id },
    data: {
      status,
      txid: dto.status.transaction_verified ? (dto as any).transaction?.txid ?? null : null,
      piPaymentDTO: JSON.stringify(dto),
      verifiedAt: new Date(),
      completedAt: status === "completed" ? new Date() : null,
    },
  });

  // If the payment just became fully verified AND we haven't granted an
  // entitlement yet, grant it now (recovery path).
  if (!wasCompleted && isPaymentFullyVerified(dto, cfg.network)) {
    const product = (await import("./products")).getProduct(row.product);
    if (product) {
      try {
        await grantEntitlementFromPayment(row.id, dto, product);
      } catch (err) {
        // Don't fail the sync — log it.
        console.error("[pi-payments] Entitlement grant failed during sync:", err);
      }
    }
  }

  return getPaymentState(userId, piPaymentId);
}
