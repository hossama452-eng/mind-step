/**
 * MindStep Network Store (Prompt 10 — Network States).
 *
 * Single source of truth for:
 *   - online/offline status (online || offline)
 *   - sync state (idle | syncing | complete | failed)
 *   - pending mutation count (queue depth)
 *   - last sync timestamp
 *   - SW update availability (boolean + waiting SW ref)
 *
 * Components subscribe via `useNetworkStore()` and render the appropriate
 * banner / toast.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SyncState = "idle" | "syncing" | "complete" | "failed";

export interface NetworkState {
  online: boolean;
  syncState: SyncState;
  pendingCount: number;
  lastSyncAt: number | null; // epoch ms
  lastError: string | null;
  swUpdateAvailable: boolean;
  // SW reference is stored separately (not persisted — it's a runtime object).
  // We use a transient field that's not part of the persisted shape.
  swWaitingRef: ServiceWorker | null;

  // Actions
  setOnline: (online: boolean) => void;
  setSyncState: (state: SyncState, error?: string | null) => void;
  setPendingCount: (count: number) => void;
  markSynced: () => void;
  markSyncFailed: (error: string) => void;
  setSWUpdateAvailable: (available: boolean, sw?: ServiceWorker | null) => void;
  clearSWUpdate: () => void;
  reset: () => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      online: true,
      syncState: "idle",
      pendingCount: 0,
      lastSyncAt: null,
      lastError: null,
      swUpdateAvailable: false,
      swWaitingRef: null,

      setOnline: (online) =>
        set((s) => ({
          online,
          // When coming back online, immediately move to syncing if we have pending work.
          syncState: online && s.pendingCount > 0 ? "syncing" : s.syncState,
          lastError: online ? null : s.lastError,
        })),

      setSyncState: (syncState, error = null) =>
        set({
          syncState,
          lastError: error,
          lastSyncAt: syncState === "complete" || syncState === "failed" ? Date.now() : null,
        }),

      setPendingCount: (pendingCount) =>
        set((s) => ({
          pendingCount,
          // Auto-transition: if online with no pending and we were syncing,
          // we're complete. If offline with pending, we're waiting (idle).
          syncState: pendingCount === 0 && s.syncState === "syncing" ? "complete" : s.syncState,
        })),

      markSynced: () =>
        set({ syncState: "complete", pendingCount: 0, lastSyncAt: Date.now(), lastError: null }),

      markSyncFailed: (error) =>
        set({ syncState: "failed", lastError: error, lastSyncAt: Date.now() }),

      setSWUpdateAvailable: (swUpdateAvailable, sw = null) =>
        set({ swUpdateAvailable, swWaitingRef: sw }),

      clearSWUpdate: () =>
        set({ swUpdateAvailable: false, swWaitingRef: null }),

      reset: () =>
        set({
          online: true,
          syncState: "idle",
          pendingCount: 0,
          lastSyncAt: null,
          lastError: null,
          swUpdateAvailable: false,
          swWaitingRef: null,
        }),
    }),
    {
      name: "mindstep.network",
      // Don't persist the SW ref or transient syncState — only the durable bits.
      partialize: (state) => ({
        online: state.online,
        pendingCount: state.pendingCount,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
