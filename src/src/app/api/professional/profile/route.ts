import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/professional/profile
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await db.professionalProfile.findUnique({ where: { userId } });
    const notes = await db.professionalNote.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ profile, notes });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * PATCH /api/professional/profile
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");

    const profile = await db.professionalProfile.upsert({
      where: { userId },
      update: {
        role: body.role,
        organization: body.organization,
        goals: body.goals,
        sharingEnabled: body.sharingEnabled,
      },
      create: {
        userId,
        role: body.role,
        organization: body.organization,
        goals: body.goals,
        sharingEnabled: body.sharingEnabled ?? false,
      },
    });
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
