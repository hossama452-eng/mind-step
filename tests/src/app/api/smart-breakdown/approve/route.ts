import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { smartBreakdownApproveSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smart-breakdown/approve
 *
 * Persist the user-approved subtask list. This is the ONLY endpoint
 * in the smart-breakdown flow that writes to the database.
 *
 * CRITICAL (Prompt 04 §39, §42, §43):
 *   - The user MUST have explicitly approved the subtask list. The client
 *     is responsible for showing the suggestions, letting the user edit /
 *     delete / reorder, and then sending the final approved list here.
 *   - This endpoint does NOT modify the parent task, project, milestone,
 *     or any other records. It ONLY creates subtasks under the given task.
 *   - The task must belong to the current user.
 *   - All subtasks are created in a single transaction.
 *   - The position of each subtask is its index in the supplied array.
 *
 * Returns the created subtasks.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = smartBreakdownApproveSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid approve input.", {
        details: parsed.error.flatten(),
      });
    }
    const { taskId, subtasks: titles } = parsed.data;

    // Verify the task exists AND belongs to the current user.
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { userId: true },
    });
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
    }
    assertOwnership(task.userId, userId);

    // Atomic creation of all approved subtasks.
    // If any subtask creation fails, the whole transaction rolls back.
    const created = await db.$transaction(
      titles.map((title, index) =>
        db.subtask.create({
          data: {
            taskId,
            title,
            position: index,
          },
          select: { id: true, title: true, done: true, position: true },
        })
      )
    );

    return NextResponse.json({ subtasks: created }, { status: 201 });
  } catch (err) {
    console.error("[/api/smart-breakdown/approve] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
