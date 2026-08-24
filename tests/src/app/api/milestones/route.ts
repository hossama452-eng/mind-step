import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { createMilestoneSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/milestones
 * Create a new milestone for a project. The project must belong to the
 * current user.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createMilestoneSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid milestone input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // Verify the parent project exists AND belongs to the current user.
    // This is the ownership isolation test — User A cannot attach a milestone
    // to User B's project (Prompt 04 §54).
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { userId: true },
    });
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
    }
    assertOwnership(project.userId, userId);

    // Auto-position.
    const existingCount = await db.milestone.count({ where: { projectId: input.projectId } });

    const milestone = await db.milestone.create({
      data: {
        projectId: input.projectId,
        userId,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        position: existingCount,
      },
    });

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    console.error("[/api/milestones POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
