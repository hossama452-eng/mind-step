import "server-only";
/**
 * MindStep — Durable Premium Entitlement Service (Prompt 12 §4).
 *
 * The entitlement is the source of truth for what the user has paid for.
 *
 * === DURABILITY REQUIREMENTS (Prompt 12 §4) ===
 *
 * The entitlement MUST survive:
 *   - Logout        ✓ Persisted in the DB keyed by userId (not session)
 *   - Login         ✓ Re-read from the DB on every auth
 *   - Refresh       ✓ Read from the DB in middleware on each request
 *   - New device     ✓ Read from the DB by userId — works on any device
 *   - App restart    ✓ Read from the DB on startup
 *
 * NEVER rely on frontend localStorage. The frontend can read the
 * entitlement for display, but every server-side feature gate MUST
 * call `getActiveEntitlement(userId)` which reads from the DB.
 *
 * === COMPLIANCE ===
 *
 *   - Test-Pi transactions (network: "pi_testnet") NEVER grant entitlements.
 *     See `grantEntitlementFromPayment()` — it rejects testnet payments.
 *   - The grantingPaymentId FK ties the entitlement to a specific verified
 *     Pi payment, so we can audit and revoke if needed.
 */

import { db } from "@/lib/db";
import type { Product } from "./products";
import type { PiPaymentDTO } from "./platform-api";
import { isPaymentFullyVerified } from "./platform-api";
import { getPiServerConfig } from "./config";

// ============================================================
// TYPES
// ============================================================

export interface PremiumEntitlementShape {
  id: string;
  userId: string;
  plan: string;
  status: string;
  durationDays: number | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  autoRenew: boolean;
  grantingPaymentId: string | null;
  features: string[];
  lastVerifiedAt: Date | null;
  lastVerifiedBy: string | null;
}

// ============================================================
// READ — get the current active entitlement for a user
// ============================================================

/**
 * Returns the user's active entitlement, or null if none.
 * Reads from the DB — durable across logout/refresh/new device.
 *
 * "Active" means:
 *   - status === "active"
 *   - expiresAt IS NULL OR expiresAt > now
 *
 * If the entitlement has expired (expiresAt < now), it is marked
 * "expired" in the DB and null is returned.
 */
export async function getActiveEntitlement(userId: string): Promise<PremiumEntitlementShape | null> {
  const row = await db.premiumEntitlement.findUnique({ where: { userId } });
  if (!row) return null;

  // Check for expiry — auto-transition expired plans.
  if (row.status === "active" && row.expiresAt && row.expiresAt < new Date()) {
    await db.premiumEntitlement.update({
      where: { id: row.id },
      data: { status: "expired" },
    });
    return null;
  }
  if (row.status !== "active") return null;

  return {
    id: row.id,
    userId: row.userId,
    plan: row.plan,
    status: row.status,
    durationDays: row.durationDays,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    autoRenew: row.autoRenew,
    grantingPaymentId: row.grantingPaymentId,
    features: safeParseFeatures(row.features),
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerifiedBy: row.lastVerifiedBy,
  };
}

/**
 * Returns true iff the user has the requested feature flag in their
 * active entitlement. Used by feature gates (e.g., "is the AI coach
 * limited to free users?").
 */
export async function hasFeature(userId: string, feature: string): Promise<boolean> {
  const ent = await getActiveEntitlement(userId);
  if (!ent) return false;
  return ent.features.includes(feature);
}

// ============================================================
// GRANT — create or extend an entitlement from a verified Pi payment
// ============================================================

/**
 * Grants a premium entitlement from a verified Pi payment.
 *
 * SAFETY CHECKS (Prompt 12 §3, §5, §9):
 *   1. The payment DTO must come from the Pi Platform API (not the client).
 *   2. The payment must be fully verified (developer_completed + transaction_verified).
 *   3. The payment's network MUST match the server's active network.
 *      Test-Pi transactions can NEVER grant a real entitlement.
 *   4. The user's MindStep userId is taken from the PiPayment row
 *      (server-resolved at payment creation), never from the client.
 *
 * The entitlement is idempotent — calling this twice for the same
 * payment is a no-op (the grantingPaymentId is unique).
 *
 * For renewals: if the user already has an active entitlement from a
 * DIFFERENT product, the new entitlement's duration is ADDED to the
 * existing expiresAt (or to now, whichever is later). This means a
 * user who buys 1 month then another 1 month gets 2 months total.
 *
 * Lifetime purchases replace the existing entitlement (lifetime is the
 * maximum plan).
 */
export async function grantEntitlementFromPayment(
  paymentId: string,
  paymentDTO: PiPaymentDTO,
  product: Product,
): Promise<{ entitlement: PremiumEntitlementShape; created: boolean }> {
  const cfg = getPiServerConfig();

  // === COMPLIANCE CHECKS — NEVER SKIP ===
  if (!isPaymentFullyVerified(paymentDTO, cfg.network)) {
    throw new Error(
      `Refusing to grant entitlement: payment ${paymentId} is not fully verified on the ${cfg.network} network.`,
    );
  }
  // Cross-check that the paymentDTO's identifier matches our paymentId.
  if (paymentDTO.identifier !== paymentId) {
    throw new Error(
      `Payment identifier mismatch: expected ${paymentId}, got ${paymentDTO.identifier}`,
    );
  }

  // Fetch the PiPayment row to get the userId (server-resolved at creation).
  const piPayment = await db.piPayment.findUnique({
    where: { piPaymentId: paymentId },
    select: { userId: true, network: true, status: true },
  });
  if (!piPayment) {
    throw new Error(`No PiPayment row found for ${paymentId}`);
  }
  // Cross-check: the network on our PiPayment row must match the active network.
  if (piPayment.network !== cfg.network) {
    throw new Error(
      `Payment network mismatch: payment is on ${piPayment.network} but server is configured for ${cfg.network}.`,
    );
  }
  // Cross-check: the network on the PaymentDTO must match our payment row.
  if (piPayment.network !== paymentDTO.network) {
    throw new Error(
      `PaymentDTO network ${paymentDTO.network} doesn't match our stored network ${piPayment.network}.`,
    );
  }

  // === IDEMPOTENCY — if we already granted an entitlement for this payment, return it ===
  const existing = await db.premiumEntitlement.findUnique({
    where: { grantingPaymentId: paymentId },
  });
  if (existing) {
    return {
      entitlement: {
        id: existing.id,
        userId: existing.userId,
        plan: existing.plan,
        status: existing.status,
        durationDays: existing.durationDays,
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        autoRenew: existing.autoRenew,
        grantingPaymentId: existing.grantingPaymentId,
        features: safeParseFeatures(existing.features),
        lastVerifiedAt: existing.lastVerifiedAt,
        lastVerifiedBy: existing.lastVerifiedBy,
      },
      created: false,
    };
  }

  // === GRANT OR EXTEND ===
  const userId = piPayment.userId;
  const now = new Date();
  const isLifetime = product.durationDays === null;
  const expiresAt = isLifetime
    ? null
    : new Date(now.getTime() + (product.durationDays as number) * 24 * 60 * 60 * 1000);

  const existingForUser = await db.premiumEntitlement.findUnique({ where: { userId } });

  // Lifetime supersedes everything.
  if (isLifetime) {
    const row = await db.premiumEntitlement.upsert({
      where: { userId },
      create: {
        userId,
        plan: product.entitlementPlan,
        status: "active",
        durationDays: null,
        startedAt: now,
        expiresAt: null,
        grantingPaymentId: paymentId,
        features: JSON.stringify(product.features),
        lastVerifiedAt: now,
        lastVerifiedBy: "pi_payment_grant",
      },
      update: {
        plan: product.entitlementPlan,
        status: "active",
        durationDays: null,
        startedAt: now,
        expiresAt: null,
        grantingPaymentId: paymentId,
        features: JSON.stringify(product.features),
        lastVerifiedAt: now,
        lastVerifiedBy: "pi_payment_grant",
      },
    });
    return { entitlement: rowToShape(row), created: true };
  }

  // Monthly/yearly — extend the existing expiry if there's an active sub.
  if (existingForUser && existingForUser.status === "active") {
    const baseTime = existingForUser.expiresAt && existingForUser.expiresAt > now
      ? existingForUser.expiresAt
      : now;
    const newExpiry = new Date(baseTime.getTime() + (product.durationDays as number) * 24 * 60 * 60 * 1000);
    const row = await db.premiumEntitlement.update({
      where: { id: existingForUser.id },
      data: {
        plan: product.entitlementPlan,
        status: "active",
        durationDays: product.durationDays,
        expiresAt: newExpiry,
        grantingPaymentId: paymentId,
        features: JSON.stringify(product.features),
        lastVerifiedAt: now,
        lastVerifiedBy: "pi_payment_grant",
      },
    });
    return { entitlement: rowToShape(row), created: false };
  }

  // First-time sub.
  const row = await db.premiumEntitlement.upsert({
    where: { userId },
    create: {
      userId,
      plan: product.entitlementPlan,
      status: "active",
      durationDays: product.durationDays,
      startedAt: now,
      expiresAt,
      grantingPaymentId: paymentId,
      features: JSON.stringify(product.features),
      lastVerifiedAt: now,
      lastVerifiedBy: "pi_payment_grant",
    },
    update: {
      plan: product.entitlementPlan,
      status: "active",
      durationDays: product.durationDays,
      startedAt: now,
      expiresAt,
      grantingPaymentId: paymentId,
      features: JSON.stringify(product.features),
      lastVerifiedAt: now,
      lastVerifiedBy: "pi_payment_grant",
    },
  });
  return { entitlement: rowToShape(row), created: true };
}

// ============================================================
// REVOKE — admin-only, audited
// ============================================================

export async function revokeEntitlement(userId: string, reason: string): Promise<void> {
  await db.premiumEntitlement.update({
    where: { userId },
    data: {
      status: "cancelled",
      lastVerifiedAt: new Date(),
      lastVerifiedBy: `manual_revoke:${reason.slice(0, 60)}`,
    },
  });
}

// ============================================================
// HELPERS
// ============================================================

function safeParseFeatures(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function rowToShape(row: any): PremiumEntitlementShape {
  return {
    id: row.id,
    userId: row.userId,
    plan: row.plan,
    status: row.status,
    durationDays: row.durationDays,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    autoRenew: row.autoRenew,
    grantingPaymentId: row.grantingPaymentId,
    features: safeParseFeatures(row.features),
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerifiedBy: row.lastVerifiedBy,
  };
}
