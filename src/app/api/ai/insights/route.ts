import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { generateInsights, type InsightResult } from "@/lib/ai/insights";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/insights
 *
 * Returns personal insights generated from real user data (Prompt 07 §29, §30, §31).
 *
 * If there is insufficient data, returns an honest "not enough data" message
 * (Prompt 07 §30). Never fabricates patterns.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    // Gather real data for insight generation.
    const [focusSessions, tasks, energyEntries] = await Promise.all([
      db.focusSession.findMany({
        where: { userId, status: "completed" },
        select: { id: true, actualMinutes: true, plannedMinutes: true, startedAt: true, taskId: true },
        orderBy: { startedAt: "desc" },
        take: 100,
      }),
      db.task.findMany({
        where: { userId },
        select: { id: true, status: true, estimateMinutes: true, actualMinutes: true, createdAt: true, completedAt: true },
      }),
      db.energyEntry.findMany({
        where: { userId },
        select: { id: true, level: true, timestamp: true },
        orderBy: { timestamp: "desc" },
        take: 30,
      }),
    ]);

    const insights = generateInsights({
      focusSessions: focusSessions.map((s) => ({
        actualMinutes: s.actualMinutes ?? 0,
        plannedMinutes: s.plannedMinutes,
        startedAt: s.startedAt,
        taskId: s.taskId,
      })),
      tasks: tasks.map((t) => ({
        status: t.status,
        estimateMinutes: t.estimateMinutes,
        actualMinutes: t.actualMinutes,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      energyEntries: energyEntries.map((e) => ({
        level: e.level,
        timestamp: e.timestamp,
      })),
    });

    // Persist insights to the database (so they can be dismissed later).
    for (const insight of insights) {
      await db.insight.upsert({
        where: { id: `ai-insight-${insight.id}` },
        update: { title: insight.title, body: insight.body, kind: insight.kind },
        create: {
          id: `ai-insight-${insight.id}`,
          userId,
          kind: insight.kind,
          title: insight.title,
          body: insight.body,
          actionable: false,
        },
      });
    }

    return NextResponse.json({ insights });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
