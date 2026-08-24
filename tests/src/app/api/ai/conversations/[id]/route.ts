import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/ai/conversations/[id]
 * Delete a conversation and all its messages (Prompt 07 §12, §53).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const conversation = await db.aIConversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation) throw new AppError(ErrorCodes.NOT_FOUND, "Conversation not found.");
    assertOwnership(conversation.userId, userId);

    await db.aIConversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
