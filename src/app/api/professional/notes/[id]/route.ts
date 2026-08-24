import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/professional/notes
 * Create a professional note. Notes start unapproved — the user must
 * approve before they can be shared.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body.content !== "string") {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { content }.");
    }
    const note = await db.professionalNote.create({
      data: { userId, content: body.content },
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/professional/notes/[id]
 * Approve or update a note.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = await db.professionalNote.findUnique({ where: { id }, select: { userId: true } });
    if (!note) throw new AppError(ErrorCodes.NOT_FOUND, "Note not found.");
    assertOwnership(note.userId, userId);

    const data: Record<string, unknown> = {};
    if (body.content !== undefined) data.content = body.content;
    if (body.approved === true) { data.approved = true; data.approvedAt = new Date(); }
    if (body.approved === false) { data.approved = false; data.approvedAt = null; }

    const updated = await db.professionalNote.update({ where: { id }, data });
    return NextResponse.json({ note: updated });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/professional/notes/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const note = await db.professionalNote.findUnique({ where: { id }, select: { userId: true } });
    if (!note) throw new AppError(ErrorCodes.NOT_FOUND, "Note not found.");
    assertOwnership(note.userId, userId);
    await db.professionalNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
