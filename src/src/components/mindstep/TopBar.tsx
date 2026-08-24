"use client";

import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useDialogStore } from "@/stores/dialog-store";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function TopBar() {
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const openDialog = useDialogStore((s) => s.openDialog);
  const t = useTranslations();
  const tAccessibility = useTranslations("accessibility");
  const tQuickCapture = useTranslations("signature.quickCapture");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-4 md:h-16">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 md:hidden"
        aria-label={tAccessibility("openNavigation")}
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu className="size-5" aria-hidden />
      </Button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium tracking-tight text-foreground truncate">
          {t("app.name")}
        </p>
        <p className="text-xs text-muted-foreground truncate hidden sm:block">
          {t("app.tagline")}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={tQuickCapture("title")}
          title={tQuickCapture("shortcut")}
          onClick={() => openDialog("quickCapture")}
        >
          <Plus className="size-5" aria-hidden />
        </Button>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
