import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createBrainDumpSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/brain-dumps
 * List the current user's brain-dump entries that are still in the inbox
 * (status === "inbox"). Converted/archived entries are excluded by default
 * but can be requested with `?include=all`.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const include = url.searchParams.get("include") ?? "inbox";

    const where: Record<string, unknown> = { userId };
    if (include === "inbox") {
      where.status = "inbox";
    }

    const entries = await db.brainDump.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[/api/brain-dumps GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/brain-dumps
 * Capture a new brain-dump entry. Minimal flow: just content. No category,
 * no project, no due date required (Prompt 04 §31).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createBrainDumpSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid brain-dump input.", {
        details: parsed.error.flatten(),
      });
    }

    const entry = await db.brainDump.create({
      data: {
        userId,
        content: parsed.data.content,
        category: parsed.data.category,
        status: "inbox",
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error("[/api/brain-dumps POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
