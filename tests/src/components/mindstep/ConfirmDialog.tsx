"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingButton } from "./LoadingButton";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Label for the primary action button. */
  confirmLabel: string;
  /** Label for the cancel button. */
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  /** Style of the confirm button. Default destructive. */
  variant?: "default" | "destructive" | "outline";
  /** Optional long-form content rendered under the description. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reusable accessible confirmation dialog.
 *
 * - Focus trap, ESC-to-close, focus restoration — all handled by AlertDialog.
 * - Async onConfirm is supported; the action button shows a loading spinner.
 * - The cancel button is ALWAYS visible — destructive actions must be escapable.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant = "destructive",
  children,
  className,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setPending(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(className)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children ? (
          <div className="text-sm text-muted-foreground">{children}</div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={pending}
            className={cn(
              variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              variant === "outline" && "border bg-background hover:bg-accent",
              variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <LoadingButton
              asChild
              loading={pending}
              variant="ghost"
              size="sm"
              className="size-auto p-0"
            >
              <span>{confirmLabel}</span>
            </LoadingButton>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
