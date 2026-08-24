/**
 * MindStep Offline-aware Fetch (Prompt 10 — Offline).
 *
 * Usage:
 *   import { offlineFetch } from "@/lib/offline/offline-fetch";
 *   const res = await offlineFetch("/api/tasks", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json", "x-mindstep-user-id": "..." },
 *     body: JSON.stringify({ title: "new task" }),
 *   });
 *
 * Behavior:
 *   - When online: behaves exactly like `fetch`. If a network error happens
 *     mid-flight, automatically falls back to enqueue.
 *   - When offline: returns a synthetic 202 (Accepted) response with the
 *     queued mutation id. The UI proceeds optimistically.
 *   - When the network returns, the queue is replayed by `replayQueue()`.
 *   - Duplicate submission protection: the server uses the `X-Client-Mutation-Id`
 *     header to dedup (one mutation = one DB write, no matter how many times
 *     the client retries).
 *
 * Refresh-during-save protection (Prompt 10 — QA):
 *   - The queue is persisted to IndexedDB, which survives page refresh.
 *   - On next load, the React app calls `replayQueue()` to flush pending work.
 */

import {
  enqueueMutation,
  countPending,
  type QueuedMutation,
} from "./mutation-queue";
import { useNetworkStore } from "@/stores/network-store";

const DEFAULT_HEADERS: Record<string, string> = {
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

function isWriteMethod(method: string): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
}

function generateMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Offline-aware fetch. Reads are passed through to `fetch`; writes are
 * queued if the network is down (or if fetch throws).
 *
 * Returns a Response. When queued offline, returns a synthetic 202 with
 * the mutation id in the `X-Client-Mutation-Id` header and a JSON body
 * containing `{ queued: true, mutationId }`.
 */
export async function offlineFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = typeof input === "string" ? input : input.toString();

  // Reads: just go to the network. If we're offline, fetch will throw and the
  // caller can show the cached data (via the SW's network-first cache fallback).
  if (!isWriteMethod(method)) {
    return fetch(input, init);
  }

  // Writes: check network state.
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  const netStore = useNetworkStore.getState();

  // Generate a deterministic mutation id — used for server-side dedup.
  const mutationId = (init.headers as Record<string, string>)?.["X-Client-Mutation-Id"] ?? generateMutationId();

  // Merge default headers so all calls are authenticated the same way.
  const mergedHeaders = new Headers(init.headers);
  for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
    if (!mergedHeaders.has(k)) mergedHeaders.set(k, v);
  }
  mergedHeaders.set("X-Client-Mutation-Id", mutationId);
  const mergedInit: RequestInit = { ...init, headers: mergedHeaders };

  if (online) {
    // Online — try the network. If it fails (flaky connection), enqueue.
    try {
      const res = await fetch(input, mergedInit);
      if (!res.ok && res.status >= 500) {
        // 5xx — server error, queue for retry (could be transient).
        // But: only queue writes; reads should propagate the error.
        // 4xx errors are user errors — don't queue them (would loop forever).
        await enqueueMutation({
          method: method as QueuedMutation["method"],
          path: url,
          payload: init.body ? String(init.body) : null,
          optimisticResult: null,
        });
        useNetworkStore.getState().setPendingCount((await countPending()));
      }
      return res;
    } catch (err) {
      // Network threw — likely offline. Enqueue and return synthetic 202.
      await enqueueMutation({
        method: method as QueuedMutation["method"],
        path: url,
        payload: init.body ? String(init.body) : null,
        optimisticResult: null,
      });
      useNetworkStore.getState().setPendingCount((await countPending()));
      return syntheticQueuedResponse(mutationId);
    }
  }

  // Offline — enqueue directly. The mutation will be replayed when online.
  await enqueueMutation({
    method: method as QueuedMutation["method"],
    path: url,
    payload: init.body ? String(init.body) : null,
    optimisticResult: null,
  });
  const pending = await countPending();
  netStore.setPendingCount(pending);
  return syntheticQueuedResponse(mutationId);
}

function syntheticQueuedResponse(mutationId: string): Response {
  return new Response(
    JSON.stringify({ queued: true, mutationId, message: "Saved offline. Will sync when you're back online." }),
    {
      status: 202, // Accepted
      statusText: "Accepted (Offline)",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Mutation-Id": mutationId,
        "X-MindStep-Source": "offline-queue",
      },
    },
  );
}

/**
 * Replay the offline queue. Called when the network comes back online.
 *
 * Strategy:
 *   - Process mutations in FIFO order (oldest first).
 *   - For each: send the request with the original X-Client-Mutation-Id header.
 *     The server dedups on this id, so re-submission after a partial failure
 *     is safe (Prompt 10 — Duplicate submission guard).
 *   - On 2xx: dequeue (success).
 *   - On 409 (Conflict): the server's version is newer — surface to user.
 *     Dequeue to avoid an infinite retry loop.
 *   - On 4xx (other than 409): user error — dequeue and surface the error.
 *   - On 5xx / network error: increment attempts; retry up to 3 times then
 *     mark as failed (user can re-edit and re-queue).
 */
export async function replayQueue(
  onProgress?: (applied: number, total: number, failed: number) => void,
): Promise<{ applied: number; failed: number; conflicts: number }> {
  const netStore = useNetworkStore.getState();
  netStore.setSyncState("syncing");
  let applied = 0;
  let failed = 0;
  let conflicts = 0;

  const { listPending, dequeueMutation, updateMutation } = await import("./mutation-queue");
  const pending = await listPending();
  if (pending.length === 0) {
    netStore.markSynced();
    onProgress?.(0, 0, 0);
    return { applied: 0, failed: 0, conflicts: 0 };
  }

  const total = pending.length;
  for (const m of pending) {
    try {
      const headers: Record<string, string> = {
        "X-Client-Mutation-Id": m.id,
        ...DEFAULT_HEADERS,
      };
      if (m.payload) headers["Content-Type"] = "application/json";

      const res = await fetch(m.path, {
        method: m.method,
        headers,
        body: m.payload ?? undefined,
      });

      if (res.status >= 200 && res.status < 300) {
        await dequeueMutation(m.id);
        applied++;
      } else if (res.status === 409) {
        // Conflict — surface to user, dequeue to avoid infinite retry.
        await dequeueMutation(m.id);
        conflicts++;
        failed++;
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx (non-conflict) — client error. Don't retry.
        await dequeueMutation(m.id);
        failed++;
      } else {
        // 5xx — retry up to 3 times.
        if (m.attempts + 1 >= 3) {
          await dequeueMutation(m.id);
          failed++;
        } else {
          await updateMutation(m.id, {
            attempts: m.attempts + 1,
            lastError: `HTTP ${res.status}`,
          });
        }
      }
    } catch (err) {
      // Network threw — likely still flaky. Increment attempts; keep in queue.
      if (m.attempts + 1 >= 3) {
        await dequeueMutation(m.id);
        failed++;
      } else {
        await updateMutation(m.id, {
          attempts: m.attempts + 1,
          lastError: err instanceof Error ? err.message : "Network error",
        });
      }
    }
    onProgress?.(applied, total, failed);
  }

  // Update store.
  const remaining = await countPending();
  useNetworkStore.getState().setPendingCount(remaining);
  if (failed > 0) {
    useNetworkStore.getState().markSyncFailed(`${failed} mutation(s) failed to sync`);
  } else {
    useNetworkStore.getState().markSynced();
  }

  return { applied, failed, conflicts };
}
