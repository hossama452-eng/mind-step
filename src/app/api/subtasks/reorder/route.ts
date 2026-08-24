import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { reorderSubtasksSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subtasks/reorder
 *
 * Reorder subtasks within a task. The body is:
 *   { taskId, orderedIds: [id1, id2, id3, ...] }
 *
 * Each subtask's `position` is updated to its index in `orderedIds`.
 * The task must belong to the current user — verified server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = reorderSubtasksSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid reorder input.", {
        details: parsed.error.flatten(),
      });
    }
    const { taskId, orderedIds } = parsed.data;

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { userId: true },
    });
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(task.userId, userId);

    // Verify all the subtasks in `orderedIds` actually belong to this task.
    const subtasks = await db.subtask.findMany({
      where: { taskId },
      select: { id: true },
    });
    const validIds = new Set(subtasks.map((s) => s.id));
    for (const id of orderedIds) {
      if (!validIds.has(id)) {
        throw new AppError(
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          "Reorder list contains subtask that does not belong to this task.",
          { statusCode: 422 }
        );
      }
    }
    // If the user didn't include every subtask, that's a client error.
    if (orderedIds.length !== subtasks.length) {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        "Reorder list must include every subtask.",
        { statusCode: 422 }
      );
    }

    // Use a transaction so the reorder is atomic.
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.subtask.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ ok: true, orderedIds });
  } catch (err) {
    console.error("[/api/subtasks/reorder] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
