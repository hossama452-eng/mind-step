import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { moveTimeBlockSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/time-blocks/[id]
 *
 * Update a time block (move, resize, change status, change type).
 *
 * If startAt changes, the endAt is adjusted to preserve plannedMinutes.
 * The time block must belong to the current user.
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

    // Use the move schema if newStartAt is provided, otherwise the update schema.
    const parsed = moveTimeBlockSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid input.", {
        details: parsed.error.flatten(),
      });
    }

    const existing = await db.timeBlock.findUnique({
      where: { id },
      select: { userId: true, plannedMinutes: true, endAt: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Time block not found.");
    }
    assertOwnership(existing.userId, userId);

    const newStart = new Date(parsed.data.newStartAt);
    const newEnd = new Date(newStart.getTime() + existing.plannedMinutes * 60000);

    const updated = await db.timeBlock.update({
      where: { id },
      data: {
        startAt: newStart,
        endAt: newEnd,
      },
    });

    return NextResponse.json({ block: updated });
  } catch (err) {
    console.error("[/api/time-blocks/:id PATCH] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/time-blocks/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.timeBlock.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Time block not found.");
    }
    assertOwnership(existing.userId, userId);

    await db.timeBlock.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/time-blocks/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
