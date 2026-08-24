import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { runScheduler } from "@/lib/notifications/notification-service";
import { getLocale } from "next-intl/server";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/schedule
 *
 * Runs the notification scheduler for the current user (Prompt 08 §67, §68).
 *
 * The scheduler is IDEMPOTENT (Prompt 08 §20): running it twice for the
 * same user + day will not create duplicate notifications. Each notification
 * has a deterministic dedupKey based on userId + date + type.
 *
 * This endpoint can be called:
 *   - On page load (to check for new notifications)
 *   - By a background worker (if one exists)
 *   - Manually by the user (refresh button)
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const locale = (await getLocale()) as Locale;
    const result = await runScheduler(userId, locale);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
