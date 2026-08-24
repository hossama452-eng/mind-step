import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications/notification-service";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/mark-all-read
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await markAllRead(userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
