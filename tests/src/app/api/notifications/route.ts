import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications/notification-service";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?filter=all|unread
 *
 * Returns the user's notifications (Prompt 08 §5).
 * Unread count is also returned for convenience (Prompt 08 §7).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const filter = (url.searchParams.get("filter") ?? "all") as "all" | "unread";

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(userId, filter),
      getUnreadCount(userId),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
