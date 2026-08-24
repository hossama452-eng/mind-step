import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/focus-sessions/history?range=today|week|month
 *
 * Returns completed/cancelled focus sessions for the user, grouped by range.
 * Default range: today.
 *
 * Real data only — no fabrication (Prompt 05 §29, §30).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "today";

    const now = new Date();
    let since: Date;
    switch (range) {
      case "today":
        since = new Date(now);
        since.setHours(0, 0, 0, 0);
        break;
      case "week":
        since = new Date(now);
        since.setDate(now.getDate() - 7);
        break;
      case "month":
        since = new Date(now);
        since.setMonth(now.getMonth() - 1);
        break;
      default:
        since = new Date(now);
        since.setHours(0, 0, 0, 0);
    }

    const sessions = await db.focusSession.findMany({
      where: {
        userId,
        status: { in: ["completed", "cancelled"] },
        endedAt: { gte: since },
      },
      orderBy: { endedAt: "desc" },
      take: 100,
      include: {
        distractions: {
          select: { id: true, content: true, category: true },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({ sessions, range });
  } catch (err) {
    console.error("[/api/focus-sessions/history] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
