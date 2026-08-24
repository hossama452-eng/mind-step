"use client";

import {
  LayoutDashboard,
  ListTodo,
  Folder,
  Sparkles,
  CalendarRange,
  Calendar,
  Timer,
  Repeat,
  Moon,
  Battery,
  TrendingUp,
  Home,
  Bot,
  Users,
  Briefcase,
  FileText,
  Settings,
  Shield,
  HelpCircle,
  Heart,
  X,
  ChevronsLeft,
  ChevronRight,
  Bell,
  Coins,
} from "lucide-react";
import { NAV_SECTIONS, SectionGroup, SectionKey } from "@/lib/navigation";
import { useUIStore } from "@/stores/ui-store";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const iconMap: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  LayoutDashboard,
  ListTodo,
  Folder,
  Sparkles,
  CalendarRange,
  Calendar,
  Timer,
  Repeat,
  Moon,
  Battery,
  TrendingUp,
  Home,
  Bot,
  Users,
  Briefcase,
  FileText,
  Settings,
  Shield,
  HelpCircle,
  Bell,
  Coins,
};

export function Sidebar() {
  const t = useTranslations();
  const tAccessibility = useTranslations("accessibility");
  const { activeSection, setActiveSection, mobileSidebarOpen, setMobileSidebarOpen, sidebarCollapsed, toggleSidebar } = useUIStore();

  const grouped = useMemo(() => {
    const out: Record<SectionGroup, typeof NAV_SECTIONS> = {
      core: [], productivity: [], focus: [], adhdSupport: [], life: [], ai: [], family: [], professional: [],
    };
    for (const section of NAV_SECTIONS) {
      out[section.group].push(section);
    }
    return out;
  }, []);

  const groupLabels: Record<SectionGroup, string> = {
    core: t("nav.group.core"),
    productivity: t("nav.group.productivity"),
    focus: t("nav.group.focus"),
    adhdSupport: t("nav.group.adhdSupport"),
    life: t("nav.group.life"),
    ai: t("nav.group.ai"),
    family: t("nav.group.family"),
    professional: t("nav.group.professional"),
  };

  const handleSelect = (key: SectionKey) => {
    setActiveSection(key);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
          aria-hidden
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "mindstep-sidebar fixed inset-y-0 z-50 flex flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[transform,width] duration-200",
          "start-0 md:static",
          sidebarCollapsed ? "md:w-16" : "md:w-72",
          mobileSidebarOpen ? "translate-x-0" : "mindstep-sidebar-closed"
        )}
        aria-label={t("nav.group.core")}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Heart className="size-5" aria-hidden />
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 leading-tight">
              <p className="font-semibold tracking-tight text-foreground">{t("app.name")}</p>
              <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
            </div>
          )}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="ms-auto rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            aria-label={t("common.close")}
          >
            <X className="size-5" aria-hidden />
          </button>
          <button
            onClick={toggleSidebar}
            className="ms-auto hidden rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex"
            aria-label={t("common.close")}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="size-5 rtl-flip" aria-hidden />
            ) : (
              <ChevronsLeft className="size-5 rtl-flip" aria-hidden />
            )}
          </button>
        </div>

        {/* Navigation */}
        <TooltipProvider delayDuration={200}>
          <nav
            className="flex-1 overflow-y-auto px-2 py-3 rhythm-tight"
            aria-label={tAccessibility("navigationLandmark")}
          >
            {(["core", "productivity", "focus", "life", "ai", "family", "professional"] as SectionGroup[]).map((group) => {
              const sections = grouped[group];
              if (!sections.length) return null;
              return (
                <div key={group} className="space-y-1">
                  {!sidebarCollapsed && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {groupLabels[group]}
                    </p>
                  )}
                  {sections.map((section) => {
                    const Icon = iconMap[section.icon] ?? Sparkles;
                    const active = activeSection === section.key;
                    const label = t(`nav.${section.key}`);
                    const button = (
                      <button
                        key={section.key}
                        onClick={() => handleSelect(section.key)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/12 text-primary"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          sidebarCollapsed && "md:justify-center md:px-2"
                        )}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden />
                        {!sidebarCollapsed && <span className="flex-1 text-start">{label}</span>}
                        {!sidebarCollapsed && !section.implemented && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                            soon
                          </span>
                        )}
                      </button>
                    );

                    if (sidebarCollapsed) {
                      return (
                        <Tooltip key={section.key}>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            {label}
                            {!section.implemented ? " · soon" : ""}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return button;
                  })}
                </div>
              );
            })}
          </nav>
        </TooltipProvider>

        {/* Footer note */}
        {!sidebarCollapsed && (
          <div className="border-t border-sidebar-border px-4 py-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t("disclaimer.notMedical").slice(0, 110)}…
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
