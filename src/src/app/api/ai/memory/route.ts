import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { isAllowedMemoryKey, isSensitiveContent } from "@/lib/ai/context-service";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/memory
 * List the user's AI memory entries (Prompt 07 §33).
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const memories = await db.aIMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ memories });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/ai/memory
 * Create or update an AI memory entry (Prompt 07 §34, §35).
 *
 * The key MUST be in the allow-list (Prompt 07 §34).
 * The value MUST NOT contain sensitive content (Prompt 07 §35).
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { key, value }.");
    }

    const { key, value } = body;

    // Allow-list check (Prompt 07 §34).
    if (!isAllowedMemoryKey(key)) {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        `Memory key "${key}" is not in the allow-list.`,
        { statusCode: 422 }
      );
    }

    // Sensitive content check (Prompt 07 §35).
    if (isSensitiveContent(value)) {
      throw new AppError(
        ErrorCodes.BUSINESS_RULE_VIOLATION,
        "This content appears to contain sensitive information and cannot be stored as memory.",
        { statusCode: 422 }
      );
    }

    // Upsert — unique on [userId, key].
    const memory = await db.aIMemory.upsert({
      where: { userId_key: { userId, key } },
      update: { value, source: body.source ?? "user_explicit" },
      create: { userId, key, value, source: body.source ?? "user_explicit" },
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * DELETE /api/ai/memory
 * Clear all AI memory for the user (Prompt 07 §33).
 */
export async function DELETE() {
  try {
    const userId = await requireUserId();
    await db.aIMemory.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
