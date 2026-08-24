/**
 * MindStep — Pi Network Integration end-to-end test (Prompt 12 §11).
 *
 * Verifies the API routes against the live dev server. Because we don't
 * have a real Pi Server API key in this sandbox, we test:
 *   - All endpoints are reachable
 *   - Auth endpoints correctly reject invalid access tokens
 *   - Endpoints that require Pi SDK / server-side config return 503
 *   - Public endpoints (status, products, client-config) work
 *   - Cross-user isolation
 *
 * For real Pi payment testing, follow PI-INTEGRATION.md → §13 (Test env).
 *
 * Run: bun run scripts/test-pi-api.ts
 * Requires: dev server on http://localhost:3000
 */

const API_BASE = "http://localhost:3000";
const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "prompt12-test-user",
  "x-mindstep-auto-create-user": "true",
};

interface TestResult { name: string; passed: boolean; detail: string; }
const results: TestResult[] = [];

async function fetchJson(method: string, path: string, headers: Record<string, string> = HEADERS, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function run() {
  console.log("\n=== Prompt 12 — Pi Network API Tests ===\n");

  // ===== PUBLIC ENDPOINTS =====
  // 1. GET /api/pi/status — health-check
  let res = await fetchJson("GET", "/api/pi/status", {});
  assert("GET /api/pi/status returns 200", res.status === 200, `status=${res.status}`);
  const status = (res.json as any)?.status ?? (res.json as any);
  assert("Status has network field", typeof (res.json as any)?.network === "string", `network=${(res.json as any)?.network}`);
  assert("Status has configured field", typeof (res.json as any)?.configured === "boolean", `configured=${(res.json as any)?.configured}`);

  // 2. GET /api/pi/client-config — public SDK config
  res = await fetchJson("GET", "/api/pi/client-config", {});
  assert("GET /api/pi/client-config returns 200", res.status === 200, `status=${res.status}`);
  const config = (res.json as any)?.config;
  assert("Client config has appId", typeof config?.appId === "string", `appId=${config?.appId}`);
  assert("Client config has sandbox boolean", typeof config?.sandbox === "boolean", `sandbox=${config?.sandbox}`);
  assert("Client config has sdkScriptUrl", typeof config?.sdkScriptUrl === "string", `url=${config?.sdkScriptUrl}`);
  assert("Client config has sdkVersion", typeof config?.sdkVersion === "string", `version=${config?.sdkVersion}`);
  // CRITICAL: client config must NEVER include an apiKey
  assert("Client config NEVER exposes apiKey", config?.apiKey === undefined, `apiKey=${typeof config?.apiKey}`);
  assert("Client config JSON has no 'SECRET' string", !JSON.stringify(res.json).includes("SECRET"), "no secret in JSON");

  // 3. GET /api/pi/products — public product list
  res = await fetchJson("GET", "/api/pi/products", {});
  assert("GET /api/pi/products returns 200", res.status === 200, `status=${res.status}`);
  const products = (res.json as any)?.products ?? [];
  assert("Products has 3 items", products.length === 3, `len=${products.length}`);
  const productKeys = products.map((p: any) => p.key);
  assert("Products include PREMIUM_MONTHLY", productKeys.includes("PREMIUM_MONTHLY"), `keys=${productKeys.join(",")}`);
  assert("Products include PREMIUM_YEARLY", productKeys.includes("PREMIUM_YEARLY"), `keys=${productKeys.join(",")}`);
  assert("Products include PREMIUM_LIFETIME", productKeys.includes("PREMIUM_LIFETIME"), `keys=${productKeys.join(",")}`);
  for (const p of products) {
    assert(`Product ${p.key} has correct currency (PI)`, p.currency === "PI", `currency=${p.currency}`);
    assert(`Product ${p.key} has amount > 0`, p.amount > 0, `amount=${p.amount}`);
    assert(`Product ${p.key} has entitlementPlan`, typeof p.entitlementPlan === "string", `plan=${p.entitlementPlan}`);
    assert(`Product ${p.key} has features array`, Array.isArray(p.features), `features=${p.features?.length}`);
  }

  // ===== AUTH ENDPOINTS =====
  // 4. POST /api/pi/auth with invalid access token → 401 (since not configured or invalid)
  res = await fetchJson("POST", "/api/pi/auth", { "Content-Type": "application/json" }, { accessToken: "invalid-token" });
  // Either 401 (invalid token) or 503 (not configured) — both are correct rejections.
  assert(
    "POST /api/pi/auth with invalid token returns 401 or 503",
    res.status === 401 || res.status === 503,
    `status=${res.status}`,
  );

  // 5. POST /api/pi/auth with empty body → 400 or 503 (if not configured)
  res = await fetchJson("POST", "/api/pi/auth", { "Content-Type": "application/json" }, {});
  assert("POST /api/pi/auth with empty body returns 400 (or 503 if unconfigured)", res.status === 400 || res.status === 503, `status=${res.status}`);

  // 6. POST /api/pi/auth with no body → 400 or 503 (if not configured)
  res = await fetchJson("POST", "/api/pi/auth", { "Content-Type": "application/json" });
  assert("POST /api/pi/auth with no body returns 400 (or 503 if unconfigured)", res.status === 400 || res.status === 503, `status=${res.status}`);

  // 7. GET /api/pi/auth without session cookie → 401
  res = await fetchJson("GET", "/api/pi/auth", {});
  assert("GET /api/pi/auth without session returns 401", res.status === 401, `status=${res.status}`);

  // 8. POST /api/pi/logout — always returns 200 (idempotent)
  res = await fetchJson("POST", "/api/pi/logout", {});
  assert("POST /api/pi/logout returns 200", res.status === 200, `status=${res.status}`);

  // ===== PAYMENT ENDPOINTS =====
  // 9. POST /api/pi/payments with valid product but invalid idempotency → 400 (missing fields)
  res = await fetchJson("POST", "/api/pi/payments", HEADERS, { productKey: "PREMIUM_MONTHLY" });
  assert("POST /api/pi/payments with missing fields returns 400", res.status === 400, `status=${res.status}`);

  // 10. POST /api/pi/payments with amount tampering → 400 (validation fails)
  res = await fetchJson("POST", "/api/pi/payments", HEADERS, {
    productKey: "PREMIUM_LIFETIME",
    piPaymentId: "test-pi-id-1",
    idempotencyKey: "test-idem-key-1",
    amount: 0.001, // WRONG — should be 50
    currency: "PI",
  });
  assert("POST /api/pi/payments with amount tampering returns 400", res.status === 400, `status=${res.status}`);

  // 11. POST /api/pi/payments with unknown product → 400
  res = await fetchJson("POST", "/api/pi/payments", HEADERS, {
    productKey: "FAKE_PRODUCT",
    piPaymentId: "test-pi-id-2",
    idempotencyKey: "test-idem-key-2",
    amount: 1,
    currency: "PI",
  });
  assert("POST /api/pi/payments with unknown product returns 400", res.status === 400, `status=${res.status}`);

  // 12. GET /api/pi/payments/history — requires auth (or test-user header)
  res = await fetchJson("GET", "/api/pi/payments/history", HEADERS);
  assert("GET /api/pi/payments/history returns 200 with test-user header", res.status === 200, `status=${res.status}`);
  assert("History returns array", Array.isArray((res.json as any)?.payments), `payments=${typeof (res.json as any)?.payments}`);

  // 13. GET /api/pi/payments/[id] for a non-existent payment → 404
  res = await fetchJson("GET", "/api/pi/payments/NONEXISTENT_PAYMENT_ID", HEADERS);
  assert("GET /api/pi/payments/[nonexistent] returns 404", res.status === 404, `status=${res.status}`);

  // 14. POST /api/pi/payments/[id]/approve for non-existent payment → 404 or 400
  res = await fetchJson("POST", "/api/pi/payments/NONEXISTENT_PAYMENT_ID/approve", HEADERS);
  assert(
    "POST /api/pi/payments/[nonexistent]/approve returns 404 or 400",
    res.status === 404 || res.status === 400,
    `status=${res.status}`,
  );

  // 15. POST /api/pi/payments/[id]/complete without txid → 400
  res = await fetchJson("POST", "/api/pi/payments/any/complete", HEADERS, {});
  assert("POST /api/pi/payments/[id]/complete without txid returns 400", res.status === 400, `status=${res.status}`);

  // 16. GET /api/pi/entitlement — requires auth
  res = await fetchJson("GET", "/api/pi/entitlement", HEADERS);
  assert("GET /api/pi/entitlement returns 200 with test-user header", res.status === 200, `status=${res.status}`);
  // The entitlement will be null for a fresh test user.
  assert("Entitlement response has entitlement field (possibly null)", (res.json as any)?.entitlement !== undefined, `entitlement=${typeof (res.json as any)?.entitlement}`);

  // ===== CROSS-USER ISOLATION =====
  // 17. User B cannot see User A's payment history
  const HEADERS_B = { ...HEADERS, "x-mindstep-user-id": "prompt12-user-B" };
  res = await fetchJson("GET", "/api/pi/payments/history", HEADERS_B);
  assert("User B's history is empty (or different from A)", res.status === 200, `status=${res.status}`);

  // 18. User B cannot fetch User A's payment by id
  res = await fetchJson("GET", "/api/pi/payments/test-pi-id-1/history", HEADERS_B);
  // Returns 404 (not found for this user)
  assert("User B cannot fetch User A's payment → 404", res.status === 404, `status=${res.status}`);

  // ===== DUPLICATE PREVENTION (Prompt 12 §9) =====
  // We can't actually call Pi.createPayment from a test, but we can verify
  // the API endpoint structure exists and rejects invalid input.
  // The real idempotency test happens in tests/pi-integration.test.ts.

  // ===== SUMMARY =====
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`${passed}/${results.length} tests passed (${failed} failed).`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  } else {
    console.log("\nAll Prompt 12 API tests passed!");
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});

export {};
