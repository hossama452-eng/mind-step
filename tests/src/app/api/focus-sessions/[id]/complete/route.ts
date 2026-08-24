import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { endFocusSessionSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/focus-sessions/[id]/complete
 *
 * Mark a session as completed. Called when the timer reaches zero
 * (Prompt 05 §14).
 *
 * The server calculates `actualMinutes` from timestamps —
 * NEVER trusts client-reported actualMinutes (Prompt 05 §48).
 *
 * If taskId is associated, updates the task's actualMinutes
 * by adding the session's actualMinutes (Prompt 05 §15).
 *
 * Does NOT automatically complete the task (Prompt 05 §15).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const parsed = endFocusSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid input.", {
        details: parsed.error.flatten(),
      });
    }

    const session = await db.focusSession.findUnique({
      where: { id },
      select: { userId: true, status: true, startedAt: true, pausedAt: true, accumulatedPausedMs: true, taskId: true, plannedMinutes: true },
    });
    if (!session) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Focus session not found.");
    }
    assertOwnership(session.userId, userId);

    if (session.status === "completed" || session.status === "cancelled") {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        "Session already ended.",
        { statusCode: 422 }
      );
    }

    // SERVER-SIDE calculation — never trust client.
    const now = new Date();
    let elapsedMs = now.getTime() - session.startedAt.getTime() - session.accumulatedPausedMs;
    if (session.pausedAt) {
      elapsedMs -= (now.getTime() - session.pausedAt.getTime());
    }
    // For completion, actualMinutes is at most plannedMinutes.
    const actualMinutes = Math.min(session.plannedMinutes, Math.max(0, Math.round(elapsedMs / 60000)));

    let finalAccumulatedPausedMs = session.accumulatedPausedMs;
    if (session.pausedAt) {
      finalAccumulatedPausedMs += now.getTime() - session.pausedAt.getTime();
    }

    const updated = await db.focusSession.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: now,
        actualMinutes,
        accumulatedPausedMs: finalAccumulatedPausedMs,
        pausedAt: null,
        notes: parsed.data.notes ?? undefined,
      },
    });

    // Update the associated task's actualMinutes.
    if (session.taskId && actualMinutes > 0) {
      const task = await db.task.findUnique({
        where: { id: session.taskId },
        select: { actualMinutes: true },
      });
      if (task) {
        await db.task.update({
          where: { id: session.taskId },
          data: { actualMinutes: (task.actualMinutes ?? 0) + actualMinutes },
        });
      }
    }

    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("[/api/focus-sessions/:id/complete] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
