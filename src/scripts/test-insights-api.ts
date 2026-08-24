/**
 * Prompt 11 — Personal Insights Engine end-to-end test.
 *
 * Verifies the API against the live server:
 *   - GET /api/insights returns computed insights (descriptive, not diagnostic).
 *   - GET /api/insights/weekly-review returns a complete weekly review.
 *   - POST /api/personal-experiments starts an experiment with baseline.
 *   - PATCH /api/personal-experiments/[id]/complete captures post + delta.
 *   - PATCH /api/personal-experiments/[id]/abandon marks abandoned.
 *   - Cross-user isolation.
 *
 * Run: bun run scripts/test-insights-api.ts
 *
 * NOTE: requires the dev server running on http://localhost:3000.
 */

const API_BASE = "http://localhost:3000";
const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "prompt11-test-user",
  "x-mindstep-auto-create-user": "true",
};

interface TestResult { name: string; passed: boolean; detail: string; }
const results: TestResult[] = [];

async function fetchJson(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function run() {
  console.log("\n=== Prompt 11 — Insights API Tests ===\n");

  // ===== GET /api/insights =====
  let res = await fetchJson("GET", "/api/insights", HEADERS);
  assert("GET /api/insights returns 200", res.status === 200, `status=${res.status}`);
  const insights = (res.json as { all?: unknown[]; focus?: unknown[]; weeklyReview?: unknown }) ?? {};
  assert("Insights response has 'all' array", Array.isArray(insights.all), `typeof all=${typeof insights.all}`);
  assert("Insights response has 'focus' array", Array.isArray(insights.focus), `typeof focus=${typeof insights.focus}`);
  assert("Insights response has 'weeklyReview'", !!insights.weeklyReview, `weeklyReview=${typeof insights.weeklyReview}`);

  // Verify no diagnostic language — no "you have ADHD" in any insight body
  if (Array.isArray(insights.all)) {
    const allBodies = insights.all.map((i: any) => i.body ?? "").join(" ");
    const hasDiagnostic = /\byou have ADHD\b/i.test(allBodies) || /\byou should\b/i.test(allBodies);
    assert("Insights use cautious language (no diagnostic)", !hasDiagnostic, `allBodies length=${allBodies.length}`);
  }

  // ===== GET /api/insights/weekly-review =====
  res = await fetchJson("GET", "/api/insights/weekly-review", HEADERS);
  assert("GET /api/insights/weekly-review returns 200", res.status === 200, `status=${res.status}`);
  const review = (res.json as { review?: any })?.review;
  assert("Weekly review has 'worked' array", Array.isArray(review?.worked), `worked=${typeof review?.worked}`);
  assert("Weekly review has 'difficult' array", Array.isArray(review?.difficult), `difficult=${typeof review?.difficult}`);
  assert("Weekly review has 'changed' array", Array.isArray(review?.changed), `changed=${typeof review?.changed}`);
  assert("Weekly review has 'suggestedExperiment'", !!review?.suggestedExperiment, `suggestedExperiment=${typeof review?.suggestedExperiment}`);
  assert("Suggested experiment type is in allow-list", ["shorter_focus", "longer_focus", "morning_planning", "evening_planning", "smaller_steps", "different_reminder_timing", "earlier_breaks", "later_breaks"].includes(review?.suggestedExperiment?.type), `type=${review?.suggestedExperiment?.type}`);

  // ===== POST /api/personal-experiments =====
  res = await fetchJson("POST", "/api/personal-experiments", HEADERS, {
    type: "shorter_focus",
    title: "E2E test — shorter focus",
    hypothesis: "I think 10-min sessions will reduce overwhelm.",
  });
  assert("POST /api/personal-experiments returns 200", res.status === 200, `status=${res.status}`);
  const experiment = (res.json as { experiment?: any })?.experiment;
  assert("Experiment has ID", typeof experiment?.id === "string", `id=${experiment?.id}`);
  assert("Experiment is active", experiment?.status === "active", `status=${experiment?.status}`);
  assert("Experiment has baselineSnapshot", typeof experiment?.baselineSnapshot === "string", `baselineSnapshot=${typeof experiment?.baselineSnapshot}`);
  assert("Experiment type is shorter_focus", experiment?.type === "shorter_focus", `type=${experiment?.type}`);

  const expId = experiment?.id;

  // ===== POST with invalid type → 400 =====
  res = await fetchJson("POST", "/api/personal-experiments", HEADERS, { type: "invalid_type" });
  assert("Invalid experiment type rejected (400)", res.status === 400, `status=${res.status}`);

  // ===== POST without type → 400 =====
  res = await fetchJson("POST", "/api/personal-experiments", HEADERS, {});
  assert("Missing type rejected (400)", res.status === 400, `status=${res.status}`);

  // ===== GET /api/personal-experiments =====
  res = await fetchJson("GET", "/api/personal-experiments", HEADERS);
  assert("GET /api/personal-experiments returns 200", res.status === 200, `status=${res.status}`);
  const list = (res.json as { experiments?: any[] })?.experiments ?? [];
  assert("List includes the new experiment", list.some((e: any) => e.id === expId), `len=${list.length}`);

  // ===== PATCH /api/personal-experiments/[id]/complete =====
  if (expId) {
    res = await fetchJson("PATCH", `/api/personal-experiments/${expId}/complete`, HEADERS);
    assert("PATCH /complete returns 200", res.status === 200, `status=${res.status}`);
    const result = (res.json as any) ?? {};
    assert("Completed experiment has status=completed", result.experiment?.status === "completed", `status=${result.experiment?.status}`);
    assert("Completed experiment has postSnapshot", typeof result.experiment?.postSnapshot === "string", `postSnapshot=${typeof result.experiment?.postSnapshot}`);
    assert("Completed experiment has delta", typeof result.experiment?.delta === "string", `delta=${typeof result.experiment?.delta}`);
    assert("Response has description (localized)", typeof result.description === "string" && result.description.length > 10, `descLen=${result.description?.length}`);

    // ===== Cannot complete twice =====
    res = await fetchJson("PATCH", `/api/personal-experiments/${expId}/complete`, HEADERS);
    assert("Cannot complete an already-completed experiment (422)", res.status === 422, `status=${res.status}`);
  }

  // ===== Start another + abandon =====
  res = await fetchJson("POST", "/api/personal-experiments", HEADERS, { type: "morning_planning" });
  const exp2 = (res.json as { experiment?: any })?.experiment;
  if (exp2?.id) {
    res = await fetchJson("PATCH", `/api/personal-experiments/${exp2.id}/abandon`, HEADERS);
    assert("PATCH /abandon returns 200", res.status === 200, `status=${res.status}`);
    const abandoned = (res.json as { experiment?: any })?.experiment;
    assert("Abandoned experiment has status=abandoned", abandoned?.status === "abandoned", `status=${abandoned?.status}`);
  }

  // ===== Cross-user isolation =====
  if (expId) {
    const HEADERS_B = { ...HEADERS, "x-mindstep-user-id": "prompt11-user-B" };
    res = await fetchJson("PATCH", `/api/personal-experiments/${expId}/complete`, HEADERS_B);
    assert("User B cannot complete User A's experiment (404)", res.status === 404, `status=${res.status}`);

    res = await fetchJson("GET", `/api/personal-experiments`, HEADERS_B);
    const listB = (res.json as { experiments?: any[] })?.experiments ?? [];
    assert("User B doesn't see User A's experiments", !listB.some((e: any) => e.id === expId), `lenB=${listB.length}`);
  }

  // ===== Dismiss an insight =====
  // Get a deterministic insight id (the format is prompt11-<userId>-<insightId>).
  res = await fetchJson("GET", "/api/insights", HEADERS);
  const allInsights = (res.json as { all?: Array<{ id: string }> })?.all ?? [];
  if (allInsights.length > 0) {
    const firstId = allInsights[0].id;
    const dbId = `prompt11-prompt11-test-user-${firstId}`;
    res = await fetchJson("PATCH", `/api/insights?id=${encodeURIComponent(dbId)}&action=dismiss`, HEADERS);
    assert("PATCH /api/insights?id=...&action=dismiss returns 200", res.status === 200, `status=${res.status}`);
  }

  // ===== Summary =====
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`${passed}/${results.length} tests passed (${failed} failed).`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  } else {
    console.log("\nAll Prompt 11 API tests passed!");
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});

export {};
