import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { smartBreakdownSuggestSchema } from "@/lib/validations";
import { suggestBreakdown, BREAKDOWN_SOURCE_LABELS } from "@/lib/smart-breakdown";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smart-breakdown/suggest
 *
 * Returns suggested subtask titles for a given task title/description.
 *
 * CRITICAL (Prompt 04 §39, §42, §43):
 *   - This endpoint NEVER writes to the database.
 *   - It does NOT create subtasks. It only returns suggestions.
 *   - The user must review, edit, and explicitly approve via the
 *     /api/smart-breakdown/approve endpoint for any subtasks to be created.
 *   - The algorithm is deterministic (sentence-pattern based) — not a fake LLM.
 *
 * Response shape:
 *   {
 *     steps: string[],
 *     source: "deterministic",
 *     sourceLabel: string,  // localized disclosure — never claims to be AI
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    // Even though we don't write to the database, we still authenticate.
    // The deterministic algorithm is the same for everyone, but exposing
    // it requires a valid session (prevents anonymous abuse).
    const userId = await requireUserId();
    void userId; // used for auth check only

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = smartBreakdownSuggestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid suggest input.", {
        details: parsed.error.flatten(),
      });
    }

    const { taskTitle, taskDescription, locale } = parsed.data;
    const suggestion = suggestBreakdown({ taskTitle, taskDescription, locale });

    // Optionally, if a taskId was also provided, look up the task to
    // ensure it exists and belongs to the user — but we DO NOT write
    // anything to the database in this endpoint.
    if (body.taskId && typeof body.taskId === "string") {
      const task = await db.task.findUnique({
        where: { id: body.taskId },
        select: { id: true, title: true, description: true, userId: true },
      });
      // If the task doesn't exist or belongs to someone else, we silently
      // ignore the taskId — the suggestions are still useful even without
      // a real task (e.g., for a new task being drafted in the UI).
      if (task && task.userId === userId) {
        // Use the real task title/description if available.
        const realSuggestion = suggestBreakdown({
          taskTitle: task.title,
          taskDescription: task.description,
          locale,
        });
        return NextResponse.json({
          ...realSuggestion,
          sourceLabel: BREAKDOWN_SOURCE_LABELS[locale],
          taskId: task.id,
        });
      }
    }

    return NextResponse.json({
      ...suggestion,
      sourceLabel: BREAKDOWN_SOURCE_LABELS[locale],
    });
  } catch (err) {
    console.error("[/api/smart-breakdown/suggest] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
