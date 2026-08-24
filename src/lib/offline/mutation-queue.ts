/**
 * MindStep Offline Mutation Queue (Prompt 10 — Offline).
 *
 * Architecture:
 *   - When the user creates/edits/deletes data offline, the client wraps the
 *     request in a `clientMutationId` (UUID) and queues it in IndexedDB.
 *   - When the network returns, the queue is replayed one-by-one to the server.
 *   - The server uses `clientMutationId` to dedup (idempotency) so duplicate
 *     submissions are safe.
 *   - Conflict handling: the server returns 409 for stale versions, the
 *     client surfaces the conflict to the user (never silent data loss).
 *
 * Why not the Cache API? The Cache API is for read responses, not writes.
 * IndexedDB gives us durable cross-reload storage for pending writes.
 *
 * Why not localStorage? localStorage has a 5MB cap and is synchronous;
 * IndexedDB scales and is async, suited for potentially large queues.
 */

const DB_NAME = "mindstep-offline";
const DB_VERSION = 1;
const STORE = "mutations";

export interface QueuedMutation {
  id: string; // clientMutationId — UUID
  method: "POST" | "PATCH" | "DELETE" | "PUT";
  path: string; // e.g. "/api/tasks"
  payload: string | null; // JSON-stringified body, null for DELETE
  // For optimistic concurrency — the client's view of the resource version
  // at queue time. The server can reject with 409 if it changed since.
  ifMatchVersion?: string;
  // Local timestamps for ordering and retries
  queuedAt: number; // epoch ms
  attempts: number;
  lastError?: string;
  // The client-side optimistic result — what the UI assumed would happen.
  // Stored so we can roll back if the server rejects.
  optimisticResult: string | null; // JSON
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("byQueuedAt", "queuedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/**
 * Enqueue a mutation. Called by `offlineFetch()` when the network is down.
 * Returns the queued mutation (with the generated id).
 */
export async function enqueueMutation(m: Omit<QueuedMutation, "id" | "queuedAt" | "attempts">): Promise<QueuedMutation> {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const full: QueuedMutation = { ...m, id, queuedAt: Date.now(), attempts: 0 };
  await tx("readwrite", (store) => store.add(full));
  return full;
}

/**
 * List all pending mutations in queue order (oldest first).
 */
export async function listPending(): Promise<QueuedMutation[]> {
  try {
    const all = await tx<QueuedMutation[]>("readonly", (store) => store.getAll());
    return all.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
}

/**
 * Count pending mutations (cheap — uses `count()`).
 */
export async function countPending(): Promise<number> {
  try {
    return await tx<number>("readonly", (store) => store.count());
  } catch {
    return 0;
  }
}

/**
 * Remove a mutation from the queue (after successful apply or user discard).
 */
export async function dequeueMutation(id: string): Promise<void> {
  try {
    await tx("readwrite", (store) => store.delete(id));
  } catch {
    // Ignore — queue is best-effort.
  }
}

/**
 * Update a mutation in place (e.g. increment attempts, set lastError).
 */
export async function updateMutation(id: string, patch: Partial<QueuedMutation>): Promise<void> {
  try {
    const existing = await tx<QueuedMutation>("readonly", (store) => store.get(id));
    if (!existing) return;
    await tx("readwrite", (store) => store.put({ ...existing, ...patch }));
  } catch {
    // Ignore.
  }
}

/**
 * Clear the entire queue. Called when the user chooses "discard all"
 * from the sync-failed UI.
 */
export async function clearQueue(): Promise<number> {
  try {
    await tx<undefined>("readwrite", (store) => store.clear());
    return 1;
  } catch {
    return 0;
  }
}
