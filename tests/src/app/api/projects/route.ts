import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * List the current user's projects, ordered by position then createdAt.
 * Active projects come first; archived/completed are returned but the
 * client can filter.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const projects = await db.project.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { tasks: true, milestones: true } },
      },
    });

    // For each project, compute real progress from task data
    // (Prompt 04 §21). We use a single batched query rather than N+1s.
    const projectIds = projects.map((p) => p.id);
    const taskStats = await db.task.groupBy({
      by: ["projectId", "status"],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    });

    const projectsWithStats = projects.map((project) => {
      const statsForProject = taskStats.filter((s) => s.projectId === project.id);
      const total = statsForProject.reduce((sum, s) => sum + s._count._all, 0);
      const completed = statsForProject
        .filter((s) => s.status === "completed")
        .reduce((sum, s) => sum + s._count._all, 0);
      // Archived tasks don't count toward progress.
      const archived = statsForProject
        .filter((s) => s.status === "archived")
        .reduce((sum, s) => sum + s._count._all, 0);
      const effectiveTotal = total - archived;
      const progress = effectiveTotal === 0 ? 0 : completed / effectiveTotal;

      return {
        ...project,
        stats: {
          totalTasks: total,
          completedTasks: completed,
          archivedTasks: archived,
          progress, // 0..1
          activeTasks: effectiveTotal - completed,
          milestoneCount: project._count.milestones,
        },
      };
    });

    return NextResponse.json({ projects: projectsWithStats });
  } catch (err) {
    console.error("[/api/projects GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/projects
 * Create a new project owned by the current user.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid project input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // Auto-position: count existing projects for this user.
    const existingCount = await db.project.count({ where: { userId } });

    const project = await db.project.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        color: input.color,
        position: existingCount,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("[/api/projects POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
