import { NextResponse } from "next/server";

/**
 * MindStep API health-check endpoint.
 * Returns basic application metadata so any client or external monitor
 * can verify the service is up without exposing internal data.
 */
export async function GET() {
  return NextResponse.json({
    name: "MindStep",
    tagline: "One Step. One Focus. One Day.",
    status: "ok",
    time: new Date().toISOString(),
  });
}
