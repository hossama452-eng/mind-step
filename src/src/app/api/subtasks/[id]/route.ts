import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { updateSubtaskSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/subtasks/[id]
 * Update a subtask's title, done state, or position.
 *
 * The subtask must belong to the current user — verified by loading
 * the parent Task and checking its userId.
 *
 * When `done` transitions to `true`, `completedAt` is set.
 * When `done` transitions to `false`, `completedAt` is cleared.
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

    const parsed = updateSubtaskSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid subtask input.", {
        details: parsed.error.flatten(),
      });
    }

    // Load the subtask AND its parent task in one query to verify ownership.
    const existing = await db.subtask.findUnique({
      where: { id },
      select: { taskId: true, done: true, title: true, position: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Subtask not found.");
    }
    const task = await db.task.findUnique({
      where: { id: existing.taskId },
      select: { userId: true },
    });
    if (!task) {
      // Should be impossible — subtasks cascade-delete with their parent task.
      throw new AppError(ErrorCodes.NOT_FOUND, "Parent task not found.");
    }
    assertOwnership(task.userId, userId);

    const patch: Record<string, unknown> = { ...parsed.data };
    // Lifecycle: toggling `done` sets/clears completedAt.
    if (parsed.data.done === true && existing.done !== true) {
      patch.completedAt = new Date();
    } else if (parsed.data.done === false) {
      patch.completedAt = null;
    }

    const subtask = await db.subtask.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({ subtask });
  } catch (err) {
    console.error("[/api/subtasks/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/subtasks/[id]
 * Hard-delete a subtask. Ownership verified via the parent task.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.subtask.findUnique({
      where: { id },
      select: { taskId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Subtask not found.");
    }
    const task = await db.task.findUnique({
      where: { id: existing.taskId },
      select: { userId: true },
    });
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Parent task not found.");
    }
    assertOwnership(task.userId, userId);

    await db.subtask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/subtasks/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
