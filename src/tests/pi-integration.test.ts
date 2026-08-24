/**
 * MindStep — Pi Network Integration unit tests (Prompt 12 §11).
 *
 * Covers pure functions only (no DB / no network):
 *   - Config separation (testnet/mainnet, no API key leak)
 *   - Product validation (reject amount tampering, unknown products)
 *   - Payment status normalization
 *   - isPaymentFullyVerified (rejects testnet PaymentDTO on mainnet server, vice versa)
 *   - PiSDK types (TypeScript compile-time check)
 *
 * DB-backed tests (auth flow, payment lifecycle, entitlement persistence)
 * are in scripts/test-pi-api.ts — they run against the live dev server.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPiServerConfig,
  getPiClientConfig,
  isPiServerConfigured,
  networkToPiNetwork,
  piNetworkToNetwork,
} from "@/lib/pi/config";
import {
  PRODUCTS,
  PRODUCT_KEYS,
  getProduct,
  listProducts,
  validateProductPayment,
} from "@/lib/pi/products";
import {
  normalizePaymentStatus,
  isPaymentFullyVerified,
  type PiPaymentDTO,
} from "@/lib/pi/platform-api";

// ============================================================
// ENVIRONMENT SETUP
// ============================================================

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  // Reset to a known testnet state before each test.
  setEnv({
    PI_NETWORK: "testnet",
    PI_APP_ID_TESTNET: "test-app-id",
    PI_APP_API_KEY_TESTNET: "test-api-key",
    PI_APP_ID_MAINNET: undefined,
    PI_APP_API_KEY_MAINNET: undefined,
  });
});

afterEach(() => {
  // Restore original env.
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ============================================================
// CONFIG — TESTNET/MAINNET SEPARATION (Prompt 12 §5)
// ============================================================

describe("Pi Config (Prompt 12 §5 — Testnet/Mainnet separation)", () => {
  it("defaults to testnet when PI_NETWORK is unset", () => {
    delete process.env.PI_NETWORK;
    expect(getPiServerConfig().network).toBe("testnet");
  });

  it("respects PI_NETWORK=testnet", () => {
    setEnv({ PI_NETWORK: "testnet" });
    expect(getPiServerConfig().network).toBe("testnet");
  });

  it("respects PI_NETWORK=mainnet", () => {
    setEnv({
      PI_NETWORK: "mainnet",
      PI_APP_ID_MAINNET: "prod-app-id",
      PI_APP_API_KEY_MAINNET: "prod-api-key",
    });
    expect(getPiServerConfig().network).toBe("mainnet");
  });

  it("uses the correct API key for the active network (testnet)", () => {
    setEnv({
      PI_NETWORK: "testnet",
      PI_APP_API_KEY_TESTNET: "test-key",
      PI_APP_API_KEY_MAINNET: "prod-key",
    });
    expect(getPiServerConfig().apiKey).toBe("test-key");
  });

  it("uses the correct API key for the active network (mainnet)", () => {
    setEnv({
      PI_NETWORK: "mainnet",
      PI_APP_API_KEY_TESTNET: "test-key",
      PI_APP_API_KEY_MAINNET: "prod-key",
    });
    expect(getPiServerConfig().apiKey).toBe("prod-key");
  });

  it("isPiServerConfigured returns true when both appId + apiKey are set", () => {
    setEnv({
      PI_APP_ID_TESTNET: "x",
      PI_APP_API_KEY_TESTNET: "y",
    });
    expect(isPiServerConfigured()).toBe(true);
  });

  it("isPiServerConfigured returns false when apiKey is missing", () => {
    setEnv({
      PI_APP_ID_TESTNET: "x",
      PI_APP_API_KEY_TESTNET: undefined,
    });
    expect(isPiServerConfigured()).toBe(false);
  });

  it("client config NEVER exposes the API key", () => {
    setEnv({
      PI_APP_ID_TESTNET: "test-app",
      PI_APP_API_KEY_TESTNET: "SECRET-API-KEY",
    });
    const clientConfig = getPiClientConfig();
    // The client config object should NOT have an apiKey field at all.
    expect(clientConfig).not.toHaveProperty("apiKey");
    // Stringify and check — the API key should not appear anywhere.
    const serialized = JSON.stringify(clientConfig);
    expect(serialized).not.toContain("SECRET-API-KEY");
    // But it SHOULD have the public appId.
    expect(clientConfig.appId).toBe("test-app");
    expect(clientConfig.sandbox).toBe(true); // testnet → sandbox=true
  });

  it("client config has sandbox=false on mainnet", () => {
    setEnv({
      PI_NETWORK: "mainnet",
      PI_APP_ID_MAINNET: "prod-app",
      PI_APP_API_KEY_MAINNET: "prod-key",
    });
    const clientConfig = getPiClientConfig();
    expect(clientConfig.network).toBe("mainnet");
    expect(clientConfig.sandbox).toBe(false);
  });

  it("networkToPiNetwork maps correctly", () => {
    expect(networkToPiNetwork("testnet")).toBe("pi_testnet");
    expect(networkToPiNetwork("mainnet")).toBe("pi_mainnet");
  });

  it("piNetworkToNetwork maps correctly (and rejects unknown)", () => {
    expect(piNetworkToNetwork("pi_testnet")).toBe("testnet");
    expect(piNetworkToNetwork("pi_mainnet")).toBe("mainnet");
    expect(piNetworkToNetwork("garbage")).toBeNull();
  });
});

// ============================================================
// PRODUCTS (Prompt 12 §6 — centrally-configured)
// ============================================================

describe("Pi Products (Prompt 12 §6)", () => {
  it("has exactly 3 product keys: PREMIUM_MONTHLY, PREMIUM_YEARLY, PREMIUM_LIFETIME", () => {
    expect(PRODUCT_KEYS).toHaveLength(3);
    expect(PRODUCT_KEYS).toContain("PREMIUM_MONTHLY");
    expect(PRODUCT_KEYS).toContain("PREMIUM_YEARLY");
    expect(PRODUCT_KEYS).toContain("PREMIUM_LIFETIME");
  });

  it("all products use PI currency", () => {
    for (const product of listProducts()) {
      expect(product.currency).toBe("PI");
    }
  });

  it("PREMIUM_MONTHLY grants 30 days", () => {
    expect(PRODUCTS.PREMIUM_MONTHLY.durationDays).toBe(30);
    expect(PRODUCTS.PREMIUM_MONTHLY.entitlementPlan).toBe("premium_monthly");
  });

  it("PREMIUM_YEARLY grants 365 days", () => {
    expect(PRODUCTS.PREMIUM_YEARLY.durationDays).toBe(365);
    expect(PRODUCTS.PREMIUM_YEARLY.entitlementPlan).toBe("premium_yearly");
  });

  it("PREMIUM_LIFETIME grants null duration (lifetime)", () => {
    expect(PRODUCTS.PREMIUM_LIFETIME.durationDays).toBeNull();
    expect(PRODUCTS.PREMIUM_LIFETIME.entitlementPlan).toBe("premium_lifetime");
  });

  it("each product has at least one feature", () => {
    for (const product of listProducts()) {
      expect(product.features.length).toBeGreaterThan(0);
    }
  });

  it("getProduct returns null for unknown keys", () => {
    expect(getProduct("FAKE_PRODUCT")).toBeNull();
    expect(getProduct("")).toBeNull();
  });

  it("validateProductPayment rejects unknown products", () => {
    const result = validateProductPayment("FAKE", 1, "PI");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unknown");
  });

  it("validateProductPayment rejects amount tampering", () => {
    // PREMIUM_LIFETIME costs 50 PI — a client tries to pay 0.001
    const result = validateProductPayment("PREMIUM_LIFETIME", 0.001, "PI");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Amount mismatch");
  });

  it("validateProductPayment rejects currency tampering", () => {
    const result = validateProductPayment("PREMIUM_MONTHLY", 1, "USD");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Currency mismatch");
  });

  it("validateProductPayment accepts valid product+amount+currency", () => {
    const result = validateProductPayment("PREMIUM_MONTHLY", 1, "PI");
    expect(result.valid).toBe(true);
    expect(result.product?.key).toBe("PREMIUM_MONTHLY");
  });
});

// ============================================================
// PAYMENT STATUS NORMALIZATION (Prompt 12 §3)
// ============================================================

function makePaymentDTO(overrides: Partial<PiPaymentDTO> = {}): PiPaymentDTO {
  return {
    identifier: "test-payment-id",
    user_uid: "test-uid",
    amount: 1,
    memo: "test",
    metadata: {},
    to_address: "addr",
    created_at: new Date().toISOString(),
    network: "pi_testnet",
    status: {
      developer_approved: false,
      transaction_verified: false,
      developer_completed: false,
      canceled: false,
      user_cancelled: false,
    },
    ...overrides,
  };
}

describe("Payment Status Normalization (Prompt 12 §3)", () => {
  it("returns 'pending' for a fresh payment (no flags set)", () => {
    const dto = makePaymentDTO();
    expect(normalizePaymentStatus(dto)).toBe("pending");
  });

  it("returns 'developer_approved' when developer_approved=true", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, developer_approved: true },
    });
    expect(normalizePaymentStatus(dto)).toBe("developer_approved");
  });

  it("returns 'cancelled' when canceled=true", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, canceled: true },
    });
    expect(normalizePaymentStatus(dto)).toBe("cancelled");
  });

  it("returns 'cancelled' when user_cancelled=true", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, user_cancelled: true },
    });
    expect(normalizePaymentStatus(dto)).toBe("cancelled");
  });

  it("returns 'transaction_verified' when transaction_verified=true (but not completed)", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, transaction_verified: true },
    });
    expect(normalizePaymentStatus(dto)).toBe("transaction_verified");
  });

  it("returns 'completed' when developer_completed + transaction_verified", () => {
    const dto = makePaymentDTO({
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
      },
    });
    expect(normalizePaymentStatus(dto)).toBe("completed");
  });
});

// ============================================================
// IS PAYMENT FULLY VERIFIED (Prompt 12 §3, §5 — CRITICAL SAFETY)
// ============================================================

describe("isPaymentFullyVerified (Prompt 12 §3, §5 — Critical safety)", () => {
  it("returns false when developer_completed is false", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, developer_completed: false, transaction_verified: true },
    });
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(false);
  });

  it("returns false when transaction_verified is false", () => {
    const dto = makePaymentDTO({
      status: { ...makePaymentDTO().status, developer_completed: true, transaction_verified: false },
    });
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(false);
  });

  it("returns true when both flags are true AND network matches", () => {
    const dto = makePaymentDTO({
      network: "pi_testnet",
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
      },
    });
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(true);
  });

  it("CRITICAL: returns false for a testnet PaymentDTO on a mainnet server", () => {
    const dto = makePaymentDTO({
      network: "pi_testnet", // payment is on TESTNET
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
      },
    });
    // Server is on MAINNET — payment must NOT grant entitlement.
    expect(isPaymentFullyVerified(dto, "mainnet")).toBe(false);
  });

  it("CRITICAL: returns false for a mainnet PaymentDTO on a testnet server", () => {
    const dto = makePaymentDTO({
      network: "pi_mainnet", // payment is on MAINNET
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
      },
    });
    // Server is on TESTNET — payment must NOT grant entitlement.
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(false);
  });

  it("returns false when canceled=true (even if other flags set)", () => {
    const dto = makePaymentDTO({
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
        canceled: true,
      },
    });
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(false);
  });

  it("returns false when user_cancelled=true (even if other flags set)", () => {
    const dto = makePaymentDTO({
      status: {
        ...makePaymentDTO().status,
        developer_completed: true,
        transaction_verified: true,
        user_cancelled: true,
      },
    });
    expect(isPaymentFullyVerified(dto, "testnet")).toBe(false);
  });
});

// ============================================================
// PI SDK CLIENT — TypeScript compile-time check (Prompt 12 §2)
// ============================================================

describe("Pi SDK client module (Prompt 12 §2 — type check)", () => {
  it("exports the expected functions", async () => {
    const mod = await import("@/lib/pi/client");
    expect(typeof mod.usePiSdk).toBe("function");
    expect(typeof mod.usePiSession).toBe("function");
    expect(typeof mod.signInWithPi).toBe("function");
    expect(typeof mod.signOutFromPi).toBe("function");
    expect(typeof mod.startPiPayment).toBe("function");
  });

  it("exports the session cookie name and scopes", async () => {
    const mod = await import("@/lib/pi/auth");
    expect(mod.SESSION_COOKIE_NAME).toBe("mindstep.pi.session");
    expect(mod.SCOPES).toEqual(["username", "payments"]);
  });
});

// ============================================================
// ENTITLEMENT SERVICE — TypeScript compile-time check
// ============================================================

describe("Pi Entitlement Service (Prompt 12 §4 — type check)", () => {
  it("exports the expected functions", async () => {
    const mod = await import("@/lib/pi/entitlements");
    expect(typeof mod.getActiveEntitlement).toBe("function");
    expect(typeof mod.hasFeature).toBe("function");
    expect(typeof mod.grantEntitlementFromPayment).toBe("function");
    expect(typeof mod.revokeEntitlement).toBe("function");
  });
});

// ============================================================
// AUTH SERVICE — TypeScript compile-time check
// ============================================================

describe("Pi Auth Service (Prompt 12 §1 — type check)", () => {
  it("exports the expected functions", async () => {
    const mod = await import("@/lib/pi/auth");
    expect(typeof mod.authenticateWithPi).toBe("function");
    expect(typeof mod.resolveUserIdFromPiSession).toBe("function");
    expect(typeof mod.logoutSession).toBe("function");
    expect(typeof mod.getSessionInfo).toBe("function");
    expect(typeof mod.pruneExpiredSessions).toBe("function");
  });
});

// ============================================================
// PAYMENTS SERVICE — TypeScript compile-time check
// ============================================================

describe("Pi Payments Service (Prompt 12 §3 — type check)", () => {
  it("exports the expected functions", async () => {
    const mod = await import("@/lib/pi/payments");
    expect(typeof mod.createPaymentRecord).toBe("function");
    expect(typeof mod.serverApprovePayment).toBe("function");
    expect(typeof mod.serverCompletePayment).toBe("function");
    expect(typeof mod.serverCancelPayment).toBe("function");
    expect(typeof mod.getPaymentState).toBe("function");
    expect(typeof mod.getPaymentHistory).toBe("function");
    expect(typeof mod.syncPaymentFromPi).toBe("function");
  });
});
