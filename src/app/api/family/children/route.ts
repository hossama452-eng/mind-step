import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/family/children
 * Returns the parent's children (active relationships where the user is the parent).
 * Only data permitted by the relationship permissions is returned.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    // Find active relationships where this user is the parent.
    const relationships = await db.familyRelationship.findMany({
      where: { fromUserId: userId, status: "active", relation: "parent" },
      include: {
        toUser: {
          select: {
            id: true,
            name: true,
            email: true,
            tasks: {
              where: { status: { notIn: ["completed", "archived", "done"] } },
              select: { id: true, title: true, status: true, priority: true, dueAt: true },
              take: 10,
            },
            focusSessions: {
              where: { status: "completed" },
              select: { id: true, actualMinutes: true, startedAt: true, taskTitle: true },
              orderBy: { startedAt: "desc" },
              take: 5,
            },
            rewards: {
              where: { childUserId: { not: null } },
              select: { id: true, title: true, points: true, redeemed: true },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            _count: { select: { tasks: true, focusSessions: true, habitEntries: true } },
          },
        },
      },
    });

    const children = relationships.map((rel) => {
      const permissions = JSON.parse(rel.permissions || "[]") as string[];
      const child = rel.toUser;
      return {
        id: child.id,
        name: child.name,
        email: child.email,
        relationshipId: rel.id,
        permissions,
        // Only include data the parent has permission to see.
        tasks: permissions.includes("view_tasks") ? child.tasks : [],
        focusSessions: permissions.includes("view_focus") ? child.focusSessions : [],
        rewards: permissions.includes("view_routines") ? child.rewards : [],
        stats: {
          totalTasks: child._count.tasks,
          totalFocusSessions: child._count.focusSessions,
          totalHabitEntries: child._count.habitEntries,
        },
      };
    });

    return NextResponse.json({ children });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
