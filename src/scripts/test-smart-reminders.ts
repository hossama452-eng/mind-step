/**
 * Prompt 10 — Smart Reminder Actions end-to-end test.
 *
 * Verifies the Snooze/Reschedule/Complete/Dismiss flows against the live server.
 * Run: bun run scripts/test-smart-reminders.ts
 *
 * NOTE: requires the dev server running on http://localhost:3000.
 */

const API_BASE = "http://localhost:3000";
const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "prompt10-test-user",
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
  console.log("\n=== Prompt 10 — Smart Reminder Actions Tests ===\n");

  // 1. Create a test task with a past due date — to trigger an overdue notification.
  const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let res = await fetchJson("POST", "/api/tasks", HEADERS, {
    title: "Prompt 10 test task (overdue)",
    dueAt: pastDate,
    priority: "normal",
  });
  assert("Create overdue task", res.status === 201, `status=${res.status}`);
  const task = (res.json as { task?: { id?: string } }).task;
  const taskId = task?.id;
  assert("Got taskId", typeof taskId === "string", `id=${taskId}`);

  // 2. Run the notification scheduler — should create an overdue notification.
  res = await fetchJson("POST", "/api/notifications/schedule", HEADERS);
  assert("Scheduler runs without error", res.status === 200, `status=${res.status}`);

  // 3. List notifications — find the overdue one.
  res = await fetchJson("GET", "/api/notifications?filter=all", HEADERS);
  assert("List notifications succeeds", res.status === 200, `status=${res.status}`);
  const notifs = (res.json as { notifications?: Array<{ id?: string; type?: string; entityId?: string }> }).notifications ?? [];
  const overdueNotif = notifs.find((n) => n.type === "task_overdue" && n.entityId === taskId);
  assert("Found the overdue notification", !!overdueNotif, `notifs=${notifs.length}`);
  const notifId = overdueNotif?.id;
  assert("Got notifId", typeof notifId === "string", `id=${notifId}`);

  if (!notifId) {
    console.error("Cannot continue without a notification ID. Aborting.");
    return;
  }

  // 4. SNOOZE — snooze for 10 minutes.
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/snooze`, HEADERS, { duration: "10min" });
  assert("Snooze succeeds (200)", res.status === 200, `status=${res.status}`);
  const snoozedUntil = (res.json as { snoozedUntil?: string }).snoozedUntil;
  assert("Snooze returns snoozedUntil", !!snoozedUntil, `value=${snoozedUntil}`);

  // 5. SNOOZE again — should increment count.
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/snooze`, HEADERS, { duration: "30min" });
  assert("Second snooze succeeds", res.status === 200, `status=${res.status}`);
  const snoozedCount2 = (res.json as { snoozedCount?: number }).snoozedCount;
  assert("Snooze count is now 2", snoozedCount2 === 2, `count=${snoozedCount2}`);

  // 6. SNOOZE three more times — should hit the cap (default 3 snoozes total).
  await fetchJson("PATCH", `/api/notifications/${notifId}/snooze`, HEADERS, { duration: "1hour" });
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/snooze`, HEADERS, { duration: "1hour" });
  assert("Fourth snooze hits the cap (409)", res.status === 409, `status=${res.status}`);
  const capped = (res.json as { capped?: boolean }).capped;
  assert("Server returns capped=true", capped === true, `capped=${capped}`);

  // 7. RESCHEDULE — set a specific future time.
  const futureTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/reschedule`, HEADERS, { newTime: futureTime });
  assert("Reschedule succeeds (200)", res.status === 200, `status=${res.status}`);

  // 8. RESCHEDULE — past time should be rejected.
  const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/reschedule`, HEADERS, { newTime: pastTime });
  assert("Reschedule with past time fails (400)", res.status === 400, `status=${res.status}`);

  // 9. COMPLETE — should mark both notification and underlying task complete.
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/complete`, HEADERS);
  assert("Complete succeeds (200)", res.status === 200, `status=${res.status}`);

  // 10. Verify the task is now completed.
  res = await fetchJson("GET", `/api/tasks`, HEADERS);
  const tasks = (res.json as { tasks?: Array<{ id?: string; status?: string }> }).tasks ?? [];
  const completedTask = tasks.find((t) => t.id === taskId);
  assert("Underlying task is now completed", completedTask?.status === "completed", `status=${completedTask?.status}`);

  // 11. Cross-user isolation — User B cannot snooze User A's notification.
  const HEADERS_B = { ...HEADERS, "x-mindstep-user-id": "prompt10-user-B" };
  res = await fetchJson("PATCH", `/api/notifications/${notifId}/snooze`, HEADERS_B, { duration: "10min" });
  assert("User B cannot snooze User A's notification (404)", res.status === 404, `status=${res.status}`);

  // 12. OFFLINE SYNC endpoint — POST a sync report.
  res = await fetchJson("POST", "/api/offline/sync", HEADERS, {
    mutations: [
      { id: "test-mutation-1", method: "POST", path: "/api/tasks" },
      { id: "test-mutation-2", method: "PATCH", path: "/api/tasks/abc" },
    ],
  });
  assert("Offline sync endpoint accepts the report", res.status === 200, `status=${res.status}`);

  // 13. OFFLINE SYNC endpoint — GET returns pending (server-side queue is empty in our arch).
  res = await fetchJson("GET", "/api/offline/sync", HEADERS);
  assert("Offline sync GET succeeds", res.status === 200, `status=${res.status}`);
  const pendingCount = (res.json as { pendingCount?: number }).pendingCount;
  assert("Server pending count is 0 (client-owned queue)", pendingCount === 0, `count=${pendingCount}`);

  // 14. REMINDERS — create one and snooze/complete it.
  res = await fetchJson("POST", "/api/reminders", HEADERS, {
    title: "Prompt 10 test reminder",
    remindAt: new Date(Date.now() + 60 * 1000).toISOString(),
  });
  assert("Create reminder", res.status === 201, `status=${res.status}`);
  const reminderId = (res.json as { reminder?: { id?: string } }).reminder?.id;

  if (reminderId) {
    // Snooze reminder
    res = await fetchJson("PATCH", `/api/reminders/${reminderId}/snooze`, HEADERS, { duration: "10min" });
    assert("Reminder snooze succeeds", res.status === 200, `status=${res.status}`);

    // Reschedule reminder
    res = await fetchJson("PATCH", `/api/reminders/${reminderId}/reschedule`, HEADERS, {
      newTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    assert("Reminder reschedule succeeds", res.status === 200, `status=${res.status}`);

    // Complete reminder
    res = await fetchJson("PATCH", `/api/reminders/${reminderId}/complete`, HEADERS);
    assert("Reminder complete succeeds", res.status === 200, `status=${res.status}`);
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
    console.log("\nAll Prompt 10 tests passed!");
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});

export {};
