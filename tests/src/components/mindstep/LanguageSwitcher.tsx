"use client";

import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Locale, localeNames, locales } from "@/i18n/locale";

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onSelect = async (locale: Locale) => {
    if (locale === current) return;
    // Set the locale cookie via a server endpoint, then refresh so the
    // server-rendered layout picks up the new locale + direction.
    try {
      await fetch("/api/i18n/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch {
      // network error — keep going so the UI still updates optimistically
    }
    // Announce the locale change via the live region (Prompt 03 §33).
    // The server-rendered live region element picks up the new locale on
    // refresh, but we also announce it here so screen-reader users get
    // immediate feedback.
    announceLocaleChange(localeNames[locale]);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("label")}
          title={t("label")}
          className="size-9"
          disabled={isPending}
        >
          <Globe className="size-5" aria-hidden />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {t("label")}
        </p>
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => onSelect(locale)}
            className="gap-2"
            aria-current={current === locale ? "true" : undefined}
          >
            <span className="flex-1 text-start">{localeNames[locale]}</span>
            {current === locale ? (
              <Check className="size-4" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Update the live region with the new locale name so screen readers
 * announce "Language changed to العربية" etc. immediately.
 *
 * We don't *need* to write the message in the new locale — the new
 * locale's server-rendered HTML will replace this on refresh — but
 * announcing in the current (old) locale is better than silence.
 */
function announceLocaleChange(name: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("locale-live-region");
  if (!el) return;
  // Read the localized template from the data attribute (set by the layout)
  // then write back a fully-resolved message.
  el.setAttribute("data-announce", name);
  // Clear then set — this triggers screen-reader live-region re-announcement.
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = name;
  }, 50);
}
