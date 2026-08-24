"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LifeBuoy, BookOpen, HeartHandshake, Phone, ShieldAlert } from "lucide-react";

export function HelpSection() {
  const t = useTranslations();
  const tHelp = useTranslations("help");

  return (
    <div className="space-y-6">
      <SectionHeader title={t("nav.help")} description={t("app.description")} />

      {/* Crisis notice */}
      <Alert variant="default" className="border-destructive/30 bg-destructive/5">
        <ShieldAlert className="size-4 text-destructive" aria-hidden />
        <AlertTitle className="text-destructive">{tHelp("crisisTitle")}</AlertTitle>
        <AlertDescription>{tHelp("crisisBody")}</AlertDescription>
      </Alert>

      {/* Quick help cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LifeBuoy className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-base">{tHelp("gettingStarted")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {tHelp("gettingStartedDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-base">{tHelp("adhdTips")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {tHelp("adhdTipsDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HeartHandshake className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-base">{tHelp("beGentle")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {tHelp("beGentleDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Disclaimer — full text */}
      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-base">{tHelp("medicalDisclaimer")}</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {t("disclaimer.notMedical")}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="size-4" aria-hidden />
            {tHelp("contact")}
          </CardTitle>
          <CardDescription>{tHelp("contactDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>· {tHelp("bugReports")}</p>
          <p>· {tHelp("privacyEmail")}</p>
          <p>· {tHelp("securityReports")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
