import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getLocaleFromRequest } from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";
import { computeInsights } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/insights
 *
 * Returns the user's personal insights (Prompt 11 — Personal Insights Engine).
 * Computed from real user data (focus sessions, tasks, energy entries, etc).
 * If insufficient data exists, returns honest "not enough data" insights.
 *
 * Privacy (Prompt 11 — Privacy):
 *   - Only the minimum necessary data is fetched.
 *   - No external sharing.
 *   - The user can dismiss insights via PATCH /api/insights?id=.../dismiss.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const locale = getLocaleFromRequest(req) as Locale;

    const computed = await computeInsights(userId, locale);

    // Persist insights to the database so they can be dismissed later.
    // Use deterministic IDs so re-running the computation is an upsert, not
    // a duplicate create.
    for (const insight of computed.all) {
      try {
        await db.insight.upsert({
          where: { id: `prompt11-${userId}-${insight.id}` },
          update: {
            title: insight.title,
            body: insight.body,
            kind: insight.kind,
            category: insight.category,
            data: insight.data ? JSON.stringify(insight.data) : null,
          },
          create: {
            id: `prompt11-${userId}-${insight.id}`,
            userId,
            kind: insight.kind,
            category: insight.category,
            title: insight.title,
            body: insight.body,
            data: insight.data ? JSON.stringify(insight.data) : null,
            actionable: false,
          },
        });
      } catch {
        // Persisting insights is best-effort — never fail the API for it.
      }
    }

    return NextResponse.json(computed);
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/insights?id=... — dismiss an insight by adding ?action=dismiss
 * to the URL. (Patch is more flexible than DELETE because we just set
 * dismissed=true rather than lose the data.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action") ?? "dismiss";
    if (!id) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Missing id query parameter.", { statusCode: 400 });
    }
    // Verify ownership.
    const insight = await db.insight.findUnique({ where: { id }, select: { userId: true } });
    if (!insight || insight.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Insight not found.", { statusCode: 404 });
    }
    const updated = await db.insight.update({
      where: { id },
      data: { dismissed: action === "dismiss" ? true : false },
    });
    return NextResponse.json({ insight: updated });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
