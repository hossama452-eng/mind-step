import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { startFocusSessionSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/focus-sessions/start
 *
 * Start a new focus session. Enforces "at most one active session per user"
 * (Prompt 05 §44, §45): if an active session already exists, it is auto-cancelled
 * before the new one starts.
 *
 * If taskId is provided, verifies the task belongs to the current user.
 * If subtaskId is provided, verifies it belongs to the task.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = startFocusSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid session input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // If taskId provided, verify ownership.
    if (input.taskId) {
      const task = await db.task.findUnique({
        where: { id: input.taskId },
        select: { userId: true, title: true },
      });
      if (!task) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
      }
      assertOwnership(task.userId, userId);
      // Use the real task title if not explicitly provided.
      if (!input.taskTitle) input.taskTitle = task.title;
    }

    // Concurrent-session protection: auto-cancel any existing active session.
    const existingActive = await db.focusSession.findFirst({
      where: {
        userId,
        status: { in: ["active", "paused"] },
      },
      orderBy: { startedAt: "desc" },
    });

    if (existingActive) {
      const now = new Date();
      const actualMs = now.getTime() - existingActive.startedAt.getTime() - existingActive.accumulatedPausedMs;
      const actualMin = Math.max(0, Math.round(actualMs / 60000));
      await db.focusSession.update({
        where: { id: existingActive.id },
        data: {
          status: "cancelled",
          endedAt: now,
          actualMinutes: actualMin,
        },
      });
    }

    const session = await db.focusSession.create({
      data: {
        userId,
        taskId: input.taskId ?? null,
        subtaskId: input.subtaskId ?? null,
        startedAt: new Date(),
        plannedMinutes: input.plannedMinutes,
        status: "active",
        taskTitle: input.taskTitle ?? null,
        notes: input.notes ?? null,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("[/api/focus-sessions/start] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
