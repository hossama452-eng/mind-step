import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/focus-sessions/[id]/pause
 *
 * Pause an active session. Sets `pausedAt` to now. The client calculates
 * remaining time from `startedAt + plannedMinutes - accumulatedPausedMs`.
 *
 * If already paused, this is a no-op (idempotent).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const session = await db.focusSession.findUnique({
      where: { id },
      select: { userId: true, status: true, pausedAt: true },
    });
    if (!session) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Focus session not found.");
    }
    assertOwnership(session.userId, userId);

    if (session.status === "completed" || session.status === "cancelled") {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        "Cannot pause a completed or cancelled session.",
        { statusCode: 422 }
      );
    }

    // Idempotent: if already paused, return current state.
    if (session.status === "paused" && session.pausedAt) {
      return NextResponse.json({ session });
    }

    const updated = await db.focusSession.update({
      where: { id },
      data: {
        status: "paused",
        pausedAt: new Date(),
      },
    });

    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("[/api/focus-sessions/:id/pause] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
