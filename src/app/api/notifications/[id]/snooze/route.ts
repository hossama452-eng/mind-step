import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snoozeNotification, SNOOZE_PRESETS, type SnoozePreset } from "@/lib/notifications/notification-service";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/notifications/[id]/snooze
 * Snooze a notification. Hard-caps at maxSnoozeCount (default 3) — see
 * Prompt 10 — Smart Reminders.
 * Body: { duration: "10min" | "30min" | "1hour" | "tomorrow" | number (ms) }
 */
const snoozeSchema = z.object({
  duration: z.union([z.enum(["10min", "30min", "1hour", "tomorrow"]), z.number().int().positive()]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const body = await req.json();
    const parsed = snoozeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid duration.", { statusCode: 400, details: parsed.error.flatten() });
    }

    let durationMs: number;
    if (typeof parsed.data.duration === "string") {
      durationMs = SNOOZE_PRESETS[parsed.data.duration as SnoozePreset];
      if (parsed.data.duration === "tomorrow") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        durationMs = tomorrow.getTime() - Date.now();
        if (durationMs < 0) durationMs = 24 * 60 * 60 * 1000;
      }
    } else {
      durationMs = parsed.data.duration;
    }

    const result = await snoozeNotification(userId, id, durationMs);
    if (!result.ok) {
      if (result.capped) {
        // Not an error per se — return a 409 so the client can prompt the user
        // to choose Reschedule or Complete instead.
        return NextResponse.json({
          ok: false,
          capped: true,
          message: "Max snoozes reached. Try rescheduling or completing instead.",
          currentCount: result.currentCount,
        }, { status: 409 });
      }
      throw new AppError(ErrorCodes.NOT_FOUND, "Notification not found.");
    }

    // Side-effect: also snooze the underlying Reminder if applicable.
    const notif = await db.notification.findUnique({
      where: { id },
      select: { entityType: true, entityId: true },
    });
    if (notif?.entityType === "reminder" && notif.entityId) {
      await db.reminder.updateMany({
        where: { id: notif.entityId, userId },
        data: {
          snoozedUntil: result.notification?.snoozedUntil,
          snoozedCount: { increment: 1 },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      snoozedUntil: result.notification?.snoozedUntil,
      snoozedCount: result.currentCount,
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
