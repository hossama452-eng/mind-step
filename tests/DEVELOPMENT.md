# MindStep Development

A practical guide for working on MindStep: setup, conventions, testing, debugging, and deployment.

## 1. Prerequisites

- **Bun** ≥ 1.3 (package manager + test runner)
- **Node** ≥ 20 (runtime)
- **Git** (version control)

Verify Bun is installed:

\`\`\`bash
bun --version
\`\`\`

If not, install it:

\`\`\`bash
curl -fsSL https://bun.sh/install | bash
\`\`\`

## 2. Setup

\`\`\`bash
# Clone the repository (Phase 2 — for now the project lives in the workspace)
# git clone <repo-url>
# cd mindstep

# Install dependencies
bun install

# Copy environment variables
cp .env .env.local  # adjust values as needed

# Push the Prisma schema to SQLite
bun run db:push

# Start the dev server
bun run dev
# → http://localhost:3000
\`\`\`

The dev server uses Turbopack and runs on port 3000 only. In the sandbox preview, use the **Open in New Tab** button on the right-hand Preview Panel to view the application externally.

## 3. Common scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the Next.js dev server (Turbopack, port 3000). |
| `bun run build` | Production build. Outputs `.next/standalone/`. |
| `bun run start` | Run the production server (after `build`). |
| `bun run lint` | Run ESLint (Next.js core-web-vitals + TypeScript rules). |
| `bun run typecheck` | Run `tsc --noEmit`. |
| `bun run test` | Run the Vitest suite once. |
| `bun run test:watch` | Run Vitest in watch mode. |
| `bun run test:coverage` | Run Vitest with V8 coverage. |
| `bun run db:push` | Push the Prisma schema to the database (destructive — use with care). |
| `bun run db:generate` | Regenerate the Prisma client (after schema changes). |
| `bun run db:migrate` | Create a Prisma migration (Phase 2 — Postgres only). |
| `bun run db:reset` | Reset the database (destroys all data). |

## 4. Code conventions

### TypeScript
- `strict: true`. No `any` in shipping code.
- Prefer `unknown` over `any` when consuming external input.
- Use `type` for unions of primitives; `interface` for object shapes that may be extended.
- Always `import type` for type-only imports.

### React
- Server Components by default. Add `"use client"` only when the component needs state, effects, or browser APIs.
- Never call `setState` synchronously inside `useEffect`. Move derived state to event handlers or `useMemo`.
- Co-locate styles with the component. Use Tailwind utility classes; reach for `cn()` from `@/lib/utils` to merge classes.
- Accessibility: semantic HTML (`<main>`, `<nav>`, `<button>`), `aria-label` on icon-only buttons, `aria-current="page"` on active nav items, visible focus rings (`:focus-visible`).

### Styling
- Use the MindStep semantic color tokens (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`) — never raw colors. This keeps the entire app themable.
- The MindStep palette uses sage (`--primary`), sand (`--secondary`), and clay (`--accent`) — not generic SaaS blue/indigo. **Do not** introduce blue or indigo unless explicitly requested.
- Dark mode is designed, not inverted. Tokens live in `src/app/globals.css` under `.dark`.
- Always pass `constrained_layout=True` to matplotlib figures (this rule applies if we ever add Python chart scripts in Phase 2).

### i18n
- Never hard-code user-facing strings. Use `const t = useTranslations("namespace");` then `t("key")`.
- For server components: `import { getTranslations } from "next-intl/server";`
- New locales require: (1) a new `src/i18n/messages/<locale>.json`, (2) registration in `src/i18n/request.ts` (`locales`, `localeNames`, `localeDirection`).
- Arabic is RTL. Test every new screen with `lang=ar` to ensure the layout holds. Use `.rtl-flip` on directional icons (arrows, chevrons).

### Forms
- All forms use `react-hook-form` + `zod`. The zod schema is the single source of truth — used both client-side (form validation) and server-side (API route validation).
- Schemas live in `src/lib/validations.ts`. Re-export the inferred type from the same file.

### State
- Ephemeral UI state → Zustand store in `src/stores/`.
- Server cache → TanStack Query (Phase 2). Do not duplicate server data in a Zustand store.
- Persisted preferences → `usePreferencesStore` with `partialize` + `merge` (zod re-validation on hydration).

## 5. Database workflow

### Modify the schema

1. Edit `prisma/schema.prisma`.
2. Run `bun run db:push` to apply changes. The `--accept-data-loss` flag is set in the script; only use it in dev.
3. Run `bun run db:generate` to regenerate the Prisma client types.

### Query patterns

\`\`\`ts
// Always include userId in user-owned queries.
import { db } from "@/lib/db";

export async function getTasksForUser(userId: string) {
  return db.task.findMany({
    where: { userId, status: "todo" },
    orderBy: { position: "asc" },
    take: 50, // always paginate
  });
}
\`\`\`

### Testing

\`\`\`bash
bun run test           # one-shot
bun run test:watch     # watch mode
bun run test:coverage  # coverage report at coverage/index.html
\`\`\`

Current Phase 1 coverage: 48 tests across `lib/validations`, `lib/errors`, `i18n/request`. All passing.

Add new tests in `tests/<topic>.test.ts`. Mirror the source folder structure where practical.

## 6. Debugging

### Dev server log

\`\`\`bash
tail -f dev.log
\`\`\`

The dev server writes to `dev.log` in the project root. Inspect it whenever the page renders unexpectedly or an API call fails.

### Prisma

\`\`\`bash
bunx prisma studio   # opens a local DB browser at http://localhost:5555
\`\`\`

Use Prisma Studio only in dev. It writes directly to the database.

### Network

The sandbox runs behind a Caddy gateway (see `Caddyfile`). For mini-services on other ports, append `?XTransformPort=<port>` to API calls. See the fullstack-dev skill for details.

## 7. Build & deploy

### Production build

\`\`\`bash
bun run build
bun run start
\`\`\`

The build outputs to `.next/standalone/` (a self-contained server bundle). Copy `public/` into `.next/standalone/` for static assets (the `build` script does this automatically).

### Deployment architecture (Phase 2 target)

| Component | Where | Notes |
| --- | --- | --- |
| Next.js app | Vercel or self-hosted | Vercel preferred for zero-config. Self-hosted via `bun .next/standalone/server.js` for sovereignty. |
| Postgres | Neon / Supabase / RDS | Serverless pooler recommended. |
| Pi webhook listener | Same Next.js app, `/api/pi/webhook` | Behind the same gateway. Verified via `PI_WEBHOOK_SECRET`. |
| Static assets | Same origin or CDN | Phase 2 will introduce a CDN for user avatars. |
| CI | GitHub Actions | Lint + typecheck + test on every PR; build on merge to main. |

### Environment promotion

1. Open PR against `main`.
2. CI runs `lint`, `typecheck`, `test`. All must pass.
3. Reviewer approves.
4. Merge triggers a preview deployment.
5. Manual promote to production sets `NODE_ENV=production` + the prod env vars.

## 8. Performance budget

| Metric | Target |
| --- | --- |
| Largest Contentful Paint (LCP) | < 2.0s on 4G |
| First Input Delay (FID) | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Initial JS bundle (gzipped) | < 200 KB (Phase 1) · < 300 KB (Phase 2 with auth) |
| Initial CSS bundle (gzipped) | < 30 KB |

If a PR regresses these targets, it is blocked until fixed. Phase 2 will introduce Lighthouse CI to enforce the budget.

## 9. Adding a new section (checklist)

When adding a new MindStep section (e.g., `/sleep`):

1. **Schema** — add the Prisma model in `prisma/schema.prisma` with a `userId` column and `@@index([userId, ...])`. Run `bun run db:push`.
2. **Types & validations** — add the zod schema in `src/lib/validations.ts`. Export the inferred type.
3. **Navigation** — add an entry to `NAV_SECTIONS` in `src/lib/navigation.ts`. Mark `implemented: true` if shipping now, `false` if reserving the route.
4. **i18n** — add a namespace for the new section in every `src/i18n/messages/*.json`.
5. **Section component** — create `src/components/mindstep/sections/<Name>Section.tsx`. Always include `EmptyState`, `LoadingState`, `ErrorState` for the data-driven parts.
6. **AppShell wiring** — add a `case` in `SectionRouter` (in `src/components/mindstep/AppShell.tsx`).
7. **API routes** — Phase 2: add `/api/<section>/route.ts` with zod validation + ownership scoping.
8. **Tests** — add `tests/<section>.test.ts` for any pure logic (zod schemas, helpers).
9. **Docs** — mention the new section in `ARCHITECTURE.md` (§2 Domains) and `README.md`.

## 10. FAQ

**Q: Why is there only one route (`/`) in Phase 1?**
A: The sandbox preview only exposes `/`. Building the entire app as a single-page shell keeps the preview functional. The Phase 2 route split is a mechanical refactor — every section component is already self-contained and the route map is documented in `src/lib/navigation.ts`.

**Q: Why Zustand over Redux / Context only?**
A: Zustand is 1 KB, has no boilerplate, and persists natively. Context-only state causes re-render storms in deeply-nested trees. TanStack Query handles server cache; Zustand handles ephemeral UI state.

**Q: Why is the AI Coach API anonymous in Phase 1?**
A: Auth is a Phase 2 deliverable. The AI Coach route is rate-limited at the gateway in the meantime. The schema (`AIConversation`, `AIMessage`) and the zod schemas are already designed for user-scoped persistence in Phase 2.

**Q: Why is the medical disclaimer repeated in so many places?**
A: Redundancy is intentional. The disclaimer appears in `lib/constants.ts`, the AI system prompt, the AI section UI, the Privacy section, the Help section, and as a `<noscript>` banner. If any one of those fails, the others still cover the user.
