# MindStep — Export Manifest

**Project**: MindStep
**Export date**: 2026-08-22
**Version**: 1.0.0

---

## Build Status

| Check | Result |
|-------|--------|
| Typecheck | PASS |
| Lint | PASS |
| Tests | 545/545 PASS |
| Production build | PASS |

## Languages

- ar (Arabic — RTL)
- en (English)
- fr (French)
- zh (Simplified Chinese)

All 4 locales have 1127 keys each — perfect parity.

## Pi Integration

**Status**: IMPLEMENTED — CONFIGURATION REQUIRED

- Official Pi SDK v2.0 integrated (verified against current docs)
- Full authentication flow (server-verified via Platform API)
- Full payment lifecycle (create → approve → complete → cancel)
- Server-side verification with network mismatch rejection
- Durable premium entitlements
- Test-Pi can never grant mainnet entitlements
- 40 unit tests + 44 end-to-end tests pass

**Configuration required**: Set `PI_APP_ID_TESTNET` and `PI_APP_API_KEY_TESTNET` in `.env`

## Database

**Current database**: SQLite (development)
**Production database**: PostgreSQL (schema is compatible)
**Database file**: `db/custom.db` (EXCLUDED from ZIP — contains dev test data)

## Secrets Excluded

**YES** — No secrets, API keys, passwords, or credentials are included in this archive.

- `.env` file is EXCLUDED (contains only SQLite dev DATABASE_URL — no passwords)
- No hardcoded API keys in source code (verified by secret scan)
- No Pi credentials in any file
- `.env.example` is INCLUDED with safe placeholders only

## Excluded Directories

- `node_modules/`
- `.next/`
- `db/` (SQLite database file)
- `.zscripts/`
- `tool-results/`
- `upload/`
- `download/` (if empty)
- `skills/` (framework skill files, not project source)

## Included Major Directories

- `src/` — Complete application source (app, components, hooks, lib, stores, i18n)
- `prisma/` — Database schema
- `public/` — PWA assets (manifest, service worker, icons, offline page)
- `tests/` — Complete test suite (28 files, 545 tests)
- `scripts/` — Test scripts and icon generation
- `docs/` — Additional documentation (if present)

## Included Configuration Files

- `package.json`
- `bun.lock`
- `next.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `components.json`
- `vitest.config.ts`
- `.env.example`
- `Caddyfile`

## Included Documentation

- `README.md`
- `RELEASE-CHECKLIST.md`
- `THREAT-MODEL.md`
- `PI-INTEGRATION.md`
- `EXPORT-MANIFEST.md`
- `worklog.md` (development log)

## Included PWA Files

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/robots.txt`
- `public/favicon.png`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-maskable-192.png`
- `public/icons/icon-maskable-512.png`
- `public/icons/icon-96.png`
- `public/icons/apple-touch-icon.png`
- `public/icons/icon.svg`
- `public/logo.svg`
