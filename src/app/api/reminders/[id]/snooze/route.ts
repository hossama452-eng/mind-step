import { NextRequest, NextResponse } from "next/server";
import { snoozeReminder, SNOOZE_PRESETS, type SnoozePreset } from "@/lib/notifications/notification-service";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  duration: z.union([z.enum(["10min", "30min", "1hour", "tomorrow"]), z.number().int().positive()]),
});

/**
 * PATCH /api/reminders/[id]/snooze
 * Snooze a reminder. Hard-caps at maxSnoozeCount (default 3).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid duration.", { statusCode: 400 });
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

    const result = await snoozeReminder(userId, id, durationMs);
    if (!result.ok) {
      if (result.capped) {
        return NextResponse.json({
          ok: false,
          capped: true,
          message: "Max snoozes reached.",
        }, { status: 409 });
      }
      throw new AppError(ErrorCodes.NOT_FOUND, "Reminder not found.");
    }
    return NextResponse.json({ ok: true, snoozedUntil: result.reminder?.snoozedUntil });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
