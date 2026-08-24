import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { convertBrainDumpSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

/** Task priority as a plain string type (matches the schema). */
type TaskPriority = "low" | "normal" | "high" | "urgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/brain-dumps/convert
 *
 * Convert a brain-dump entry into a Task or Reminder.
 *
 * Behavior (Prompt 04 §33):
 *   - The original brain-dump entry is marked `status = "converted"`.
 *   - The original text is preserved as the new Task's title.
 *   - The brain-dump entry's `processedTaskId` (or `processedReminderId`)
 *     is set to the new record's ID, so we never lose the link.
 *   - This is idempotent — calling `convert` on an already-converted
 *     entry returns the previously-created record without creating a
 *     new one (prevents duplicate tasks).
 *
 * The transaction ensures atomicity: either both the new record AND
 * the brain-dump update land, or neither does.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = convertBrainDumpSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid convert input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // Load the brain-dump entry.
    const entry = await db.brainDump.findUnique({
      where: { id: input.id },
      select: { id: true, userId: true, content: true, status: true, processedTaskId: true, processedReminderId: true },
    });
    if (!entry) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Brain-dump entry not found.");
    }
    assertOwnership(entry.userId, userId);

    // Idempotency: if already converted, return the existing record.
    if (entry.status === "converted") {
      if (input.target === "task" && entry.processedTaskId) {
        const existing = await db.task.findUnique({
          where: { id: entry.processedTaskId },
        });
        if (existing) {
          return NextResponse.json({ task: existing, entry, alreadyConverted: true });
        }
      }
      if (input.target === "reminder" && entry.processedReminderId) {
        const existing = await db.reminder.findUnique({
          where: { id: entry.processedReminderId },
        });
        if (existing) {
          return NextResponse.json({ reminder: existing, entry, alreadyConverted: true });
        }
      }
      // Status is "converted" but the linked record is gone — allow re-conversion
      // by falling through to the create path.
    }

    // If converting to a task: verify projectId belongs to the user (if provided).
    if (input.target === "task" && input.projectId) {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { userId: true },
      });
      if (!project) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
      }
      assertOwnership(project.userId, userId);
    }

    // Use the user's supplied title (if any), otherwise the brain-dump content.
    const title = (input.title ?? entry.content).trim().slice(0, 200);
    if (!title) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Title cannot be empty.");
    }

    // Atomic: create the new record AND mark the brain-dump as converted.
    const result = await db.$transaction(async (tx) => {
      if (input.target === "task") {
        const task = await tx.task.create({
          data: {
            userId,
            title,
            // The full brain-dump content is preserved in `description`.
            description: entry.content,
            status: "inbox",
            priority: (input.priority ?? "normal") as TaskPriority,
            projectId: input.projectId ?? null,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            tags: "[]",
          },
        });

        await tx.brainDump.update({
          where: { id: entry.id },
          data: {
            status: "converted",
            processedTaskId: task.id,
            processedReminderId: null,
          },
        });

        return { task };
      } else {
        // target === "reminder"
        if (!input.remindAt) {
          throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            "remindAt is required when converting to a reminder."
          );
        }
        const reminder = await tx.reminder.create({
          data: {
            userId,
            title,
            remindAt: new Date(input.remindAt),
          },
        });

        await tx.brainDump.update({
          where: { id: entry.id },
          data: {
            status: "converted",
            processedReminderId: reminder.id,
            processedTaskId: null,
          },
        });

        return { reminder };
      }
    });

    return NextResponse.json({ ...result, converted: true }, { status: 201 });
  } catch (err) {
    console.error("[/api/brain-dumps/convert] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
