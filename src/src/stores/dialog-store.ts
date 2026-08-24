"use client";

import { create } from "zustand";

export type DialogKey =
  | "iCantStart"
  | "resetMyDay"
  | "startFocus"
  | "quickCapture"
  | "startExperiment"
  | null;

interface DialogState {
  open: DialogKey;
  /** Optional payload — e.g., a pre-selected task ID for StartFocus. */
  payload?: { initialTaskId?: string | null; experimentType?: string | null };
  openDialog: (key: Exclude<DialogKey, null>, payload?: { initialTaskId?: string | null; experimentType?: string | null }) => void;
  closeDialog: () => void;
}

/**
 * Central dialog manager. Components anywhere in the app can call
 * `useDialogStore.getState().openDialog("quickCapture")` to launch a
 * signature-UX dialog without drilling handlers through props.
 */
export const useDialogStore = create<DialogState>()((set) => ({
  open: null,
  payload: undefined,
  openDialog: (key, payload) => set({ open: key, payload: payload ?? {} }),
  closeDialog: () => set({ open: null, payload: undefined }),
}));
