/**
 * Ownership isolation test script.
 *
 * Verifies that User A cannot read/modify User B's tasks, projects,
 * milestones, subtasks, reminders, brain dumps.
 *
 * Run with: bun run scripts/test-ownership-isolation.ts
 */

const API_BASE = "http://localhost:3000";
const HEADERS_A = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "user-ownership-A",
  "x-mindstep-auto-create-user": "true",
};
const HEADERS_B = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "user-ownership-B",
  "x-mindstep-auto-create-user": "true",
};

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function fetchJson(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function run() {
  console.log("\n=== Ownership Isolation Tests ===\n");

  // ===== TASKS =====
  // User A creates a task
  let res = await fetchJson("POST", "/api/tasks", HEADERS_A, {
    title: "User A private task",
    priority: "high",
  });
  assert("User A creates task", res.status === 201, `status=${res.status}`);
  const taskAId = (res.json as { task?: { id?: string } }).task?.id;
  assert("Got taskAId", typeof taskAId === "string", `id=${taskAId}`);

  // User B tries to read User A's task — should get 403 or 404
  res = await fetchJson("GET", `/api/tasks/${taskAId}`, HEADERS_B);
  assert(
    "User B cannot read User A's task",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to PATCH User A's task — should fail
  res = await fetchJson("PATCH", `/api/tasks/${taskAId}`, HEADERS_B, {
    title: "Hijacked by User B",
  });
  assert(
    "User B cannot update User A's task",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to DELETE User A's task — should fail
  res = await fetchJson("DELETE", `/api/tasks/${taskAId}`, HEADERS_B);
  assert(
    "User B cannot delete User A's task",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User A reads their own task — should succeed
  res = await fetchJson("GET", `/api/tasks/${taskAId}`, HEADERS_A);
  assert("User A reads own task", res.status === 200, `status=${res.status}`);

  // ===== PROJECTS =====
  // User A creates a project
  res = await fetchJson("POST", "/api/projects", HEADERS_A, {
    title: "User A project",
    description: "Secret project",
  });
  assert("User A creates project", res.status === 201, `status=${res.status}`);
  const projectAId = (res.json as { project?: { id?: string } }).project?.id;

  // User B tries to read User A's project — should fail
  res = await fetchJson("GET", `/api/projects/${projectAId}`, HEADERS_B);
  assert(
    "User B cannot read User A's project",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to attach a task to User A's project — should fail
  res = await fetchJson("POST", "/api/tasks", HEADERS_B, {
    title: "User B task attaching to User A's project",
    projectId: projectAId,
  });
  assert(
    "User B cannot attach task to User A's project",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // ===== MILESTONES =====
  // User A creates a milestone in their project
  res = await fetchJson("POST", "/api/milestones", HEADERS_A, {
    projectId: projectAId,
    title: "User A milestone",
  });
  assert("User A creates milestone", res.status === 201, `status=${res.status}`);
  const milestoneAId = (res.json as { milestone?: { id?: string } }).milestone?.id;

  // User B tries to PATCH User A's milestone — should fail
  res = await fetchJson("PATCH", `/api/milestones/${milestoneAId}`, HEADERS_B, {
    title: "Hijacked milestone",
  });
  assert(
    "User B cannot update User A's milestone",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to create a milestone in User A's project — should fail
  res = await fetchJson("POST", "/api/milestones", HEADERS_B, {
    projectId: projectAId,
    title: "User B milestone in User A's project",
  });
  assert(
    "User B cannot attach milestone to User A's project",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // ===== SUBTASKS =====
  // User A creates a subtask on their task
  res = await fetchJson("POST", "/api/subtasks", HEADERS_A, {
    taskId: taskAId,
    title: "User A subtask",
  });
  assert("User A creates subtask", res.status === 201, `status=${res.status}`);
  const subtaskAId = (res.json as { subtask?: { id?: string } }).subtask?.id;

  // User B tries to PATCH User A's subtask — should fail
  res = await fetchJson("PATCH", `/api/subtasks/${subtaskAId}`, HEADERS_B, {
    done: true,
  });
  assert(
    "User B cannot update User A's subtask",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to DELETE User A's subtask — should fail
  res = await fetchJson("DELETE", `/api/subtasks/${subtaskAId}`, HEADERS_B);
  assert(
    "User B cannot delete User A's subtask",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // ===== BRAIN DUMPS =====
  // User A creates a brain dump
  res = await fetchJson("POST", "/api/brain-dumps", HEADERS_A, {
    content: "User A secret thought",
  });
  assert("User A creates brain dump", res.status === 201, `status=${res.status}`);
  const brainDumpAId = (res.json as { entry?: { id?: string } }).entry?.id;

  // User B tries to convert User A's brain dump — should fail
  res = await fetchJson("POST", "/api/brain-dumps/convert", HEADERS_B, {
    id: brainDumpAId,
    target: "task",
  });
  assert(
    "User B cannot convert User A's brain dump",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to DELETE User A's brain dump — should fail
  res = await fetchJson("DELETE", `/api/brain-dumps/${brainDumpAId}`, HEADERS_B);
  assert(
    "User B cannot delete User A's brain dump",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // ===== REMINDERS =====
  // User A creates a reminder
  res = await fetchJson("POST", "/api/reminders", HEADERS_A, {
    title: "User A reminder",
    remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  assert("User A creates reminder", res.status === 201, `status=${res.status}`);
  const reminderAId = (res.json as { reminder?: { id?: string } }).reminder?.id;

  // User B tries to PATCH User A's reminder — should fail
  res = await fetchJson("PATCH", `/api/reminders/${reminderAId}`, HEADERS_B, {
    completed: true,
  });
  assert(
    "User B cannot update User A's reminder",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // User B tries to DELETE User A's reminder — should fail
  res = await fetchJson("DELETE", `/api/reminders/${reminderAId}`, HEADERS_B);
  assert(
    "User B cannot delete User A's reminder",
    res.status === 403 || res.status === 404,
    `status=${res.status}`
  );

  // ===== SEARCH =====
  // User A's task should NOT appear in User B's search
  res = await fetchJson("POST", "/api/tasks/search", HEADERS_B, {
    q: "User A private task",
  });
  const searchResult = (res.json as { tasks?: Array<{ title: string }> }).tasks ?? [];
  const leaked = searchResult.find((t) => t.title.includes("User A private task"));
  assert(
    "User B search does not leak User A's tasks",
    !leaked,
    leaked ? `LEAK: found "${leaked.title}"` : "no leak"
  );

  // ===== SMART BREAKDOWN SAFETY =====
  // Suggest endpoint should NOT create any subtasks
  res = await fetchJson("POST", "/api/smart-breakdown/suggest", HEADERS_A, {
    taskTitle: "Test suggestion",
    locale: "en",
  });
  assert("Suggest endpoint returns steps", res.status === 200, `status=${res.status}`);

  // Suggest endpoint should NOT create subtasks (verify by counting subtasks before/after)
  const beforeCount = await fetchJson("GET", `/api/tasks/${taskAId}`, HEADERS_A);
  const beforeSubtasks = (beforeCount.json as { task?: { subtasks?: unknown[] } }).task?.subtasks ?? [];

  await fetchJson("POST", "/api/smart-breakdown/suggest", HEADERS_A, {
    taskTitle: "Test suggestion again",
    taskId: taskAId,
    locale: "en",
  });
  const afterCount = await fetchJson("GET", `/api/tasks/${taskAId}`, HEADERS_A);
  const afterSubtasks = (afterCount.json as { task?: { subtasks?: unknown[] } }).task?.subtasks ?? [];
  assert(
    "Suggest endpoint does NOT create subtasks",
    beforeSubtasks.length === afterSubtasks.length,
    `before=${beforeSubtasks.length}, after=${afterSubtasks.length}`
  );

  // Approve endpoint DOES create subtasks
  res = await fetchJson("POST", "/api/smart-breakdown/approve", HEADERS_A, {
    taskId: taskAId,
    subtasks: ["Step 1", "Step 2", "Step 3"],
  });
  assert("Approve endpoint creates subtasks", res.status === 201, `status=${res.status}`);

  const afterApprove = await fetchJson("GET", `/api/tasks/${taskAId}`, HEADERS_A);
  const afterApproveSubtasks = (afterApprove.json as { task?: { subtasks?: unknown[] } }).task?.subtasks ?? [];
  assert(
    "After approve, task has 3 subtasks (4 total: 1 original + 3 approved)",
    afterApproveSubtasks.length === 4,
    `length=${afterApproveSubtasks.length}`
  );

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
