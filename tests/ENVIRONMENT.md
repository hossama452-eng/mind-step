# MindStep Environment Variables

All environment variables are read server-side only. None are exposed to the browser bundle. The `.env` file is gitignored — copy `.env.example` to `.env.local` for local development.

## Required for Phase 1 (this release)

| Name | Example | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | Prisma datasource URL. SQLite for local dev; Postgres for production (Phase 2). |
| `NODE_ENV` | `development` | Standard Node environment flag. Set to `production` for prod builds. |
| `APP_NAME` | `MindStep` | Application name shown in metadata and the title bar. |

## Required for Phase 2

| Name | Example | Purpose |
| --- | --- | --- |
| `NEXTAUTH_URL` | `http://localhost:3000` | The canonical app URL used to construct auth redirects. |
| `NEXTAUTH_SECRET` | `<32+ random bytes>` | Secret used to sign NextAuth JWTs. **Generate with `openssl rand -base64 32`**. Never commit. |
| `PI_API_KEY` | `<from Pi developer console>` | Server-side Pi SDK key. |
| `PI_APP_ID` | `<from Pi developer console>` | Pi application ID. |
| `PI_API_BASE` | `https://api.testnet.minepi.com` | Pi API base URL. Use the testnet for development. |
| `PI_WEBHOOK_SECRET` | `<from Pi developer console>` | Used to verify incoming Pi webhook signatures. |

## Optional

| Name | Default | Purpose |
| --- | --- | --- |
| `AI_COACH_ENABLED` | `true` | Feature flag for the AI Coach. When `false`, the AI section shows a disabled state and the `/api/ai/coach` route returns `FEATURE_DISABLED`. |
| `NEXT_PUBLIC_APP_NAME` | `MindStep` | Public-readable app name (exposed to the client bundle). Only used for non-sensitive branding. |

## Reading variables in code

\`\`\`ts
// Server-side only — never in "use client" files.
import { env } from "@/lib/env"; // Phase 2 — zod-validated env accessor

// Phase 1 pattern (simpler):
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is required");
\`\`\`

## Forbidden patterns

| Pattern | Why |
| --- | --- |
| `NEXT_PUBLIC_PI_API_KEY` | Never expose API keys to the client bundle. |
| Hard-coding secrets in `.ts` / `.tsx` | Secrets must live in env vars only. |
| `console.log(process.env.NEXTAUTH_SECRET)` | Logging secrets is a critical security incident. |
| Reading Pi wallet passphrases | MindStep never asks for, stores, or transmits passphrases. |

## Generating a NEXTAUTH_SECRET

\`\`\`bash
openssl rand -base64 32
\`\`\`

Paste the output as the value of `NEXTAUTH_SECRET` in your `.env.local` file. Do not commit the file.

## Environment parity

Phase 2 will introduce three environments:

| Env | `DATABASE_URL` | `PI_API_BASE` | Notes |
| --- | --- | --- | --- |
| `development` | `file:./dev.db` | `https://api.testnet.minepi.com` | Local dev. SQLite + Pi testnet. |
| `staging` | Postgres URL | `https://api.testnet.minepi.com` | Pre-prod. Postgres + Pi testnet. |
| `production` | Postgres URL | `https://api.minepi.com` | Prod. Postgres + Pi mainnet. |

Each environment uses a distinct `NEXTAUTH_SECRET`. The `NODE_ENV` variable controls build optimizations.
