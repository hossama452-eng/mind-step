import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getLocaleFromRequest } from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";
import { fetchInsightData } from "@/lib/insights";
import { generateWeeklyReview } from "@/lib/insights/weekly-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/insights/weekly-review
 *
 * Returns a concise weekly review (Prompt 11 — Weekly Review):
 *   - What worked (highlights)
 *   - What was difficult (friction points)
 *   - What changed (delta vs the week before)
 *   - Suggested experiment (one concrete next step)
 *
 * Honest about data — if a section has no data, it says so.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const locale = getLocaleFromRequest(req) as Locale;

    const { focusSessions, tasks, energy } = await fetchInsightData(userId);
    const review = generateWeeklyReview(
      { focusSessions, tasks, energyEntries: energy },
      locale,
    );

    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
