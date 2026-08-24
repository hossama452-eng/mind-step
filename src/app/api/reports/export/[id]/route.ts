import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/export/[id]
 *
 * Export a report as a downloadable JSON file (Prompt 09 — PDF/Export).
 * The response includes a Content-Disposition header.
 *
 * The report is clearly labeled as "User activity tracking data — not a medical diagnosis."
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const report = await db.report.findUnique({
      where: { id },
      select: { userId: true, type: true, periodStart: true, periodEnd: true, summary: true, data: true, label: true, createdAt: true },
    });
    if (!report) throw new AppError(ErrorCodes.NOT_FOUND, "Report not found.");
    assertOwnership(report.userId, userId);

    // Build a clean export payload.
    const exportData = {
      reportType: report.type,
      period: {
        start: report.periodStart.toISOString(),
        end: report.periodEnd.toISOString(),
      },
      summary: report.summary,
      data: JSON.parse(report.data),
      label: report.label,
      exportedAt: new Date().toISOString(),
      disclaimer: "This report contains user activity tracking data. It is NOT a medical diagnosis. MindStep is not a medical or diagnostic tool.",
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mindstep-report-${report.type}-${report.periodStart.toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
