"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, Sparkles } from "lucide-react";

interface ComingSoonProps {
  sectionKey: string;
  /** Friendly description, already localized by the caller. */
  description?: string;
}

export function ComingSoonSection({ sectionKey, description }: ComingSoonProps) {
  const t = useTranslations();
  const tComingSoon = useTranslations("comingSoon");
  const sectionLabel = t(`nav.${sectionKey}` as never) as string;
  // The `comingSoon.title` template expects a {name} placeholder.
  const title = tComingSoon("title", { name: sectionLabel }) as string;

  return (
    <div className="space-y-6">
      <SectionHeader title={sectionLabel} description={description} />

      <Card className="border-dashed border-border bg-muted/30">
        <CardHeader className="items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="size-8" aria-hidden />
          </div>
          <CardTitle className="mt-2 text-base">{title}</CardTitle>
          <CardDescription className="mx-auto max-w-md text-xs text-muted-foreground">
            {tComingSoon("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" aria-hidden />
            <span>{tComingSoon("badge")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
