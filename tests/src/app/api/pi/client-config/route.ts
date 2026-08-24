import { NextResponse } from "next/server";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { getPiClientConfig, isPiServerConfigured } from "@/lib/pi/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/client-config
 *
 * Returns the public Pi config the client SDK needs to initialize.
 * NO secrets are exposed — only appId, sandbox flag, SDK URL, version.
 *
 * Reference (current Pi SDK init):
 *   <script src="https://sdk.minepi.com/pi-sdk.js"></script>
 *   <script>Pi.init({ version: "2.0", sandbox: true })</script>
 */
export async function GET() {
  try {
    const config = getPiClientConfig();
    return NextResponse.json({
      ok: true,
      config,
      // Helpful for the client to show a "Pi not configured" banner.
      serverConfigured: isPiServerConfigured(),
    });
  } catch (err) {
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
