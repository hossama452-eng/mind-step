"use client";

import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  /** Number of internal lines to render. Default 3. */
  lines?: number;
  /** Render an avatar-like leading circle. Default false. */
  leadingCircle?: boolean;
}

/**
 * Calm placeholder that mirrors the structure of a TaskCard / list row.
 * Used inside contextual loading states — never a full-page spinner.
 */
export function SkeletonCard({ className, lines = 3, leadingCircle = false }: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border border-border bg-card p-3",
        "flex items-start gap-3",
        className
      )}
    >
      <span className="sr-only">Loading</span>
      {leadingCircle ? (
        <div
          className="size-9 shrink-0 rounded-full bg-muted animate-pulse"
          aria-hidden
        />
      ) : null}
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-md bg-muted animate-pulse"
            style={{ width: `${[100, 80, 60][i % 3]}%` }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
