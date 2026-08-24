import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id]
 * Fetch a single task with its subtasks, project, milestone.
 * Throws NOT_FOUND if the task doesn't exist; NOT_OWNER if it belongs to
 * another user.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const task = await db.task.findUnique({
      where: { id },
      include: {
        subtasks: { orderBy: { position: "asc" } },
        reminders: { orderBy: { remindAt: "asc" } },
        project: { select: { id: true, title: true, color: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(task.userId, userId);

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[/api/tasks/:id GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/tasks/[id]
 * Update a task. Supports status transitions (including completed/archived
 * which set the corresponding timestamp), priority, dueAt, etc.
 *
 * If `status` is set to `completed`, `completedAt` is automatically set.
 * If `status` is set to `archived`, `archivedAt` is automatically set.
 * Moving away from those states clears the timestamps.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = updateTaskSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid update input.", {
        details: parsed.error.flatten(),
      });
    }

    const existing = await db.task.findUnique({
      where: { id },
      select: { userId: true, projectId: true, milestoneId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(existing.userId, userId);

    const input = parsed.data;

    // If updating projectId, verify ownership of the new project.
    if (input.projectId !== undefined && input.projectId !== null) {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { userId: true },
      });
      if (!project) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
      }
      assertOwnership(project.userId, userId);
    }

    // If updating milestoneId, verify ownership AND project match.
    if (input.milestoneId !== undefined && input.milestoneId !== null) {
      const milestone = await db.milestone.findUnique({
        where: { id: input.milestoneId },
        select: { userId: true, projectId: true },
      });
      if (!milestone) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Milestone not found.");
      }
      assertOwnership(milestone.userId, userId);
      const effectiveProjectId = input.projectId ?? existing.projectId;
      if (effectiveProjectId && milestone.projectId !== effectiveProjectId) {
        throw new AppError(
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          "Milestone must belong to the same project.",
          { statusCode: 422 }
        );
      }
    }

    // Lifecycle timestamps.
    const patch: Record<string, unknown> = { ...input };
    const newStatus = input.status as string | undefined;
    if (newStatus === "completed") {
      patch.completedAt = new Date();
      patch.archivedAt = null;
    } else if (newStatus === "archived") {
      patch.archivedAt = new Date();
      // Don't clear completedAt — a task can be both completed and archived.
    } else if (newStatus && newStatus !== "completed" && newStatus !== "archived") {
      // Moving back to inbox/planned/in_progress — clear the lifecycle timestamps.
      patch.completedAt = null;
      patch.archivedAt = null;
    }
    // Normalize legacy status values to the new lifecycle before persisting.
    if (newStatus === "todo") patch.status = "inbox";
    if (newStatus === "done") patch.status = "completed";
    if (newStatus === "snoozed") patch.status = "planned";

    // tags → JSON string
    if (Array.isArray(input.tags)) {
      patch.tags = JSON.stringify(input.tags);
    }

    // Parse dueAt string → Date
    if (typeof input.dueAt === "string") {
      patch.dueAt = new Date(input.dueAt);
    }

    const task = await db.task.update({
      where: { id },
      data: patch,
      include: {
        subtasks: { orderBy: { position: "asc" } },
        project: { select: { id: true, title: true, color: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[/api/tasks/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]
 * Hard-delete a task and cascade-delete its subtasks and reminders.
 *
 * The task must belong to the current user.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.task.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(existing.userId, userId);

    // Subtasks cascade on the Prisma schema; reminders cascade on Reminder.taskId.
    await db.task.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tasks/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
