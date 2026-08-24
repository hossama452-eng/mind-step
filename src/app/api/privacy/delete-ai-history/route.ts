import { NextResponse, NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { AppError, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { deleteAIHistory } from "@/lib/privacy/privacy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/privacy/delete-ai-history
 *
 * Deletes ALL AI conversations + messages for the authenticated user.
 * Does NOT delete AI memories (those are explicit user preferences).
 *
 * Returns: { ok: true, conversationsDeleted: number, messagesDeleted: number }
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await deleteAIHistory(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
