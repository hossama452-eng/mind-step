import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createReminderSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reminders
 * List the current user's reminders that are not dismissed.
 * Default ordering: upcoming reminders first (soonest at top).
 *
 * Query params:
 *   - status: "upcoming" (default) | "completed" | "dismissed" | "all"
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "upcoming";

    const where: Record<string, unknown> = { userId };
    if (status === "upcoming") {
      where.dismissed = false;
      where.completed = false;
    } else if (status === "completed") {
      where.completed = true;
    } else if (status === "dismissed") {
      where.dismissed = true;
    }

    const reminders = await db.reminder.findMany({
      where,
      orderBy: [{ remindAt: "asc" }],
      take: 100,
      include: {
        task: { select: { id: true, title: true, status: true } },
      },
    });

    return NextResponse.json({ reminders });
  } catch (err) {
    console.error("[/api/reminders GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/reminders
 * Create a new reminder. If `taskId` is provided, the task must belong to
 * the current user (ownership isolation).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createReminderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid reminder input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // If a task is referenced, verify ownership.
    if (input.taskId) {
      const task = await db.task.findUnique({
        where: { id: input.taskId },
        select: { userId: true },
      });
      if (!task) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Task not found.");
      }
      if (task.userId !== userId) {
        throw new AppError(ErrorCodes.NOT_OWNER, "You can only access your own data.");
      }
    }

    const reminder = await db.reminder.create({
      data: {
        userId,
        title: input.title,
        remindAt: new Date(input.remindAt),
        taskId: input.taskId ?? null,
      },
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (err) {
    console.error("[/api/reminders POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
