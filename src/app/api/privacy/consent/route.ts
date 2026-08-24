import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getConsent, updateConsent } from "@/lib/privacy/privacy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  termsAccepted: z.boolean().optional(),
  privacyAccepted: z.boolean().optional(),
  ageConfirmed: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  dataProcessingOptIn: z.boolean().optional(),
});

/**
 * GET /api/privacy/consent
 * Returns the user's current Consent state (or null if none).
 *
 * POST /api/privacy/consent
 * Updates the user's Consent row. Only fields provided in the body are changed.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const consent = await getConsent(userId);
    return NextResponse.json({ ok: true, consent });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected JSON body.", { statusCode: 400 });
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid consent payload.", {
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }
    const consent = await updateConsent(userId, parsed.data);
    return NextResponse.json({ ok: true, consent });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(toApiError(err), { status: err.statusCode });
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
