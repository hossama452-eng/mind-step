"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { TaskCard } from "../TaskCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressRing } from "../ProgressRing";
import { ConfirmDialog } from "../ConfirmDialog";
import { Folder, Plus, ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProjectsSection — fetches the user's projects from /api/projects,
 * shows real progress (computed from task data server-side), and
 * supports a project detail view with milestones + task creation
 * within the project.
 *
 * The Projects section is intentionally simple per Prompt 04 §17-24:
 *   - Project list with progress bars
 *   - Click a project → detail view (back button to return)
 *   - Project detail shows milestones and active/completed tasks
 *   - Add task to project directly from the detail view
 */

interface ProjectStats {
  totalTasks: number;
  completedTasks: number;
  archivedTasks: number;
  progress: number;
  activeTasks: number;
  milestoneCount: number;
}

interface Project {
  id: string;
  title: string;
  description?: string | null;
  color: string;
  status: string;
  stats: ProjectStats;
}

interface ProjectDetail extends Project {
  milestones: Array<{
    id: string;
    title: string;
    description?: string | null;
    dueAt?: string | null;
    status: string;
    _count: { tasks: number };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt?: string | null;
    subtasks: Array<{ id: string; title: string; done: boolean }>;
  }>;
}

export function ProjectsSection() {
  const t = useTranslations();
  const tProjects = useTranslations("projects");
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        headers: { "x-mindstep-user-id": "demo-user", "x-mindstep-auto-create-user": "true" },
      });
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjectDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        headers: { "x-mindstep-user-id": "demo-user", "x-mindstep-auto-create-user": "true" },
      });
      if (!res.ok) throw new Error("Failed to load project detail");
      const data = await res.json();
      setProjectDetail(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "list") {
      fetchProjects();
    } else if (view === "detail" && selectedId) {
      fetchProjectDetail(selectedId);
    }
  }, [view, selectedId, fetchProjects, fetchProjectDetail]);

  const createProject = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mindstep-user-id": "demo-user",
          "x-mindstep-auto-create-user": "true",
        },
        body: JSON.stringify({ title: trimmed, description: newDesc || null }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      setShowNewForm(false);
      setNewName("");
      setNewDesc("");
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        headers: { "x-mindstep-user-id": "demo-user" },
      });
      setDeleteId(null);
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const addTaskToProject = async () => {
    if (!projectDetail || !newTaskTitle.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mindstep-user-id": "demo-user",
        },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          projectId: projectDetail.id,
          status: "planned",
        }),
      });
      if (!res.ok) throw new Error("Failed to add task");
      setNewTaskTitle("");
      fetchProjectDetail(projectDetail.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  // ===== LIST VIEW =====
  if (view === "list") {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={tProjects("title")}
          description={tProjects("subtitle")}
          action={
            <Button size="sm" onClick={() => setShowNewForm(true)}>
              <Plus className="size-4" aria-hidden />
              <span className="ms-1">{tProjects("add")}</span>
            </Button>
          }
        />

        {showNewForm && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {tProjects("fields.name")}
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={tProjects("fields.name")}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {tProjects("fields.description")}
                </label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={tProjects("fields.description")}
                  maxLength={2000}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={createProject} disabled={!newName.trim()} size="sm">
                  {t("common.create")}
                </Button>
                <Button variant="ghost" onClick={() => setShowNewForm(false)} size="sm">
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <LoadingState lines={3} />
        ) : error ? (
          <ErrorState onRetry={fetchProjects} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<Folder className="size-6" aria-hidden />}
            title={tProjects("empty")}
            description={tProjects("subtitle")}
            action={
              <Button variant="ghost" size="sm" onClick={() => setShowNewForm(true)}>
                <Plus className="size-4" aria-hidden />
                <span className="ms-1">{tProjects("add")}</span>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent
                    className="flex items-center gap-4 p-4"
                    onClick={() => {
                      setSelectedId(project.id);
                      setView("detail");
                    }}
                  >
                    <ProgressRing
                      value={project.stats.progress}
                      size={48}
                      strokeWidth={5}
                      color="primary"
                      label={
                        <span className="text-xs font-semibold tabular-nums">
                          {Math.round(project.stats.progress * 100)}
                        </span>
                      }
                      ariaLabel={tProjects("detail.progress")}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                          aria-hidden
                        />
                        <p className="text-sm font-medium text-foreground truncate">{project.title}</p>
                      </div>
                      {project.description ? (
                        <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                      ) : null}
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{tProjects("detail.tasks")}: {project.stats.totalTasks}</span>
                        <span>{tProjects("detail.completedTasks")}: {project.stats.completedTasks}</span>
                        <span>{tProjects("detail.milestones")}: {project.stats.milestoneCount}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(project.id);
                      }}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {deleteId && (
          <ConfirmDialog
            open={!!deleteId}
            onOpenChange={(open) => !open && setDeleteId(null)}
            title={tProjects("confirmDelete.title")}
            description={tProjects("confirmDelete.description")}
            confirmLabel={tProjects("confirmDelete.confirm")}
            cancelLabel={t("common.cancel")}
            onConfirm={() => deleteProject(deleteId)}
          />
        )}
      </div>
    );
  }

  // ===== DETAIL VIEW =====
  if (view === "detail" && projectDetail) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setView("list")}>
            <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            <span className="ms-1">{t("common.back")}</span>
          </Button>
        </div>

        <SectionHeader
          title={projectDetail.title}
          description={projectDetail.description || tProjects("subtitle")}
        />

        <Card>
          <CardContent className="flex items-center gap-6 p-4">
            <ProgressRing
              value={projectDetail.stats.progress}
              size={64}
              strokeWidth={6}
              color="primary"
              label={
                <div className="text-center">
                  <p className="text-lg font-semibold tabular-nums">
                    {Math.round(projectDetail.stats.progress * 100)}%
                  </p>
                </div>
              }
              ariaLabel={tProjects("detail.progress")}
            />
            <div className="grid flex-1 grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{projectDetail.stats.totalTasks}</p>
                <p className="text-xs text-muted-foreground">{tProjects("detail.tasks")}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{projectDetail.stats.completedTasks}</p>
                <p className="text-xs text-muted-foreground">{tProjects("detail.completedTasks")}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{projectDetail.stats.activeTasks}</p>
                <p className="text-xs text-muted-foreground">{tProjects("detail.activeTasks")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Milestones */}
        {projectDetail.milestones.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">{tProjects("detail.milestones")}</h3>
            <ul className="space-y-2">
              {projectDetail.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                          milestone.status === "completed"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {milestone._count.tasks}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{milestone.title}</p>
                        {milestone.dueAt ? (
                          <p className="text-xs text-muted-foreground">
                            {new Date(milestone.dueAt).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Add task to project */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addTaskToProject();
          }}
        >
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder={tProjects("detail.addTask")}
            maxLength={200}
            className="flex-1"
          />
          <Button type="submit" disabled={!newTaskTitle.trim()} size="sm">
            <Plus className="size-4" aria-hidden />
            <span className="ms-1 hidden sm:inline">{t("tasks.add")}</span>
          </Button>
        </form>

        {/* Project tasks */}
        {projectDetail.tasks.length === 0 ? (
          <EmptyState
            title={tProjects("detail.noTasks")}
            description={tProjects("subtitle")}
          />
        ) : (
          <ul className="space-y-2">
            {projectDetail.tasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={{
                    id: task.id,
                    title: task.title,
                    priority: task.priority as "low" | "normal" | "high" | "urgent",
                    energy: "medium",
                    status: task.status as "inbox" | "planned" | "in_progress" | "completed" | "archived",
                    dueAt: task.dueAt ? new Date(task.dueAt) : null,
                    subtaskCount: task.subtasks.length,
                    subtaskDone: task.subtasks.filter((s) => s.done).length,
                  }}
                  labels={{
                    markDone: t("tasks.markDone"),
                    markUndone: t("tasks.markUndone"),
                    delete: t("common.delete"),
                    startFocus: t("tasks.startFocus"),
                    overdue: t("tasks.overdue"),
                    subtasks: () => t("tasks.subtasks"),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Loading detail view
  if (view === "detail" && loading) {
    return <LoadingState lines={4} />;
  }

  return null;
}
