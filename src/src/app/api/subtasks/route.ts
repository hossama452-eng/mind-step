import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { createSubtaskSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subtasks
 * Add a subtask to a task. The task must belong to the current user.
 * Position is auto-assigned to be last (highest existing position + 1).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createSubtaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid subtask input.", {
        details: parsed.error.flatten(),
      });
    }
    const { taskId, title } = parsed.data;

    // Verify the parent task exists AND belongs to the current user.
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { userId: true },
    });
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(task.userId, userId);

    // Auto-position: count existing subtasks + 1, so the new one goes last.
    const existingCount = await db.subtask.count({ where: { taskId } });
    const subtask = await db.subtask.create({
      data: {
        taskId,
        title,
        position: existingCount, // 0-indexed
      },
    });

    return NextResponse.json({ subtask }, { status: 201 });
  } catch (err) {
    console.error("[/api/subtasks POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
