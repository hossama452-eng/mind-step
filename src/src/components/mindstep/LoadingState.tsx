"use client";

import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
  /** Show a small number of skeleton lines, useful inside lists. */
  lines?: number;
}

/** Calm loading state — never a spinner grinding forever alone. */
export function LoadingState({ label = "Loading…", className, lines }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex flex-col gap-3", className)}
    >
      <span className="sr-only">{label}</span>
      {lines ? (
        Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-full rounded-md bg-muted/70 animate-pulse"
            aria-hidden
          />
        ))
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className="size-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin"
            aria-hidden
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
