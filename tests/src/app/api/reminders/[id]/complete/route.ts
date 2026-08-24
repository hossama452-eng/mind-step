import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeReminder } from "@/lib/notifications/notification-service";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/reminders/[id]/complete
 * Marks the reminder as completed. If the reminder is linked to a task,
 * the task is also marked completed (Prompt 10 — Smart Reminders).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const reminder = await db.reminder.findUnique({
      where: { id },
      select: { userId: true, taskId: true },
    });
    if (!reminder || reminder.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Reminder not found.");
    }
    if (reminder.taskId) {
      await db.task.updateMany({
        where: { id: reminder.taskId, userId },
        data: { status: "completed", completedAt: new Date() },
      });
    }

    const result = await completeReminder(userId, id);
    if (!result.ok) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, "Failed to complete reminder.");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
