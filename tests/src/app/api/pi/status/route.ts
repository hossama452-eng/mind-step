import { NextResponse } from "next/server";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getPiServerConfig, isPiServerConfigured } from "@/lib/pi/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/status
 *
 * Health-check endpoint. Returns the active network, whether the server
 * is configured, and the SDK script URL. Safe to call anonymously.
 *
 * This is the endpoint the client uses to decide whether to even attempt
 * Pi authentication — if not configured, it can show a fallback login UI.
 */
export async function GET() {
  try {
    const cfg = getPiServerConfig();
    const res = NextResponse.json({
      ok: true,
      network: cfg.network,
      configured: isPiServerConfigured(),
      apiBaseUrl: cfg.apiBaseUrl,
    });
    // Status rarely changes — cache for 5 minutes, allow stale for 1 hour.
    res.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res;
  } catch (err) {
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
