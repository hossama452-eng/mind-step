/**
 * MindStep — Centrally-Configured Payment Products (Prompt 12 §6).
 *
 * All paid products live here. UI screens must NOT hard-code product info —
 * they should look products up via `getProduct(key)`.
 *
 * === ADDING A NEW PRODUCT ===
 *
 *   1. Add an entry to `PRODUCTS` below.
 *   2. Add the product key to `ProductKey` type.
 *   3. Add localized display strings to src/i18n/messages/{en,ar,fr,zh}.json
 *      under `pi.products.<KEY>` (name, description).
 *   4. Run tests + verify the new product is returned by /api/pi/products.
 *
 * === ENTITLEMENT MAPPING ===
 *
 * Each product maps to an entitlement plan via `entitlementPlan`.
 * The entitlement service uses this to grant the right plan on payment
 * completion. See src/lib/pi/entitlements.ts.
 */

export const PRODUCT_KEYS = [
  "PREMIUM_MONTHLY",
  "PREMIUM_YEARLY",
  "PREMIUM_LIFETIME",
] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

export interface Product {
  key: ProductKey;
  /** Amount in Pi to charge. */
  amount: number;
  /** Currency — currently always "PI". */
  currency: "PI";
  /** Duration in days the entitlement lasts (null = lifetime). */
  durationDays: number | null;
  /** The entitlement plan this product grants. */
  entitlementPlan: "premium_monthly" | "premium_yearly" | "premium_lifetime";
  /** Memo shown to the Pioneer in the Pi payment dialog. */
  memo: string;
  /** Feature keys granted by this product. */
  features: string[];
}

// ============================================================
// PRODUCTS
// ============================================================

export const PRODUCTS: Record<ProductKey, Product> = {
  PREMIUM_MONTHLY: {
    key: "PREMIUM_MONTHLY",
    amount: 1,
    currency: "PI",
    durationDays: 30,
    entitlementPlan: "premium_monthly",
    memo: "MindStep Premium — 1 month",
    features: [
      "unlimited_focus",
      "insights_engine",
      "personal_experiments",
      "ai_coach_unlimited",
      "smart_breakdown_unlimited",
    ],
  },
  PREMIUM_YEARLY: {
    key: "PREMIUM_YEARLY",
    amount: 9,
    currency: "PI",
    durationDays: 365,
    entitlementPlan: "premium_yearly",
    memo: "MindStep Premium — 1 year",
    features: [
      "unlimited_focus",
      "insights_engine",
      "personal_experiments",
      "ai_coach_unlimited",
      "smart_breakdown_unlimited",
    ],
  },
  PREMIUM_LIFETIME: {
    key: "PREMIUM_LIFETIME",
    amount: 50,
    currency: "PI",
    durationDays: null, // lifetime
    entitlementPlan: "premium_lifetime",
    memo: "MindStep Premium — lifetime",
    features: [
      "unlimited_focus",
      "insights_engine",
      "personal_experiments",
      "ai_coach_unlimited",
      "smart_breakdown_unlimited",
      "lifetime_badge",
    ],
  },
};

// ============================================================
// LOOKUP
// ============================================================

export function getProduct(key: string): Product | null {
  if (!PRODUCT_KEYS.includes(key as ProductKey)) return null;
  return PRODUCTS[key as ProductKey] ?? null;
}

export function listProducts(): Array<Product & { id?: string; slug?: string; name?: string; description?: string; price_in_pi?: number }> {
  return [
    ...PRODUCT_KEYS.map((k) => PRODUCTS[k]),
    {
      ...PRODUCTS.PREMIUM_MONTHLY,
      id: "6a8a01b81341da196b87e016",
      slug: "mindstep",
      name: "Mindstep",
      description: "MindStep is an ADHD-focused productivity and daily life companion that helps users organize tasks, manage focus, reduce overwhelm, plan their day, and build sustainable routines with a supportive, distraction-friendly experience.",
      price_in_pi: 1,
    },
  ];
}

/**
 * Verify a Pi payment request matches a configured product exactly.
 * Used to validate the amount + currency the client wants to charge
 * against the centrally-configured value.
 *
 * This prevents a malicious client from paying 0.001 Pi for a
 * "PREMIUM_LIFETIME" by tampering with the amount.
 */
export function validateProductPayment(key: string, amount: number, currency: string): {
  valid: boolean;
  product?: Product;
  reason?: string;
} {
  const product = getProduct(key);
  if (!product) {
    return { valid: false, reason: "Unknown product" };
  }
  if (product.amount !== amount) {
    return {
      valid: false,
      reason: `Amount mismatch: expected ${product.amount}, got ${amount}`,
      product,
    };
  }
  if (product.currency !== currency) {
    return {
      valid: false,
      reason: `Currency mismatch: expected ${product.currency}, got ${currency}`,
      product,
    };
  }
  return { valid: true, product };
}
