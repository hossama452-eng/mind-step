import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/family/rewards
 * Create a reward for a child.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body || !body.title || !body.childUserId) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { title, childUserId, points }.");
    }

    // Verify the parent has an active relationship with this child.
    const rel = await db.familyRelationship.findFirst({
      where: { fromUserId: userId, toUserId: body.childUserId, status: "active" },
    });
    if (!rel) {
      throw new AppError(ErrorCodes.NOT_OWNER, "No active family relationship with this child.");
    }

    const reward = await db.reward.create({
      data: {
        userId: body.childUserId,
        childUserId: body.childUserId,
        title: body.title,
        description: body.description ?? null,
        points: body.points ?? 0,
      },
    });
    return NextResponse.json({ reward }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
