import type { Locale } from "@/i18n/locale";

/**
 * MindStep routing — i18n-aware.
 * The app uses a single visible Next.js route (`/`) for the foundation phase,
 * with internal client-side section navigation. The full App Router route set
 * listed below is the architectural target for subsequent phases.
 *
 * PLANNED ROUTES (Phase 2+):
 *  /                  Dashboard
 *  /dashboard         Dashboard (alias)
 *  /tasks             Tasks
 *  /projects          Projects
 *  /brain-dump        Brain Dump
 *  /focus             Focus sessions
 *  /planner           Planner
 *  /calendar          Calendar
 *  /habits            Habits
 *  /sleep             Sleep tracking
 *  /energy            Energy tracking
 *  /insights          Personal insights
 *  /ai                AI Coach
 *  /life              Life management (chores, bills, errands, etc.)
 *  /family            Family mode
 *  /professional      Professional mode
 *  /reports           Reports
 *  /settings          Settings
 *  /privacy           Privacy & data controls
 *  /help              Help & disclaimer
 *
 * Phase 1 delivers all of these as a single-page shell on `/` with the
 * section navigation managed in client state. The Prisma schema, types,
 * and i18n keys are already prepared for the multi-route Phase 2 split.
 */

export const LOCALES: Locale[] = ["en", "ar", "fr", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

export type SectionKey =
  | "dashboard"
  | "tasks"
  | "projects"
  | "brainDump"
  | "focus"
  | "planner"
  | "calendar"
  | "habits"
  | "sleep"
  | "energy"
  | "insights"
  | "ai"
  | "notifications"
  | "piAccount"
  | "life"
  | "family"
  | "professional"
  | "reports"
  | "settings"
  | "privacy"
  | "help";

export type SectionGroup =
  | "core"
  | "productivity"
  | "focus"
  | "adhdSupport"
  | "life"
  | "ai"
  | "family"
  | "professional";

export interface NavSection {
  key: SectionKey;
  group: SectionGroup;
  /** Icon name from lucide-react — mapped in the sidebar component. */
  icon: string;
  /** True if implemented as a real interactive surface in Phase 1. */
  implemented: boolean;
}

/**
 * Foundation-phase navigation. Every entry is real and navigable.
 * Future modules marked `implemented: false` route to a clean
 * "Coming soon" placeholder surface — never a dead link.
 */
export const NAV_SECTIONS: NavSection[] = [
  // CORE
  { key: "dashboard",   group: "core",         icon: "LayoutDashboard", implemented: true  },
  { key: "settings",    group: "core",         icon: "Settings",         implemented: true  },
  { key: "notifications", group: "core",      icon: "Bell",             implemented: true  },
  { key: "piAccount",  group: "core",         icon: "Coins",            implemented: true  },
  { key: "privacy",     group: "core",         icon: "Shield",           implemented: true  },
  { key: "help",        group: "core",         icon: "HelpCircle",       implemented: true  },

  // PRODUCTIVITY
  { key: "tasks",       group: "productivity",  icon: "ListTodo",         implemented: true  },
  { key: "projects",    group: "productivity",  icon: "Folder",           implemented: true  },
  { key: "brainDump",   group: "productivity",  icon: "Sparkles",         implemented: true  },
  { key: "planner",     group: "productivity",  icon: "CalendarRange",    implemented: true  },
  { key: "calendar",    group: "productivity",  icon: "Calendar",         implemented: false },

  // FOCUS
  { key: "focus",       group: "focus",         icon: "Timer",            implemented: true  },

  // ADHD SUPPORT — surfaced on the dashboard as quick-action cards.
  // They are reachable via the dashboard, not the sidebar.
  // (See src/components/mindstep/sections/DashboardSection.tsx)

  // LIFE
  { key: "habits",      group: "life",          icon: "Repeat",           implemented: true  },
  { key: "sleep",       group: "life",          icon: "Moon",             implemented: false },
  { key: "energy",      group: "life",          icon: "Battery",         implemented: true  },
  { key: "insights",    group: "life",          icon: "TrendingUp",      implemented: true  },
  { key: "life",        group: "life",          icon: "Home",             implemented: false },

  // AI
  { key: "ai",          group: "ai",            icon: "Bot",              implemented: true  },

  // FAMILY
  { key: "family",      group: "family",         icon: "Users",           implemented: true  },

  // PROFESSIONAL
  { key: "professional", group: "professional", icon: "Briefcase",       implemented: true  },
  { key: "reports",     group: "professional",  icon: "FileText",        implemented: true  },
];

export const SECTION_GROUPS: SectionGroup[] = [
  "core",
  "productivity",
  "focus",
  "life",
  "ai",
  "family",
  "professional",
];

export function sectionByKey(key: SectionKey): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.key === key);
}
