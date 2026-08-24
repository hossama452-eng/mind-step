import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/family/relationships/[id]
 * Accept (consent) or revoke a family relationship.
 *
 * For acceptance: the toUser must consent (status: pending → active).
 * For revocation: either party can revoke.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action as "accept" | "revoke" | "update_permissions" | undefined;

    const rel = await db.familyRelationship.findUnique({
      where: { id },
      select: { fromUserId: true, toUserId: true, status: true, permissions: true },
    });
    if (!rel) throw new AppError(ErrorCodes.NOT_FOUND, "Relationship not found.");

    // Verify the user is part of this relationship.
    const isFromUser = rel.fromUserId === userId;
    const isToUser = rel.toUserId === userId;
    if (!isFromUser && !isToUser) {
      throw new AppError(ErrorCodes.NOT_OWNER, "You are not part of this relationship.");
    }

    if (action === "accept") {
      // Only the toUser can accept.
      if (!isToUser) {
        throw new AppError(ErrorCodes.FORBIDDEN, "Only the invited user can accept.");
      }
      const updated = await db.familyRelationship.update({
        where: { id },
        data: { status: "active", consentAt: new Date() },
      });
      return NextResponse.json({ relationship: updated });
    }

    if (action === "revoke") {
      // Either party can revoke.
      const updated = await db.familyRelationship.update({
        where: { id },
        data: { status: "revoked", revokedAt: new Date() },
      });
      return NextResponse.json({ relationship: updated });
    }

    if (action === "update_permissions") {
      // Only the toUser (child) can update their own permissions.
      if (!isToUser) {
        throw new AppError(ErrorCodes.FORBIDDEN, "Only the invited user can change permissions.");
      }
      const permissions = Array.isArray(body.permissions) ? body.permissions : [];
      const updated = await db.familyRelationship.update({
        where: { id },
        data: { permissions: JSON.stringify(permissions) },
      });
      return NextResponse.json({ relationship: updated });
    }

    throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { action: 'accept' | 'revoke' | 'update_permissions' }.");
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
