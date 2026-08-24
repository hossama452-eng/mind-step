"use client";

import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("toggle")} className="size-9">
          <Sun
            className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
            aria-hidden
          />
          <Moon
            className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
            aria-hidden
          />
          <span className="sr-only">{t("toggle")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
          <Sun className="size-4" aria-hidden />
          <span className="flex-1">{t("light")}</span>
          {theme === "light" ? <Check className="size-4" aria-hidden /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
          <Moon className="size-4" aria-hidden />
          <span className="flex-1">{t("dark")}</span>
          {theme === "dark" ? <Check className="size-4" aria-hidden /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
          <Monitor className="size-4" aria-hidden />
          <span className="flex-1">{t("system")}</span>
          {theme === "system" ? <Check className="size-4" aria-hidden /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
