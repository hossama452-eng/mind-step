"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useTranslations as useT } from "next-intl";
import { toast } from "sonner";

export function SettingsSection() {
  const t = useTranslations();
  const prefs = usePreferencesStore();
  const tSettings = useT("settings");

  const save = () => {
    // Persisted automatically by the store. We just confirm.
    toast.success(tSettings("saved"));
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={tSettings("title")} description={tSettings("subtitle")} />

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tSettings("sections.appearance")}</CardTitle>
          <CardDescription>{tSettings("sections.appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{tSettings("options.theme")}</Label>
            <RadioGroup
              value={prefs.theme}
              onValueChange={(value) => prefs.setTheme(value as "light" | "dark" | "system")}
              className="grid grid-cols-3 gap-2"
            >
              {["light", "dark", "system"].map((theme) => (
                <div key={theme}>
                  <RadioGroupItem id={`theme-${theme}`} value={theme} className="peer sr-only" />
                  <Label
                    htmlFor={`theme-${theme}`}
                    className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-card p-2 text-sm hover:bg-muted peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:text-primary"
                  >
                    {t(`theme.${theme}`)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>{tSettings("options.textScale")}</Label>
            <Select
              value={prefs.textScale}
              onValueChange={(value) => prefs.setTextScale(value as "small" | "normal" | "large" | "xlarge")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["small", "normal", "large", "xlarge"].map((scale) => (
                  <SelectItem key={scale} value={scale}>
                    {tSettings(`textScale.${scale}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">{tSettings("options.reducedMotion")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.sections.accessibilityDescription")}
              </p>
            </div>
            <Switch
              checked={prefs.reducedMotion}
              onCheckedChange={prefs.setReducedMotion}
              aria-label={tSettings("options.reducedMotion")}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">{tSettings("options.highContrast")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.sections.accessibilityDescription")}</p>
            </div>
            <Switch
              checked={prefs.highContrast}
              onCheckedChange={prefs.setHighContrast}
              aria-label={tSettings("options.highContrast")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tSettings("sections.language")}</CardTitle>
          <CardDescription>{tSettings("sections.languageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>{tSettings("options.language")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("language.label")} — use the language switcher in the top bar.
          </p>
        </CardContent>
      </Card>

      {/* Focus defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tSettings("sections.focus")}</CardTitle>
          <CardDescription>{tSettings("sections.focusDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="default-focus">{tSettings("options.focusLength")}</Label>
            <Input
              id="default-focus"
              type="number"
              min={5}
              max={180}
              value={prefs.defaultFocusMinutes}
              onChange={(e) => prefs.setDefaultFocusMinutes(Number(e.target.value) || 25)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="short-break">{tSettings("options.shortBreak")}</Label>
            <Input
              id="short-break"
              type="number"
              min={1}
              max={60}
              value={prefs.shortBreakMinutes}
              onChange={(e) => prefs.setShortBreakMinutes(Number(e.target.value) || 5)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="long-break">{tSettings("options.longBreak")}</Label>
            <Input
              id="long-break"
              type="number"
              min={5}
              max={60}
              value={prefs.longBreakMinutes}
              onChange={(e) => prefs.setLongBreakMinutes(Number(e.target.value) || 15)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications & AI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tSettings("sections.notifications")}</CardTitle>
          <CardDescription>{tSettings("sections.notificationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label>{tSettings("options.notificationsEnabled")}</Label>
            <Switch
              checked={prefs.notificationsEnabled}
              onCheckedChange={prefs.setNotificationsEnabled}
              aria-label={tSettings("options.notificationsEnabled")}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">{tSettings("options.aiCoachEnabled")}</Label>
              <p className="text-xs text-muted-foreground">{tSettings("sections.aiDescription")}</p>
            </div>
            <Switch
              checked={prefs.aiCoachEnabled}
              onCheckedChange={prefs.setAiCoachEnabled}
              aria-label={tSettings("options.aiCoachEnabled")}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save}>{t("common.save")}</Button>
      </div>
    </div>
  );
}
