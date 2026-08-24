"use client";

import { useEffect, lazy, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { useUIStore } from "@/stores/ui-store";
import { useDialogStore } from "@/stores/dialog-store";
import { useTranslations } from "next-intl";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { SectionKey, sectionByKey } from "@/lib/navigation";
import { ComingSoonSection } from "./sections/ComingSoonSection";
import { QuickCaptureDialog } from "./dialogs/QuickCaptureDialog";
import { ICantStartDialog } from "./dialogs/ICantStartDialog";
import { ResetMyDayDialog } from "./dialogs/ResetMyDayDialog";
import { StartFocusSheet } from "./dialogs/StartFocusSheet";

// ============================================================
// LAZY-LOADED SECTIONS (code splitting — only load what's needed)
// ============================================================
// Dashboard is loaded eagerly — it's the default landing page.
import { DashboardSection } from "./sections/DashboardSection";

const TasksSection = lazy(() => import("./sections/TasksSection").then(m => ({ default: m.TasksSection })));
const ProjectsSection = lazy(() => import("./sections/ProjectsSection").then(m => ({ default: m.ProjectsSection })));
const BrainDumpSection = lazy(() => import("./sections/BrainDumpSection").then(m => ({ default: m.BrainDumpSection })));
const FocusSection = lazy(() => import("./sections/FocusSection").then(m => ({ default: m.FocusSection })));
const PlannerSection = lazy(() => import("./sections/PlannerSection").then(m => ({ default: m.PlannerSection })));
const HabitsSection = lazy(() => import("./sections/HabitsSection").then(m => ({ default: m.HabitsSection })));
const AISection = lazy(() => import("./sections/AISection").then(m => ({ default: m.AISection })));
const SettingsSection = lazy(() => import("./sections/SettingsSection").then(m => ({ default: m.SettingsSection })));
const NotificationsSection = lazy(() => import("./sections/NotificationsSection").then(m => ({ default: m.NotificationsSection })));
const FamilySection = lazy(() => import("./sections/FamilySection").then(m => ({ default: m.FamilySection })));
const ProfessionalSection = lazy(() => import("./sections/ProfessionalSection").then(m => ({ default: m.ProfessionalSection })));
const ReportsSection = lazy(() => import("./sections/ReportsSection").then(m => ({ default: m.ReportsSection })));
const PrivacySection = lazy(() => import("./sections/PrivacySection").then(m => ({ default: m.PrivacySection })));
const HelpSection = lazy(() => import("./sections/HelpSection").then(m => ({ default: m.HelpSection })));
const EnergySection = lazy(() => import("./sections/EnergySection").then(m => ({ default: m.EnergySection })));
const InsightsSection = lazy(() => import("./sections/InsightsSection").then(m => ({ default: m.InsightsSection })));
const PiAccountSection = lazy(() => import("./sections/PiAccountSection").then(m => ({ default: m.PiAccountSection })));

// ============================================================
// LAZY-LOADED DIALOG (only loaded when opened)
// ============================================================
const StartExperimentDialog = lazy(() => import("./dialogs/StartExperimentDialog").then(m => ({ default: m.StartExperimentDialog })));

// ============================================================
// SECTION FALLBACK (shown while lazy chunk loads)
// ============================================================
function SectionFallback() {
  return <LoadingState lines={4} />;
}

export function AppShell() {
  const t = useTranslations();
  const activeSection = useUIStore((s) => s.activeSection);
  const dialogState = useDialogStore();
  const openDialog = useDialogStore((s) => s.openDialog);

  // Global keyboard shortcut: press "c" anywhere (when not typing) to open Quick Capture.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in any input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
        if (target.getAttribute("role") === "combobox") return;
      }
      // Skip when a modifier is held (Cmd/Ctrl/Alt/Shift) — those are reserved.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Skip when any dialog is open (let the dialog handle ESC/Enter).
      if (dialogState.open) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        openDialog("quickCapture");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openDialog, dialogState.open]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar />

        <main
          id="main-content"
          className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 md:pb-8"
          tabIndex={-1}
        >
          <div className="mx-auto w-full max-w-5xl fade-in">
            <ErrorBoundary
              FallbackComponent={({ resetErrorBoundary }) => (
                <ErrorState
                  title={t("common.error")}
                  description={t("common.error")}
                  onRetry={resetErrorBoundary}
                />
              )}
            >
              <SectionRouter section={activeSection} />
            </ErrorBoundary>
          </div>
        </main>

        {/* Footer — sticky footer pattern, hidden on mobile (bottom nav instead) */}
        <footer className="mt-auto hidden md:block border-t border-border bg-background/60 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p className="font-medium text-foreground">{t("app.name")}</p>
          <p className="mt-1">{t("footer.tagline")}</p>
          <p className="mt-1">{t("footer.rights")}</p>
        </footer>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>

      {/* Global signature UX dialogs */}
      <QuickCaptureDialog
        open={dialogState.open === "quickCapture"}
        onOpenChange={(open) => !open && dialogState.closeDialog()}
      />
      <ICantStartDialog
        open={dialogState.open === "iCantStart"}
        onOpenChange={(open) => !open && dialogState.closeDialog()}
      />
      <ResetMyDayDialog
        open={dialogState.open === "resetMyDay"}
        onOpenChange={(open) => !open && dialogState.closeDialog()}
      />
      <StartFocusSheet
        open={dialogState.open === "startFocus"}
        onOpenChange={(open) => !open && dialogState.closeDialog()}
        initialTaskId={dialogState.payload?.initialTaskId}
      />
      <Suspense fallback={null}>
        <StartExperimentDialog
          open={dialogState.open === "startExperiment"}
          onOpenChange={(open) => !open && dialogState.closeDialog()}
          experimentType={dialogState.payload?.experimentType}
        />
      </Suspense>
    </div>
  );
}

function SectionRouter({ section }: { section: SectionKey }) {
  const meta = sectionByKey(section);
  // If the section is in NAV_SECTIONS but flagged as not-yet-implemented,
  // show a real "Coming soon" surface — never a blank page or dead link.
  if (meta && !meta.implemented) {
    return <ComingSoonSection sectionKey={section} />;
  }

  // Wrap lazy sections in Suspense with a loading fallback.
  // Dashboard is loaded eagerly — it's the landing page.
  switch (section) {
    case "dashboard":
      return <DashboardSection />;
    case "tasks":
      return <Suspense fallback={<SectionFallback />}><TasksSection /></Suspense>;
    case "projects":
      return <Suspense fallback={<SectionFallback />}><ProjectsSection /></Suspense>;
    case "brainDump":
      return <Suspense fallback={<SectionFallback />}><BrainDumpSection /></Suspense>;
    case "focus":
      return <Suspense fallback={<SectionFallback />}><FocusSection /></Suspense>;
    case "planner":
      return <Suspense fallback={<SectionFallback />}><PlannerSection /></Suspense>;
    case "habits":
      return <Suspense fallback={<SectionFallback />}><HabitsSection /></Suspense>;
    case "energy":
      return <Suspense fallback={<SectionFallback />}><EnergySection /></Suspense>;
    case "insights":
      return <Suspense fallback={<SectionFallback />}><InsightsSection /></Suspense>;
    case "piAccount":
      return <Suspense fallback={<SectionFallback />}><PiAccountSection /></Suspense>;
    case "ai":
      return <Suspense fallback={<SectionFallback />}><AISection /></Suspense>;
    case "settings":
      return <Suspense fallback={<SectionFallback />}><SettingsSection /></Suspense>;
    case "notifications":
      return <Suspense fallback={<SectionFallback />}><NotificationsSection /></Suspense>;
    case "family":
      return <Suspense fallback={<SectionFallback />}><FamilySection /></Suspense>;
    case "professional":
      return <Suspense fallback={<SectionFallback />}><ProfessionalSection /></Suspense>;
    case "reports":
      return <Suspense fallback={<SectionFallback />}><ReportsSection /></Suspense>;
    case "privacy":
      return <Suspense fallback={<SectionFallback />}><PrivacySection /></Suspense>;
    case "help":
      return <Suspense fallback={<SectionFallback />}><HelpSection /></Suspense>;
    default:
      return <ComingSoonSection sectionKey={section} />;
  }
}
