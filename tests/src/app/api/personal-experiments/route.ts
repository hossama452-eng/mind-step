import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getLocaleFromRequest } from "@/lib/locale-utils";
import type { Locale } from "@/i18n/locale";
import {
  EXPERIMENT_TYPES,
  type ExperimentType,
  computeMetricsSnapshot,
  computeDelta,
  describeDelta,
} from "@/lib/insights/personal-experiments";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/personal-experiments
 *   Returns all the user's experiments (active + completed + abandoned),
 *   ordered by startedAt desc.
 *
 * POST /api/personal-experiments
 *   Starts a new experiment. Captures a baseline metrics snapshot
 *   automatically.
 *
 *   Body:
 *     {
 *       type: "shorter_focus" | "longer_focus" | "morning_planning" | ...
 *       title: string (optional — defaults to localized type label)
 *       hypothesis?: string (user's free-text hypothesis)
 *     }
 *
 *   Returns the created experiment with the baselineSnapshot populated.
 */
const startSchema = z.object({
  type: z.enum(EXPERIMENT_TYPES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(120).optional(),
  hypothesis: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const experiments = await db.personalExperiment.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ experiments });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const locale = getLocaleFromRequest(req) as Locale;

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid experiment input.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const type = parsed.data.type as ExperimentType;
    const title = parsed.data.title || defaultTitle(type, locale);

    // Capture baseline metrics over the prior 7 days.
    const baselineSnapshot = await computeMetricsSnapshot(userId, 7);

    const experiment = await db.personalExperiment.create({
      data: {
        userId,
        type,
        title,
        hypothesis: parsed.data.hypothesis ?? null,
        status: "active",
        startedAt: new Date(),
        baselineSnapshot: JSON.stringify(baselineSnapshot),
      },
    });

    return NextResponse.json({ experiment });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

function defaultTitle(type: ExperimentType, locale: Locale): string {
  const m: Record<string, Record<Locale, string>> = {
    shorter_focus: { en: "Shorter focus sessions", ar: "جلسات تركيز أقصر", fr: "Sessions plus courtes", zh: "更短的专注会话" },
    longer_focus: { en: "Longer focus sessions", ar: "جلسات تركيز أطول", fr: "Sessions plus longues", zh: "更长的专注会话" },
    morning_planning: { en: "Morning planning", ar: "تخطيط الصباح", fr: "Planification du matin", zh: "早晨规划" },
    evening_planning: { en: "Evening planning", ar: "تخطيط المساء", fr: "Planification du soir", zh: "晚上规划" },
    smaller_steps: { en: "Smaller task steps", ar: "خطوات أصغر", fr: "Plus petites étapes", zh: "更小的步骤" },
    different_reminder_timing: { en: "Different reminder timing", ar: "توقيت تذكير مختلف", fr: "Timing de rappel différent", zh: "不同的提醒时间" },
    earlier_breaks: { en: "Earlier breaks", ar: "فواصل أبكر", fr: "Pauses plus tôt", zh: "更早的休息" },
    later_breaks: { en: "Later breaks", ar: "فواصل لاحقًة", fr: "Pauses plus tard", zh: "更晚的休息" },
  };
  return m[type]?.[locale] ?? m[type]?.en ?? type;
}
