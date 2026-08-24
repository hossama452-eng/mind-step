import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/family/relationships
 * List the user's family relationships (as parent or child).
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const relationships = await db.familyRelationship.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: { not: "revoked" },
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ relationships });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/family/relationships
 * Create a family relationship (parent → child invitation).
 * Status starts as "pending" — the child must consent.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body || !body.toUserEmail) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { toUserEmail, relation }.");
    }

    const targetUser = await db.user.findUnique({
      where: { email: body.toUserEmail.toLowerCase() },
      select: { id: true, name: true, email: true },
    });
    if (!targetUser) {
      throw new AppError(ErrorCodes.NOT_FOUND, "User not found.");
    }
    if (targetUser.id === userId) {
      throw new AppError(ErrorCodes.BUSINESS_RULE_VIOLATION, "Cannot create relationship with yourself.", { statusCode: 422 });
    }

    // Check for existing relationship.
    const existing = await db.familyRelationship.findFirst({
      where: {
        OR: [
          { fromUserId: userId, toUserId: targetUser.id },
          { fromUserId: targetUser.id, toUserId: userId },
        ],
        status: { not: "revoked" },
      },
    });
    if (existing) {
      throw new AppError(ErrorCodes.DUPLICATE, "Relationship already exists.", { statusCode: 409 });
    }

    const relation = body.relation ?? "parent";
    const rel = await db.familyRelationship.create({
      data: {
        fromUserId: userId,
        toUserId: targetUser.id,
        relation,
        status: "pending",
        permissions: JSON.stringify(["view_tasks", "view_focus", "view_routines"]),
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ relationship: rel }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
