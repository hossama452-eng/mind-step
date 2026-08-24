import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/focus-sessions/[id]/resume
 *
 * Resume a paused session. Adds the paused duration to `accumulatedPausedMs`
 * and clears `pausedAt`.
 *
 * If not paused, this is a no-op (idempotent).
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
      select: { userId: true, status: true, pausedAt: true, accumulatedPausedMs: true },
    });
    if (!session) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Focus session not found.");
    }
    assertOwnership(session.userId, userId);

    if (session.status === "completed" || session.status === "cancelled") {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        "Cannot resume a completed or cancelled session.",
        { statusCode: 422 }
      );
    }

    // Idempotent: if not paused, return current state.
    if (session.status === "active" || !session.pausedAt) {
      return NextResponse.json({ session });
    }

    // Calculate the paused duration and accumulate it.
    const now = new Date();
    const pausedDurationMs = now.getTime() - session.pausedAt.getTime();
    const newAccumulatedPausedMs = session.accumulatedPausedMs + pausedDurationMs;

    const updated = await db.focusSession.update({
      where: { id },
      data: {
        status: "active",
        pausedAt: null,
        accumulatedPausedMs: newAccumulatedPausedMs,
      },
    });

    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("[/api/focus-sessions/:id/resume] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
