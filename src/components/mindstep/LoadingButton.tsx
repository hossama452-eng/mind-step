"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonProps = React.ComponentProps<typeof Button>;

interface LoadingButtonProps extends ButtonProps {
  /** When true, disables the button and renders a spinner. */
  loading?: boolean;
  /** Override the spinner icon. */
  loadingIcon?: React.ReactNode;
  /** Optional override label announced while loading. */
  loadingLabel?: string;
}

/**
 * Premium button with loading state.
 * - Reuses the shadcn Button — never creates a parallel button system.
 * - Adds a spinner that respects reduced-motion (via .reduce-motion class).
 * - Accessible: announces "loading" to screen readers and disables interaction.
 */
export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton(
    { loading = false, loadingIcon, loadingLabel = "Loading", disabled, children, ...props },
    ref
  ) {
    return (
      <Button
        ref={ref}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
        className={cn(props.className)}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            {loadingIcon ?? <Loader2 className="size-4 animate-spin" aria-hidden />}
            <span className="sr-only">{loadingLabel}</span>
          </span>
        ) : null}
        {children}
      </Button>
    );
  }
);
