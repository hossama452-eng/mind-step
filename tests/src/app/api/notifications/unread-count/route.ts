import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications/notification-service";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/unread-count
 * Returns the persisted, user-scoped unread count (Prompt 08 §7).
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const count = await getUnreadCount(userId);
    return NextResponse.json({ unreadCount: count });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
