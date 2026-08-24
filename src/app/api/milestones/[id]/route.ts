import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { updateMilestoneSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/milestones/[id]
 * Fetch a single milestone with progress (computed from real task data).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const milestone = await db.milestone.findUnique({
      where: { id },
      include: {
        tasks: {
          where: { status: { not: "archived" } },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueAt: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Milestone not found.");
    }
    assertOwnership(milestone.userId, userId);

    // Real progress from task data (Prompt 04 §24).
    const total = milestone.tasks.length;
    const completed = milestone.tasks.filter((t) => t.status === "completed").length;
    const progress = total === 0 ? 0 : completed / total;

    return NextResponse.json({
      milestone: {
        ...milestone,
        stats: { total, completed, progress },
      },
    });
  } catch (err) {
    console.error("[/api/milestones/:id GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/milestones/[id]
 * Update a milestone.
 *
 * When `status` transitions to `completed`, `completedAt` is set.
 * When `status` transitions back to `active`, `completedAt` is cleared.
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

    const parsed = updateMilestoneSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid milestone input.", {
        details: parsed.error.flatten(),
      });
    }

    const existing = await db.milestone.findUnique({
      where: { id },
      select: { userId: true, projectId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Milestone not found.");
    }
    assertOwnership(existing.userId, userId);

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "completed") {
      patch.completedAt = new Date();
    } else if (parsed.data.status === "active") {
      patch.completedAt = null;
    }

    // If projectId is being changed, verify the new project belongs to the user.
    if (parsed.data.projectId !== undefined && parsed.data.projectId !== existing.projectId) {
      const project = await db.project.findUnique({
        where: { id: parsed.data.projectId },
        select: { userId: true },
      });
      if (!project) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
      }
      assertOwnership(project.userId, userId);
    }

    if (typeof parsed.data.dueAt === "string") {
      patch.dueAt = new Date(parsed.data.dueAt);
    }

    const milestone = await db.milestone.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({ milestone });
  } catch (err) {
    console.error("[/api/milestones/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/milestones/[id]
 * Hard-delete a milestone. Tasks that referenced this milestone have their
 * `milestoneId` set to null (onDelete: SetNull on the schema).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.milestone.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Milestone not found.");
    }
    assertOwnership(existing.userId, userId);

    await db.milestone.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/milestones/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
