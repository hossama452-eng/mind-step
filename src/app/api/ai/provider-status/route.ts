import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getAIProvider } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/provider-status
 *
 * Returns which AI provider is active (Prompt 07 §3, §55).
 * The UI uses this to display an honest label — never claims
 * a deterministic response is from an LLM.
 */
export async function GET() {
  try {
    await requireUserId();
    const provider = await getAIProvider();
    return NextResponse.json({
      provider: provider.name,
      isLLM: provider.isLLM,
      // Honest label for the UI.
      label: provider.isLLM ? "AI Coach" : "Rule-based assistant",
    });
  } catch {
    return NextResponse.json({ provider: "unknown", isLLM: false, label: "Unavailable" });
  }
}
