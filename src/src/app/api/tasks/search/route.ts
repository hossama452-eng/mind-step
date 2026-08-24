import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { taskSearchSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/search
 *
 * Server-side, user-scoped task search. The query is run against the
 * database — never against the client's currently-rendered list.
 *
 * Searchable fields (all user-scoped):
 *   - task.title
 *   - task.description
 *   - task.notes
 *   - task.tags (substring search on the JSON string column)
 *
 * Also supports project name search via a join — but stays user-scoped:
 * only the calling user's tasks and projects are searched.
 *
 * Body must conform to taskSearchSchema.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = taskSearchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid search input.", {
        details: parsed.error.flatten(),
      });
    }
    const { q, status, priority, projectId, milestoneId, overdue, limit, offset } = parsed.data;

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ tasks: [], count: 0, query: q });
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (milestoneId) where.milestoneId = milestoneId;
    if (overdue) {
      where.dueAt = { lt: new Date() };
      where.status = { not: "completed" };
    }

    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { tags: { contains: q } },
      // Search project title via relation.
      {
        project: { title: { contains: q }, userId },
      },
    ];

    const tasks = await db.task.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        subtasks: { orderBy: { position: "asc" }, select: { id: true, title: true, done: true, position: true } },
        project: { select: { id: true, title: true, color: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ tasks, count: tasks.length, query: q });
  } catch (err) {
    console.error("[/api/tasks/search] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
