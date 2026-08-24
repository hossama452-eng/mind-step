"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}

/** Never let the app show a blank white screen on error. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Please try again.",
  onRetry,
  className,
  children,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {onRetry ? (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
