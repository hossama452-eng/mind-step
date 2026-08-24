import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planner/week
 *
 * Returns a high-level overview of the current week:
 *   - Planned workload per day
 *   - Important deadlines
 *   - Focus blocks summary
 *   - Overloaded days
 *
 * Does NOT show excessive detail (Prompt 06 §31).
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday start
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Load this week's time blocks.
    const blocks = await db.timeBlock.findMany({
      where: {
        userId,
        startAt: { gte: weekStart, lt: weekEnd },
        status: { notIn: ["cancelled"] },
      },
      orderBy: { startAt: "asc" },
    });

    // Group by day.
    const days: Array<{
      date: string;
      totalMinutes: number;
      focusMinutes: number;
      blockCount: number;
      isOverloaded: boolean;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayBlocks = blocks.filter((b) => {
        const bs = new Date(b.startAt);
        return bs >= day && bs < dayEnd;
      });

      const focusMin = dayBlocks
        .filter((b) => b.type === "focus")
        .reduce((sum, b) => sum + b.plannedMinutes, 0);

      days.push({
        date: day.toISOString().slice(0, 10),
        totalMinutes: dayBlocks.reduce((sum, b) => sum + b.plannedMinutes, 0),
        focusMinutes: focusMin,
        blockCount: dayBlocks.length,
        isOverloaded: focusMin > 240, // simple overload threshold
      });
    }

    // Load important deadlines this week.
    const deadlines = await db.task.findMany({
      where: {
        userId,
        dueAt: { gte: weekStart, lt: weekEnd },
        status: { notIn: ["completed", "archived", "done"] },
      },
      select: { id: true, title: true, dueAt: true, priority: true },
      orderBy: { dueAt: "asc" },
      take: 10,
    });

    return NextResponse.json({ days, deadlines });
  } catch (err) {
    console.error("[/api/planner/week] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
