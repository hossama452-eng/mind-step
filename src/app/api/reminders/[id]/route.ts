import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { updateReminderSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/reminders/[id]
 * Update a reminder's title, remindAt, completed, or dismissed state.
 *
 * Toggling `completed` sets/clears completedAt.
 * Toggling `dismissed` sets/clears dismissedAt.
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

    const parsed = updateReminderSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid reminder input.", {
        details: parsed.error.flatten(),
      });
    }

    const existing = await db.reminder.findUnique({
      where: { id },
      select: { userId: true, completed: true, dismissed: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Reminder not found.");
    }
    assertOwnership(existing.userId, userId);

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.completed === true && !existing.completed) {
      patch.completedAt = new Date();
    } else if (parsed.data.completed === false) {
      patch.completedAt = null;
    }
    if (parsed.data.dismissed === true && !existing.dismissed) {
      patch.dismissedAt = new Date();
    } else if (parsed.data.dismissed === false) {
      patch.dismissedAt = null;
    }
    if (typeof parsed.data.remindAt === "string") {
      patch.remindAt = new Date(parsed.data.remindAt);
    }

    const reminder = await db.reminder.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({ reminder });
  } catch (err) {
    console.error("[/api/reminders/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/reminders/[id]
 * Hard-delete a reminder.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.reminder.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Reminder not found.");
    }
    assertOwnership(existing.userId, userId);

    await db.reminder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reminders/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
