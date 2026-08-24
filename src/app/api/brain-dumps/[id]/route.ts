import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/brain-dumps/[id]
 * Hard-delete a brain-dump entry. The entry must belong to the current user.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await db.brainDump.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Brain-dump entry not found.");
    }
    assertOwnership(existing.userId, userId);

    await db.brainDump.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/brain-dumps/:id DELETE] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
