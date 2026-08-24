import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reports/generate
 *
 * Generate a report from real user activity data (Prompt 09 — Reports).
 *
 * Report types: weekly | monthly | focus | habits | energy | comprehensive
 *
 * All reports are clearly labeled as "User activity tracking data — not a medical diagnosis."
 *
 * The report is persisted to the Report model.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const type = (body.type ?? "weekly") as string;
    const now = new Date();

    let periodStart = new Date(now);
    let periodEnd = new Date(now);

    switch (type) {
      case "weekly":
        periodStart.setDate(now.getDate() - 7);
        break;
      case "monthly":
        periodStart.setMonth(now.getMonth() - 1);
        break;
      case "focus":
        periodStart.setDate(now.getDate() - 30);
        break;
      case "habits":
        periodStart.setDate(now.getDate() - 30);
        break;
      case "energy":
        periodStart.setDate(now.getDate() - 30);
        break;
      case "comprehensive":
        periodStart.setDate(now.getDate() - 30);
        break;
      default:
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Unknown report type: ${type}`);
    }

    // Gather real data.
    const [focusSessions, tasks, habitEntries, energyEntries] = await Promise.all([
      db.focusSession.findMany({
        where: { userId, status: "completed", endedAt: { gte: periodStart } },
        select: { id: true, actualMinutes: true, plannedMinutes: true, startedAt: true, taskTitle: true },
      }),
      db.task.findMany({
        where: { userId, createdAt: { gte: periodStart } },
        select: { id: true, title: true, status: true, priority: true, estimateMinutes: true, completedAt: true },
      }),
      db.habitEntry.findMany({
        where: { userId, date: { gte: periodStart } },
        select: { id: true, completed: true, date: true },
      }),
      db.energyEntry.findMany({
        where: { userId, timestamp: { gte: periodStart } },
        select: { id: true, level: true, timestamp: true },
      }),
    ]);

    // Compute summary statistics.
    const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
    const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "done").length;
    const totalTasks = tasks.length;
    const completedHabits = habitEntries.filter((h) => h.completed).length;
    const avgEnergy = energyEntries.length > 0
      ? energyEntries.reduce((sum, e) => sum + e.level, 0) / energyEntries.length
      : 0;

    const summary = `${focusSessions.length} focus sessions (${totalFocusMinutes} min), ${completedTasks}/${totalTasks} tasks completed, ${completedHabits} habit entries, avg energy ${avgEnergy.toFixed(1)}/5`;

    const data = JSON.stringify({
      focusSessions: focusSessions.length,
      totalFocusMinutes,
      tasks: { total: totalTasks, completed: completedTasks },
      habits: { total: habitEntries.length, completed: completedHabits },
      energy: { entries: energyEntries.length, average: Math.round(avgEnergy * 10) / 10 },
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    });

    const report = await db.report.create({
      data: {
        userId,
        type,
        periodStart,
        periodEnd,
        summary,
        data,
        label: "User activity tracking data — not a medical diagnosis",
        shared: false,
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * GET /api/reports/generate
 * List the user's reports.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const reports = await db.report.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
