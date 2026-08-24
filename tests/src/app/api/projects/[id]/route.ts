import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { updateProjectSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]
 * Fetch a single project with milestones, task stats, and tasks list.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
          include: {
            _count: { select: { tasks: true } },
          },
        },
        tasks: {
          where: { status: { not: "archived" } },
          orderBy: [{ status: "asc" }, { priority: "asc" }, { dueAt: "asc" }],
          include: {
            subtasks: { orderBy: { position: "asc" }, select: { id: true, title: true, done: true } },
          },
        },
      },
    });

    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
    }
    assertOwnership(project.userId, userId);

    return NextResponse.json({ project });
  } catch (err) {
    console.error("[/api/projects/:id GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]
 * Update a project's title, description, color, or status.
 *
 * Status transitions:
 *   - active → archived: sets archivedAt, no other side effects.
 *   - archived → active: clears archivedAt.
 *   - active → completed: marks project as completed.
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

    const parsed = updateProjectSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid project input.", {
        details: parsed.error.flatten(),
      });
    }

    const existing = await db.project.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
    }
    assertOwnership(existing.userId, userId);

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "archived") {
      patch.archivedAt = new Date();
    } else if (parsed.data.status === "active") {
      patch.archivedAt = null;
    }

    const project = await db.project.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({ project });
  } catch (err) {
    console.error("[/api/projects/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Hard-delete a project. Tasks belonging to the project have their
 * `projectId` set to null via onDelete: SetNull (Prisma schema).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.project.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
    }
    assertOwnership(existing.userId, userId);

    await db.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/projects/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
