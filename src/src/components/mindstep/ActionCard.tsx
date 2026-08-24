"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "primary" | "warning" | "info";
  className?: string;
  children?: ReactNode;
}

const variantStyles: Record<NonNullable<ActionCardProps["variant"]>, string> = {
  default: "bg-card text-card-foreground border-border",
  primary: "bg-primary/8 text-primary-foreground border-primary/30",
  warning: "bg-warning/8 border-warning/30",
  info: "bg-info/8 border-info/30",
};

export function ActionCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = "default",
  className,
  children,
}: ActionCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30",
        variantStyles[variant],
        className
      )}
    >
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="space-y-0.5">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-sm text-muted-foreground">
              {description}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>
      {children ? <CardContent className="pb-3 pt-0 text-sm">{children}</CardContent> : null}
      {actionLabel && onAction ? (
        <div className="px-6 pb-4 pt-0">
          <Button
            onClick={onAction}
            variant="ghost"
            size="sm"
            className="-ms-2 text-primary hover:bg-primary/10"
          >
            {actionLabel}
            <span aria-hidden className="rtl-flip ms-1">→</span>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
