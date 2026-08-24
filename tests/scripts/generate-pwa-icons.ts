/**
 * Generate PWA icons from the source SVG logo.
 * Produces: icon-192, icon-512, icon-maskable-192, icon-maskable-512, favicon.
 *
 * The "calm sage" palette is hard-coded here so that icons match the brand
 * even when the SVG is rendered as a flat raster (PNGs cannot use Tailwind
 * CSS variables). Colors:
 *   - background: warm cream / sage (#7c9885 + #faf6ef gradient)
 *   - mark: white (logo path)
 *
 * Run: `bun run scripts/generate-pwa-icons.ts`
 */

import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";

const ICONS_DIR = path.resolve(process.cwd(), "public/icons");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

// Brand colors (must match src/app/globals.css design tokens).
const CREAM = "#faf6ef";
const SAGE = "#7c9885";
const DARK = "#211d18";

// SVG source — a single clean "M" monogram on a sage rounded square.
// The same SVG is reused for all sizes; `sharp` rasterizes it per-size.
function monogramSvg(size: number, maskable: boolean): string {
  // Maskable icons need a "safe zone" — content kept inside the inner 80% of the canvas.
  // Non-maskable icons can use the full canvas.
  const padding = maskable ? size * 0.1 : 0;
  const inner = size - padding * 2;
  const logoSize = inner * 0.62;
  const logoOffset = (size - logoSize) / 2;
  const radius = maskable ? 0 : Math.floor(size * 0.18); // maskable must be full-bleed

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${SAGE}" />
      <stop offset="100%" stop-color="#5e7a6a" />
    </linearGradient>
    <linearGradient id="mark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${CREAM}" />
      <stop offset="100%" stop-color="#f0e6d0" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)" />
  <g transform="translate(${logoOffset}, ${logoOffset})">
    <!-- M monogram — three strokes forming an M shape -->
    <path d="M ${logoSize * 0.15} ${logoSize * 0.78}
             L ${logoSize * 0.15} ${logoSize * 0.22}
             L ${logoSize * 0.5} ${logoSize * 0.6}
             L ${logoSize * 0.85} ${logoSize * 0.22}
             L ${logoSize * 0.85} ${logoSize * 0.78}"
          stroke="url(#mark)"
          stroke-width="${logoSize * 0.1}"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none" />
    <!-- One small dot — represents "one step" -->
    <circle cx="${logoSize * 0.5}" cy="${logoSize * 0.92}" r="${logoSize * 0.04}" fill="${CREAM}" />
  </g>
</svg>`;
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const sizes: Array<{ name: string; size: number; maskable: boolean }> = [
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-maskable-192.png", size: 192, maskable: true },
    { name: "icon-maskable-512.png", size: 512, maskable: true },
    { name: "icon-96.png", size: 96, maskable: false }, // small favicon-ish
    { name: "apple-touch-icon.png", size: 180, maskable: false },
  ];

  for (const { name, size, maskable } of sizes) {
    const svg = Buffer.from(monogramSvg(size, maskable));
    await sharp(svg).png().toFile(path.join(ICONS_DIR, name));
    console.log(`✓ ${name} (${size}x${size}${maskable ? " maskable" : ""})`);
  }

  // Favicon — small PNG (most browsers support PNG favicons now).
  const faviconSvg = Buffer.from(monogramSvg(32, false));
  await sharp(faviconSvg).png().toFile(path.join(PUBLIC_DIR, "favicon.png"));
  console.log("✓ favicon.png (32x32)");

  // Also write a public SVG version (any-purpose, scalable).
  const scalableSvg = monogramSvg(512, false);
  await sharp(Buffer.from(scalableSvg)).png().toFile(path.join(ICONS_DIR, "icon-512.png")); // regenerate to ensure consistency
  // Save the SVG source too — useful for debugging and brand consistency.
  const { writeFile } = await import("fs/promises");
  await writeFile(path.join(ICONS_DIR, "icon.svg"), scalableSvg, "utf8");
  console.log("✓ icon.svg (scalable source)");

  console.log("\nAll PWA icons generated.");
}

main().catch((err) => {
  console.error("Failed to generate PWA icons:", err);
  process.exit(1);
});
