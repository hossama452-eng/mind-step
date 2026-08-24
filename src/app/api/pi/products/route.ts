import { NextResponse } from "next/server";
import { buildApiErrorResponse } from "@/lib/error-messages";
import { listProducts } from "@/lib/pi/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pi/products
 *
 * Returns the centrally-configured payment products (Prompt 12 §6).
 * UI screens fetch this list rather than hard-coding product info.
 *
 * The amount + currency are the SERVER's authoritative values — never
 * trust client-reported amounts (the client could tamper).
 *
 * Safe to call anonymously.
 */
export async function GET() {
  try {
    const products = listProducts();
    const res = NextResponse.json({ ok: true, products });
    // Products are centrally-configured — cache for 1 hour (public, immutable).
    // Changes require a server restart, so this is safe.
    res.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res;
  } catch (err) {
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
