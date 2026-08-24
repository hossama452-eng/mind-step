import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/preferences
 * Returns the user's notification preferences.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const prefs = await db.preferences.findUnique({ where: { userId } });
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences.
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");

    // Only allow notification-related fields.
    const allowedFields = [
      "notificationFrequency", "quietHoursStart", "quietHoursEnd", "quietHoursEnabled",
      "dailyNotificationBudget", "notifyTaskDue", "notifyTaskOverdue", "notifyFocusStart",
      "notifyFocusEnd", "notifyPlanner", "notifyMilestones", "notifyAINudges",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field];
    }

    // Upsert preferences (might not exist yet).
    const prefs = await db.preferences.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
