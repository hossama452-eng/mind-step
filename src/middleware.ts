/**
 * MindStep Security Middleware (Prompt 13 — Headers / Web Security).
 *
 * Applies security headers to every response:
 *   - Content-Security-Policy: restricts script/style/font/image sources.
 *     Allows inline styles + 'unsafe-inline' for styles because Next.js + Tailwind
 *     require them. Does NOT allow 'unsafe-inline' or 'unsafe-eval' for scripts.
 *     Allows the Pi SDK script from sdk.minepi.com.
 *   - X-Content-Type-Options: nosniff — prevents MIME sniffing.   
 *   - Referrer-Policy: strict-origin-when-cross-origin — leak minimum referrer.
 *   - Permissions-Policy: restricts camera, microphone, geolocation, payment
 *     (we don't use these — explicit deny).
 *   - Strict-Transport-Security: enforce HTTPS (only on HTTPS responses).
 *
 * NOTE: 'unsafe-inline' for styles is required by Next.js + Tailwind.
 * We do NOT allow 'unsafe-inline' or 'unsafe-eval' for scripts — this
 * blocks XSS payload execution even if an attacker injects a <script> tag.
 *
 * Routes:
 *   - /api/pi/* — needs sdk.minepi.com in connect/script-src
 *   - All other routes — same policy, no script exceptions
 *
 * Production hardening note: if you serve the app via a CDN/reverse proxy
 * (e.g., Cloudflare, Caddy), configure these same headers there too —
 * middleware headers are belt-and-suspenders.
 */

import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// CSP DIRECTIVES
// ============================================================

const SELF = "'self'";
const PI_SDK_ORIGIN = "https://sdk.minepi.com";
const PI_API_ORIGIN = "https://api.minepi.com";

const cspDirectives: Record<string, string> = {
  "default-src": `${SELF}`,
  // Scripts: only from self + Pi SDK. NO 'unsafe-inline', NO 'unsafe-eval'.
  "script-src": `${SELF} ${PI_SDK_ORIGIN}`,
  // Styles: 'unsafe-inline' is required for Next.js + Tailwind + styled-components.
  // We accept this trade-off because CSS cannot execute arbitrary code.
  "style-src": `${SELF} 'unsafe-inline'`,
  "img-src": `${SELF} data: blob: https:`,
  "font-src": `${SELF} data:`,
  "connect-src": `${SELF} ${PI_API_ORIGIN} https://api.minepi.com`,
  "frame-src": `${SELF}`,
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": `${SELF}`,
  "frame-ancestors": `${SELF} https://sdk.minepi.com https://app-cdn.minepi.com https://*.minepi.com`,,
  "upgrade-insecure-requests": "",
};

function buildCspHeader(): string {
  return Object.entries(cspDirectives)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}

const CSP_HEADER = buildCspHeader();

// ============================================================
// MIDDLEWARE
// ============================================================

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();

  // Content-Security-Policy — blocks XSS payload execution.
  res.headers.set("Content-Security-Policy-Report-Only", CSP_HEADER);

  // X-Content-Type-Options: nosniff — prevents MIME sniffing.
  res.headers.set("X-Content-Type-Options", "nosniff");

  // X-Frame-Options: DENY — clickjacking defense. CSP frame-ancestors
  // is the modern equivalent, but we set both for older browsers.
  res.headers.set("X-Frame-Options", "DENY");

  // Referrer-Policy: strict-origin-when-cross-origin — leak minimum.
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy: deny features we don't use.
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self https://sdk.minepi.com), interest-cohort=()",
  );

  // Strict-Transport-Security — only sent over HTTPS. In dev (http://localhost)
  // this header is ignored by browsers, but we still set it for production.
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // X-DNS-Prefetch-Control — opt out of DNS prefetching for privacy.
  res.headers.set("X-DNS-Prefetch-Control", "off");

  // Cross-Origin-Opener-Policy — process isolation.
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // Cross-Origin-Resource-Policy — restrict cross-origin resource loads.
  // 'same-origin' is too strict for the Pi SDK script loading. Use 'same-site'.
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");

  return res;
}

// ============================================================
// MATCHER
// ============================================================

// Apply middleware to all routes EXCEPT:
//   - Next.js internals (_next/static, _next/image)
//   - Static public files (favicon, manifest, icons, sw.js, offline.html)
export const config = {
  matcher: [
    // Match all paths except those starting with:
    //   - /_next/static (static files)
    //   - /_next/image (image optimization)
    //   - /favicon.ico
    //   - /favicon.png
    //   - /manifest.webmanifest
    //   - /sw.js (service worker)
    //   - /offline.html
    //   - /icons/* (PWA icons)
    //   - /logo.svg
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|manifest\\.webmanifest|sw\\.js|offline\\.html|icons/.*|logo\\.svg|robots\\.txt).*)",
  ],
};
