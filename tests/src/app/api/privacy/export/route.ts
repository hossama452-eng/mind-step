import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { exportUserData } from "@/lib/privacy/privacy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/privacy/export
 *
 * Exports ALL of the user's data as a downloadable JSON file.
 *
 * The response has:
 *   - Content-Type: application/json
 *   - Content-Disposition: attachment; filename="mindstep-data-export-<userId>-<date>.json"
 *
 * Privacy (Prompt 13 §Privacy):
 *   - Only the authenticated user's data — never another user's.
 *   - No server secrets, API keys, or session tokens.
 *   - Pi payment rows are sanitized (no blockchain addresses).
 */
export async function GET(_req: NextRequest) {
  try {
    const userId = await requireUserId();
    const data = await exportUserData(userId);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `mindstep-data-export-${userId.slice(0, 8)}-${dateStr}.json`;

    const res = NextResponse.json(data);
    res.headers.set("Content-Type", "application/json; charset=utf-8");
    res.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
