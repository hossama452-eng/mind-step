import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { createTaskSchema, taskSearchSchema } from "@/lib/validations";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks
 * List the current user's tasks. Supports filtering via query params:
 *   - q            (search title/description/tags)
 *   - status        (inbox | planned | in_progress | completed | archived)
 *   - priority      (low | normal | high | urgent)
 *   - projectId
 *   - milestoneId
 *   - overdue=true
 *   - limit (default 50, max 100) + offset (default 0)
 *
 * Every query is scoped by userId — never trusts client input for ownership.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());

    // Coerce types — `url.searchParams` returns strings only.
    const parsed = taskSearchSchema.safeParse({
      q: params.q ?? "",
      status: params.status,
      priority: params.priority,
      projectId: params.projectId,
      milestoneId: params.milestoneId,
      overdue: params.overdue === "true" ? true : params.overdue === "false" ? false : undefined,
      limit: params.limit ? Number(params.limit) : 50,
      offset: params.offset ? Number(params.offset) : 0,
    });
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid search input.", {
        details: parsed.error.flatten(),
      });
    }
    const { q, status, priority, projectId, milestoneId, overdue, limit, offset } = parsed.data;

    // Build the where clause — every clause includes userId.
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (milestoneId) where.milestoneId = milestoneId;
    if (overdue) {
      where.dueAt = { lt: new Date() };
      where.status = { not: "completed" };
    }
    if (q && q.length > 0) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        // SQLite doesn't have a JSON query operator, but `tags` is a JSON
        // string column. We use a substring search — not perfect but safe.
        { tags: { contains: q } },
      ];
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: [
        // Inbox and not-started first, then by priority (urgent first),
        // then by due date ascending (nulls last via SQLite).
        { status: "asc" },
        { priority: "asc" },
        { dueAt: "asc" },
        { createdAt: "desc" },
      ],
      take: limit,
      skip: offset,
      include: {
        subtasks: { orderBy: { position: "asc" }, select: { id: true, title: true, done: true, position: true } },
        project: { select: { id: true, title: true, color: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ tasks, count: tasks.length });
  } catch (err) {
    console.error("[/api/tasks GET] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * POST /api/tasks
 * Create a new task owned by the current user.
 * Body must conform to createTaskSchema (title required, all else optional).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.");
    }

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid task input.", {
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // If projectId is provided, verify the project belongs to the user.
    // This is the ownership isolation test required by Prompt 04 §29 & §54.
    if (input.projectId) {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { userId: true },
      });
      if (!project) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Project not found.");
      }
      assertOwnership(project.userId, userId);
    }

    // If milestoneId is provided, verify the milestone belongs to the user
    // AND belongs to the project (if a projectId was also provided).
    if (input.milestoneId) {
      const milestone = await db.milestone.findUnique({
        where: { id: input.milestoneId },
        select: { userId: true, projectId: true },
      });
      if (!milestone) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Milestone not found.");
      }
      assertOwnership(milestone.userId, userId);
      if (input.projectId && milestone.projectId !== input.projectId) {
        throw new AppError(
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          "Milestone must belong to the same project.",
          { statusCode: 422 }
        );
      }
    }

    // Tags are stored as a JSON string column (SQLite limitation).
    const tagsJson = JSON.stringify(input.tags ?? []);

    const task = await db.task.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        energy: input.energy,
        estimateMinutes: input.estimateMinutes ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        dueTime: input.dueTime ?? null,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        tags: tagsJson,
      },
      include: {
        subtasks: { orderBy: { position: "asc" } },
        project: { select: { id: true, title: true, color: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[/api/tasks POST] error:", err);
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
