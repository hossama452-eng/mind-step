import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/focus-sessions/stats
 *
 * Returns real focus statistics computed from session data (Prompt 05 §30).
 *
 * Stats:
 *   - totalMinutes (sum of actualMinutes for completed sessions)
 *   - totalSessions
 *   - completedSessions
 *   - averageSessionMinutes (completed only, 0 if none)
 *   - longestSessionMinutes
 *   - byDay: [{ date, minutes, sessions }] for the last 7 days
 *   - byTask: [{ taskId, taskTitle, totalMinutes }] top 5
 *
 * Zero-data state: all zeros, empty arrays — no fabrication.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    // All completed sessions (the ones that actually contributed time).
    const sessions = await db.focusSession.findMany({
      where: {
        userId,
        status: "completed",
      },
      select: {
        id: true,
        actualMinutes: true,
        plannedMinutes: true,
        endedAt: true,
        taskId: true,
        taskTitle: true,
      },
    });

    const totalMinutes = sessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
    const totalSessions = sessions.length;
    const completedSessions = sessions.length;
    const averageSessionMinutes = totalSessions > 0
      ? Math.round(totalMinutes / totalSessions)
      : 0;
    const longestSessionMinutes = sessions.reduce(
      (max, s) => Math.max(max, s.actualMinutes ?? 0),
      0
    );

    // By day — last 7 days.
    const now = new Date();
    const byDay: Array<{ date: string; minutes: number; sessions: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const daySessions = sessions.filter((s) => {
        if (!s.endedAt) return false;
        const ts = new Date(s.endedAt);
        return ts >= day && ts < nextDay;
      });
      byDay.push({
        date: day.toISOString().slice(0, 10),
        minutes: daySessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0),
        sessions: daySessions.length,
      });
    }

    // By task — top 5.
    const taskMap = new Map<string, { taskTitle: string; totalMinutes: number }>();
    for (const s of sessions) {
      if (!s.taskId) continue;
      const existing = taskMap.get(s.taskId);
      if (existing) {
        existing.totalMinutes += s.actualMinutes ?? 0;
      } else {
        taskMap.set(s.taskId, {
          taskTitle: s.taskTitle ?? "Unknown",
          totalMinutes: s.actualMinutes ?? 0,
        });
      }
    }
    const byTask = Array.from(taskMap.entries())
      .map(([taskId, data]) => ({ taskId, ...data }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5);

    return NextResponse.json({
      totalMinutes,
      totalSessions,
      completedSessions,
      averageSessionMinutes,
      longestSessionMinutes,
      byDay,
      byTask,
    });
  } catch (err) {
    console.error("[/api/focus-sessions/stats] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
