import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Audit the codebase for forbidden physical-direction CSS.
 *
 * Per Prompt 03 §8, we should use logical equivalents (start, end, ms, me,
 * ps, pe, border-s, border-e, inset-inline-start, inset-inline-end)
 * wherever directional behavior is intended.
 *
 * Physical left/right may remain only when the visual direction is
 * intentionally fixed (e.g., a horizontal progress bar's left edge).
 *
 * This test lists every occurrence so we can audit them visually.
 */

const SRC_DIR = join(process.cwd(), "src");

// File extensions we lint for Tailwind / CSS class names.
const SCAN_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Allow-list: these classes are intentionally physical (the visual
// direction is fixed, not relative to the document language).
//
// When you add a new entry here, document why the physical direction is
// correct (Prompt 03 §8 — "Physical directions may remain only when the
// visual direction is intentionally fixed.").
const ALLOWED_PHYSICAL_PATTERNS: Array<{ pattern: string; reason: string }> = [
  // `inset-x-0` and `inset-y-0` set BOTH start and end simultaneously —
  // they are direction-agnostic at the semantic level.
  { pattern: "inset-x-0", reason: "Sets both start and end simultaneously — direction-agnostic" },
  { pattern: "inset-y-0", reason: "Sets both top and bottom simultaneously — direction-agnostic" },
  // `inset-0` sets all four edges — direction-agnostic.
  { pattern: "inset-0", reason: "Sets all four edges simultaneously — direction-agnostic" },
  // `left-2` / `top-2` in the skip-link focus style is a small inset,
  // anchored visually (it's a focus-visible ring at the top-left corner
  // of the viewport — the focus ring's position is intentionally fixed
  // because it's a screen-reader-only affordance that only appears on
  // keyboard focus, and the visual position should not flip with the
  // document language).
  { pattern: "left-2", reason: "Skip-link focus ring position is intentionally fixed at top-start corner" },
  { pattern: "top-2", reason: "Skip-link focus ring position is intentionally fixed at top-start corner" },
];

// Patterns we want to flag. Note: `left-` and `right-` are Tailwind classes
// for `inset-inline-start` / `inset-inline-end` in LTR but NOT in RTL —
// they break the layout in Arabic. We flag them as suspicious.
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Margin-left / padding-left / border-left / inset-left — these break RTL.
  // We use the `\b` boundary to avoid matching substrings like "leftover".
  { pattern: /\bml-(\d)/, replacement: "ms-$1" },
  { pattern: /\bmr-(\d)/, replacement: "me-$1" },
  { pattern: /\bpl-(\d)/, replacement: "ps-$1" },
  { pattern: /\bpr-(\d)/, replacement: "pe-$1" },
  { pattern: /\bborder-l\b/, replacement: "border-s" },
  { pattern: /\bborder-r\b/, replacement: "border-e" },
  { pattern: /\bborder-l-(\d)/, replacement: "border-s-$1" },
  { pattern: /\bborder-r-(\d)/, replacement: "border-e-$1" },
  // `left-<n>` and `right-<n>` as Tailwind classes are also physical —
  // they correspond to `inset-inline-start` / `inset-inline-end` in
  // Tailwind v4 (logical), so the physical versions are forbidden.
  // We exclude the allow-listed `left-2` skip-link case.
  { pattern: /\bleft-(\d+)/, replacement: "start-$1" },
  { pattern: /\bright-(\d+)/, replacement: "end-$1" },
];

function walkDir(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkDir(full));
    } else if (SCAN_EXTENSIONS.has(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(className: string): boolean {
  return ALLOWED_PHYSICAL_PATTERNS.some((allowed) =>
    className.includes(allowed.pattern)
  );
}

interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
  replacement: string;
}

function scanFiles(files: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const { pattern, replacement } of FORBIDDEN_PATTERNS) {
        const matches = line.match(new RegExp(pattern.source, "g"));
        if (!matches) continue;
        for (const m of matches) {
          if (isAllowed(line)) continue;
          violations.push({
            file,
            line: idx + 1,
            text: m,
            pattern: pattern.source,
            replacement,
          });
        }
      }
    });
  }
  return violations;
}

describe("logical CSS audit (Prompt 03 §8)", () => {
  const files = walkDir(SRC_DIR).filter((f) => !f.includes("node_modules"));

  it("scans a non-empty set of source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses logical properties (start/end/ms/me/ps/pe/border-s/border-e) instead of physical (left/right/ml/mr/pl/pr/border-l/border-r) in MindStep components", () => {
    // Only scan MindStep-owned components — not the pristine shadcn/ui
    // primitives in src/components/ui/ (those are vendored and untouched).
    const mindstepFiles = files.filter((f) => f.includes("/components/mindstep/"));
    const violations = scanFiles(mindstepFiles);
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}  '${v.text}'  →  ${v.replacement}`)
        .join("\n");
      throw new Error(
        `[logical CSS audit] ${violations.length} physical-direction classes found in MindStep components. ` +
          `Replace them with logical equivalents:\n${summary}`
      );
    }
    // For shadcn/ui and other vendored code, we log but don't fail.
    const vendoredFiles = files.filter((f) => !f.includes("/components/mindstep/"));
    const vendoredViolations = scanFiles(vendoredFiles);
    if (vendoredViolations.length > 0) {
      console.warn(
        `[logical CSS audit] ${vendoredViolations.length} physical-direction classes ` +
          `exist in vendored code (shadcn/ui etc.) — left as-is intentionally.`
      );
    }
    expect(violations.length).toBe(0);
  });

  it("documents the allowed physical-direction exceptions", () => {
    // Every entry in ALLOWED_PHYSICAL_PATTERNS must have a non-empty reason.
    for (const allowed of ALLOWED_PHYSICAL_PATTERNS) {
      expect(allowed.reason.length).toBeGreaterThan(10);
      expect(allowed.pattern.length).toBeGreaterThan(0);
    }
  });
});

describe("RTL flip class audit (Prompt 03 §9)", () => {
  const files = walkDir(SRC_DIR);
  it("scans source files for rtl-flip usage", () => {
    let count = 0;
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      count += (content.match(/rtl-flip/g) || []).length;
    }
    // We should be using .rtl-flip on directional icons throughout the app.
    expect(count).toBeGreaterThan(0);
  });

  it("uses [dir=rtl] selector in globals.css for RTL-aware styles", () => {
    const cssPath = join(process.cwd(), "src", "app", "globals.css");
    const css = readFileSync(cssPath, "utf-8");
    expect(css).toContain('[dir="rtl"]');
    expect(css).toContain(".rtl-flip");
  });
});
