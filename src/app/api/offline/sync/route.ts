import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mutationSchema = z.object({
  id: z.string(),
  method: z.string(),
  path: z.string(),
  attempts: z.number().int().nonnegative().optional(),
});

const syncSchema = z.object({
  mutations: z.array(mutationSchema).max(100),
});

/**
 * POST /api/offline/sync
 *
 * Audit endpoint — the client reports pending offline mutations.
 * The actual replay happens client-side (each queued request is sent
 * directly to its route handler with the X-Client-Mutation-Id header,
 * and the server's existing dedup logic handles idempotency).
 *
 * This endpoint is for visibility:
 *   - Audit log: record sync events for observability.
 *   - Sanity check: returns the server-side pending count (always 0 in
 *     the current architecture; reserved for future multi-device sync).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const body = await req.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid payload.", { statusCode: 400 });
    }

    try {
      await db.auditLog.create({
        data: {
          userId,
          action: "offline_sync",
          resource: "offline_mutations",
          resourceId: null,
          metadata: JSON.stringify({
            count: parsed.data.mutations.length,
            paths: parsed.data.mutations.map((m) => m.path).slice(0, 5),
          }),
          ipAddress: req.headers.get("x-forwarded-for") ?? null,
        },
      });
    } catch {
      // Audit log is best-effort.
    }

    const serverPending = await db.offlineMutation
      .count({ where: { userId, status: "pending" } })
      .catch(() => 0);

    return NextResponse.json({
      ok: true,
      serverPendingCount: serverPending,
      dedup: parsed.data.mutations.length,
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

/**
 * GET /api/offline/sync
 * Returns server-side pending mutations for this user (future multi-device).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const pending = await db.offlineMutation.findMany({
      where: { userId, status: "pending" },
      select: { id: true, method: true, path: true, createdAt: true, attempts: true, lastError: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return NextResponse.json({ ok: true, pending, pendingCount: pending.length });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
