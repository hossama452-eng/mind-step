import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeNotification } from "@/lib/notifications/notification-service";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/notifications/[id]/complete
 *
 * Mark a notification as "complete" — the user has done the underlying action.
 * Side-effects (depending on entityType):
 *   - task: marks the task completed
 *   - reminder: marks the reminder completed
 *   - bill: marks the bill paid
 *   - habit: creates a habit entry for today (idempotent)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const notif = await db.notification.findUnique({
      where: { id },
      select: { userId: true, entityType: true, entityId: true, type: true },
    });
    if (!notif || notif.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Notification not found.");
    }

    // Apply the side-effect for the underlying entity.
    if (notif.entityId && notif.entityType) {
      try {
        if (notif.entityType === "task") {
          await db.task.updateMany({
            where: { id: notif.entityId, userId },
            data: { status: "completed", completedAt: new Date() },
          });
        } else if (notif.entityType === "reminder") {
          await db.reminder.updateMany({
            where: { id: notif.entityId, userId },
            data: { completed: true, completedAt: new Date() },
          });
        } else if (notif.entityType === "bill") {
          await db.bill.updateMany({
            where: { id: notif.entityId, userId },
            data: { paid: true },
          });
        } else if (notif.entityType === "habit") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          try {
            await db.habitEntry.create({
              data: { habitId: notif.entityId, userId, date: today, completed: true },
            });
          } catch {
            await db.habitEntry.updateMany({
              where: { habitId: notif.entityId, date: today },
              data: { completed: true },
            });
          }
        }
      } catch (err) {
        console.error("[notifications/[id]/complete] side-effect error:", err);
      }
    }

    const result = await completeNotification(userId, id);
    if (!result.ok) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, "Failed to complete notification.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
