"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0..1 — fraction completed. */
  value: number;
  /** Diameter in px. Default 80. */
  size?: number;
  /** Stroke width in px. Default 8. */
  strokeWidth?: number;
  /** Render a label centered in the ring. */
  label?: React.ReactNode;
  /** Accessible label describing what the progress represents. */
  ariaLabel?: string;
  className?: string;
  /** Optional gradient or solid color override; defaults to var(--primary). */
  color?: "primary" | "warning" | "info" | "success";
}

const COLOR_VARS: Record<NonNullable<ProgressRingProps["color"]>, string> = {
  primary: "var(--primary)",
  warning: "var(--warning)",
  info: "var(--info)",
  success: "var(--success)",
};

/**
 * Lightweight SVG circular progress indicator.
 * Premium, calm, accessible. Used by FocusCard, dashboard progress, habits.
 *
 * The ring is decorative — the numeric value is announced to screen readers
 * via an sr-only text node.
 */
export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 8,
  label,
  ariaLabel,
  className,
  color = "primary",
}: ProgressRingProps) {
  const safe = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safe);
  const trackVar = "color-mix(in oklch, var(--muted-foreground) 30%, transparent)";
  const strokeVar = COLOR_VARS[color];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackVar}
          strokeWidth={strokeWidth}
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeVar}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      {label != null ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {label}
        </div>
      ) : null}
      {/* sr-only numeric for screen readers */}
      <span className="sr-only">
        {Math.round(safe * 100)}%
      </span>
    </div>
  );
}
