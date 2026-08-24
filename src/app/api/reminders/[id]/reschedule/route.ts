import { NextRequest, NextResponse } from "next/server";
import { rescheduleReminder } from "@/lib/notifications/notification-service";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ newTime: z.string().datetime() });

/**
 * PATCH /api/reminders/[id]/reschedule
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid newTime.", { statusCode: 400 });
    }

    const newTime = new Date(parsed.data.newTime);
    if (newTime.getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "newTime must be in the future.", { statusCode: 400 });
    }

    const result = await rescheduleReminder(userId, id, newTime);
    if (!result.ok) throw new AppError(ErrorCodes.NOT_FOUND, "Reminder not found.");
    return NextResponse.json({ ok: true, remindAt: result.reminder?.remindAt });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
