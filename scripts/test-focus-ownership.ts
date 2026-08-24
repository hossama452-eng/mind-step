/**
 * Focus session ownership isolation test script.
 *
 * Verifies that User A cannot read/modify User B's focus sessions.
 */

const API_BASE = "http://localhost:3000";
const HEADERS_A: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "focus-user-A",
  "x-mindstep-auto-create-user": "true",
};
const HEADERS_B: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "focus-user-B",
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
  console.log("\n=== Focus Ownership Isolation Tests ===\n");

  // ===== START SESSION (User A) =====
  let res = await fetchJson("POST", "/api/focus-sessions/start", HEADERS_A, { plannedMinutes: 5 });
  assert("User A starts a session", res.status === 201, `status=${res.status}`);
  const sessionAId = (res.json as { session?: { id?: string } }).session?.id;
  assert("Got sessionAId", typeof sessionAId === "string", `id=${sessionAId}`);

  // ===== CONCURRENT SESSION PROTECTION =====
  // User A tries to start another session — should auto-cancel the first.
  res = await fetchJson("POST", "/api/focus-sessions/start", HEADERS_A, { plannedMinutes: 10 });
  assert("User A starts a second session (auto-cancels first)", res.status === 201, `status=${res.status}`);
  const sessionA2Id = (res.json as { session?: { id?: string } }).session?.id;
  assert("Second session has a different ID", sessionA2Id !== sessionAId, `${sessionAId} vs ${sessionA2Id}`);

  // User A's active session is now sessionA2Id.
  // User B tries to pause User A's session — should fail.
  res = await fetchJson("PATCH", `/api/focus-sessions/${sessionA2Id}/pause`, HEADERS_B, {});
  assert(
    "User B cannot pause User A's session",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to end User A's session — should fail.
  res = await fetchJson("PATCH", `/api/focus-sessions/${sessionA2Id}/end`, HEADERS_B, {});
  assert(
    "User B cannot end User A's session",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to complete User A's session — should fail.
  res = await fetchJson("PATCH", `/api/focus-sessions/${sessionA2Id}/complete`, HEADERS_B, {});
  assert(
    "User B cannot complete User A's session",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to capture a distraction on User A's session — should fail.
  res = await fetchJson("POST", `/api/focus-sessions/${sessionA2Id}/distraction`, HEADERS_B, { content: "hijack" });
  assert(
    "User B cannot capture distraction on User A's session",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B's active session should be null (they don't have one).
  res = await fetchJson("GET", "/api/focus-sessions/active", HEADERS_B);
  assert(
    "User B's active session is null",
    (res.json as { session: unknown }).session === null,
    `session=${JSON.stringify((res.json as { session: unknown }).session)?.slice(0, 50)}`
  );

  // User B cannot see User A's history.
  res = await fetchJson("GET", "/api/focus-sessions/history?range=today", HEADERS_B);
  const bHistory = (res.json as { sessions?: unknown[] }).sessions ?? [];
  assert(
    "User B's history does not leak User A's sessions",
    !bHistory.find((s: any) => s.id === sessionA2Id),
    `sessions count=${bHistory.length}`
  );

  // User B cannot see User A's stats.
  res = await fetchJson("GET", "/api/focus-sessions/stats", HEADERS_B);
  const bStats = (res.json as { totalSessions: number });
  assert(
    "User B's stats are zero (no sessions)",
    bStats.totalSessions === 0,
    `totalSessions=${bStats.totalSessions}`
  );

  // User A can access their own active session.
  res = await fetchJson("GET", "/api/focus-sessions/active", HEADERS_A);
  assert(
    "User A can read their own active session",
    res.status === 200 && (res.json as { session: { id?: string } }).session?.id === sessionA2Id,
    `status=${res.status}`
  );

  // Clean up: end User A's session.
  await fetchJson("PATCH", `/api/focus-sessions/${sessionA2Id}/end`, HEADERS_A, {});

  // ===== SUMMARY =====
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    console.log("FAILED:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});

export {};
