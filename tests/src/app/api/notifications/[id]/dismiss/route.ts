import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { dismiss } from "@/lib/notifications/notification-service";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/notifications/[id]/dismiss
 * Dismiss a notification (remove from active list without deleting).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const notif = await dismiss(userId, id);
    if (!notif) throw new AppError(ErrorCodes.NOT_FOUND, "Notification not found.");
    return NextResponse.json({ notification: notif });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
