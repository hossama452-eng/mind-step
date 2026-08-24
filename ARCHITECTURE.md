# MindStep Architecture

This document describes the high-level architecture of MindStep as shipped in Phase 1, the planned evolution in Phases 2 and 3, and the rationale behind each major decision.

## 1. Architectural principles

| Principle | What it means in practice |
| --- | --- |
| **Cognitive simplicity first** | The dashboard shows "what matters now" — never a wall of metrics. Every screen has one primary action. |
| **Non-judgmental design** | Streaks celebrate effort, they never threaten. There are no red dots of dread. |
| **Local-first where possible, server-owned where it matters** | UI preferences are persisted in the browser. User-owned data lives server-side, scoped strictly by `userId`. |
| **Type safety end-to-end** | TypeScript strict mode. Prisma generated types. Zod schemas shared between client and server. No `any` in shipping application code. |
| **Strict ownership boundaries** | Every user-owned record carries a `userId` column. Every query is filtered by it. See SECURITY.md. |
| **i18n from line one** | No hard-coded user-facing strings. The html `dir` attribute is driven by the locale. |
| **Calm dark mode** | Dark mode is designed, not inverted. |

## 2. Domains

The application is organized into 8 functional domains. Each domain owns its Prisma models, lib helpers, UI sections, and (in Phase 2) its API routes.

### CORE
- Authentication (Phase 2)
- User Profile
- Preferences (theme, motion, text scale, focus defaults, notifications)
- Notifications (Phase 2)
- Localization (en / ar / fr / zh, with RTL)
- Theme (light / dark / system)
- Consent & AuditLog

### PRODUCTIVITY
- Tasks · Projects · Subtasks · Brain Dump · Planner (P2) · Calendar (P2) · Reminders (P2)

### FOCUS
- Focus Sessions · Focus Timer · Distraction Capture · Focus Recovery (P2) · Focus Statistics (P2)

### ADHD SUPPORT
- I Can't Start · One Step · Reset My Day · Minimum Viable Day · Where Was I? · Welcome Back (P2) · Overwhelm Mode · Transition Assistant (P2) · Working Memory Vault (P2) · Procrastination Rescue (P2)

> ADHD Support tools are surfaced as quick-action cards on the Dashboard and/or as AI Coach contexts. They are intentionally not separate "screens" — they are moments, not destinations.

### LIFE
- Habits · Sleep · Energy · Mood · Chores (P2) · Shopping · Errands · Bills · Subscriptions · Study (P2) · Work (P2) · Meetings (P2)

### AI
- AI Coach · Smart Task Breakdown (P2) · Smart Planner (P2) · Day Rebuilder (P2) · Decision Helper (P2) · Voice Brain Dump (P2) · Personal Insights (P2)

### FAMILY (Phase 3)
- Kids Mode · Parent Dashboard · Homework · Routines · Rewards

### PROFESSIONAL (Phase 3)
- Professional Mode · Progress · Reports · Timeline · Notes · Export · Sharing Permissions

### PI (Phase 2)
- Pi Authentication · Pi SDK · Pi Payments · Premium Entitlements · Payment Verification

## 3. Folder structure

\`\`\`
.
├── prisma/
│   └── schema.prisma                  # All MindStep models (see §4)
├── public/
│   └── logo.svg
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── route.ts               # GET / — health check
│   │   │   └── ai/coach/route.ts      # POST /api/ai/coach — coach reply
│   │   ├── globals.css                # MindStep design tokens
│   │   ├── layout.tsx                 # Root layout — i18n, theme, skip link
│   │   └── page.tsx                   # The AppShell (single visible route in P1)
│   ├── components/
│   │   ├── ui/                        # shadcn/ui primitives (untouched)
│   │   ├── mindstep/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   ├── ActionCard.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── SectionHeader.tsx
│   │   │   └── sections/
│   │   │       ├── DashboardSection.tsx
│   │   │       ├── TasksSection.tsx
│   │   │       ├── BrainDumpSection.tsx
│   │   │       ├── FocusSection.tsx
│   │   │       ├── HabitsSection.tsx
│   │   │       ├── AISection.tsx
│   │   │       ├── SettingsSection.tsx
│   │   │       ├── PrivacySection.tsx
│   │   │       ├── HelpSection.tsx
│   │   │       └── ComingSoonSection.tsx
│   │   └── providers/
│   │       ├── Providers.tsx
│   │       └── PreferenceApplier.tsx
│   ├── hooks/                         # Existing scaffold hooks
│   ├── i18n/
│   │   ├── request.ts                 # next-intl server config + Locale type
│   │   └── messages/
│   │       ├── en.json
│   │       ├── ar.json
│   │       ├── fr.json
│   │       └── zh.json
│   ├── lib/
│   │   ├── constants.ts               # APP_NAME, FOCUS_PRESETS, MEDICAL_DISCLAIMER, AUDIT_ACTIONS, FEATURES
│   │   ├── errors.ts                  # AppError, ErrorCodes, toApiError
│   │   ├── navigation.ts              # NAV_SECTIONS, SectionKey, planned route map
│   │   ├── validations.ts             # All zod schemas shared between client + server
│   │   ├── db.ts                      # Prisma client singleton
│   │   └── utils.ts                   # cn() helper
│   ├── stores/
│   │   ├── ui-store.ts                # Zustand: active section, sidebar state
│   │   └── preferences-store.ts      # Zustand: theme, motion, text scale, focus defaults
│   └── types/                         # (reserved for Phase 2)
├── tests/
│   ├── errors.test.ts
│   ├── i18n.test.ts
│   └── validations.test.ts
├── ARCHITECTURE.md
├── DEVELOPMENT.md
├── ENVIRONMENT.md
├── README.md
├── SECURITY.md
├── next.config.ts
├── package.json
├── prisma/schema.prisma
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
\`\`\`

## 4. Database architecture

Prisma schema lives at `prisma/schema.prisma`. Every user-owned model:

- carries a `userId String` column with `@@index([userId, ...])`,
- uses `onDelete: Cascade` from the user (when the user is deleted, all their data is deleted),
- uses `cuid()` for primary keys (no sequential ID enumeration),
- never stores plaintext passwords (Phase 2 will use Argon2id-hashed passwords),
- never stores Pi wallet passphrases (Pi is verified server-side via the Pi SDK only).

### Entity groups

| Group | Models |
| --- | --- |
| Core | User, Profile, Preferences, Consent, Notification, AuditLog |
| Productivity | Project, Task, Subtask, BrainDump, Reminder, CalendarEvent |
| Focus | FocusSession, Distraction |
| Life | Habit, HabitEntry, SleepEntry, EnergyEntry, MoodEntry, Routine, ShoppingItem, Errand, Bill, Subscription |
| Family | Reward, Achievement, FamilyRelationship |
| Professional | ProfessionalProfile, Report |
| AI | Insight, AIConversation, AIMessage |
| Pi | PremiumEntitlement, PiPayment |

### Ownership invariant

For every query touching user-owned data, the Prisma `where` clause MUST include `userId: <current_user_id>`. This is enforced by:

1. The schema (`userId` column with cascade delete).
2. The server-side auth middleware (Phase 2) that injects `userId` into every API handler.
3. Code review: any PR that adds a query without `userId` is rejected.

See SECURITY.md for the threat model and the `ErrorCodes.NOT_OWNER` taxonomy.

## 5. Routing

### Phase 1 (this release)

A single visible route (`/`) renders the AppShell. Internal navigation between sections (Dashboard, Tasks, etc.) is managed in client state via the Zustand `useUIStore`. This is intentional:

- The sandbox preview only exposes `/` to the user.
- An ADHD-friendly UX benefits from fewer navigation context switches.
- The Phase 2 route split is a mechanical refactor — the section components are already self-contained.

### Phase 2 planned routes

| Route | Section |
| --- | --- |
| `/` | Dashboard |
| `/dashboard` | Dashboard (alias) |
| `/tasks` | Tasks |
| `/projects` | Projects |
| `/brain-dump` | Brain Dump |
| `/focus` | Focus sessions |
| `/planner` | Planner |
| `/calendar` | Calendar |
| `/habits` | Habits |
| `/sleep` | Sleep tracking |
| `/energy` | Energy tracking |
| `/insights` | Personal insights |
| `/ai` | AI Coach |
| `/life` | Life management |
| `/family` | Family mode |
| `/professional` | Professional mode |
| `/reports` | Reports |
| `/settings` | Settings |
| `/privacy` | Privacy & data controls |
| `/help` | Help & disclaimer |

Each route will be localized under `/<locale>/<route>` (e.g., `/ar/tasks`) with locale-prefixed navigation. The `NAV_SECTIONS` array in `src/lib/navigation.ts` is the source of truth for both Phase 1 (sidebar) and Phase 2 (App Router).

## 6. Theme architecture

\`\`\`
User preference  →  next-themes (cookie + class)  →  CSS variables in globals.css  →  Tailwind utilities
\`\`\`

- **Light**: warm cream background, sage primary, sand secondary, clay accent.
- **Dark**: warm charcoal background (not pure black), brighter sage primary for contrast, deeper clay accent.
- **System**: `next-themes` reads `prefers-color-scheme` and falls back to the user's persisted choice.
- **Reduced motion**: applied both via `@media (prefers-reduced-motion: reduce)` and via the `reduce-motion` class on `<html>`.
- **High contrast**: applied via the `high-contrast` class on `<html>` (Phase 2 will add a high-contrast palette).
- **Text scale**: applied as a `font-size` on the `<html>` root, scaling all rem-based utilities.

Tokens live in `src/app/globals.css` under `:root` and `.dark`. MindStep brand accents (`--sage`, `--sand`, `--clay`, `--stone`) are semantic and can be re-skinned without touching component code.

## 7. i18n architecture

\`\`\`
User choice  →  LanguageSwitcher (router.replace)  →  getLocale()  →  <html lang dir>
                                                              ↓
                                            NextIntlClientProvider (messages)
                                                              ↓
                                            useTranslations() in components
\`\`\`

- Locales: `en`, `ar`, `fr`, `zh` (see `src/i18n/request.ts`).
- Direction: Arabic (`ar`) is RTL; the rest are LTR. Applied at the `<html dir>` attribute so the entire document (including scrollbars) honors the direction.
- Strings: `src/i18n/messages/<locale>.json` — flat-ish key structure grouped by feature (`nav`, `dashboard`, `tasks`, `focus`, `habits`, `brainDump`, `ai`, `settings`, `theme`, `language`, `disclaimer`, `footer`).
- No hard-coded user-facing strings in components. The ESLint rule forbidding them is planned for Phase 2.
- RTL-aware utilities: `.rtl-flip` flips directional icons (e.g., arrow `→` becomes `←` in Arabic).

## 8. State management

| State | Where | Why |
| --- | --- | --- |
| UI state (active section, sidebar) | Zustand `useUIStore` | Ephemeral, client-only. Persisted only for sidebar collapse. |
| User preferences | Zustand `usePreferencesStore` | Persisted to localStorage, re-validated with zod on hydration (never trust client state). |
| Server data (tasks, brain dumps, etc.) | TanStack Query (Phase 2) | Cache, retries, optimistic updates. |
| Form state | react-hook-form | Native validation, accessible errors. |

## 9. AI Coach

The AI Coach uses `z-ai-web-dev-sdk` server-side only. The flow:

1. User types a message in the AI section.
2. The client `POST`s to `/api/ai/coach` with `{ message: string }`.
3. The server validates with `createAIMessageSchema`.
4. The server constructs a system prompt that:
   - Forbids medical advice (diagnosis, medication, dosage changes).
   - Directs crisis mentions to local emergency services.
   - Uses a calm, warm, brief tone.
   - Replies in the user's language.
   - Includes the medical disclaimer in long replies.
5. The reply is returned as `{ reply: string }`.

No conversation history is persisted in Phase 1. Phase 2 will load recent `AIConversation` context from the database.

## 10. Performance

| Concern | Strategy |
| --- | --- |
| Code splitting | Next.js App Router auto-splits by route. Section components are dynamic-imported in Phase 2. |
| Lazy loading | shadcn/ui heavy components (e.g., `command`, `drawer`) are already split. |
| Efficient queries | Prisma `select` to project only needed fields. Pagination via `take`/`skip` (default 50, max 200). |
| Caching | TanStack Query `staleTime` per query (Phase 2). In-memory cache for read-heavy prefs. |
| Optimized assets | Next.js Image, font subsetting, `lucide-react` tree-shaking via `optimizePackageImports`. |

## 11. Testing strategy

| Layer | Tool | Coverage in Phase 1 |
| --- | --- | --- |
| Unit | Vitest | lib/validations, lib/errors, i18n/request (48 tests, all passing) |
| Component | Vitest + Testing Library | Phase 2 |
| Integration | Vitest + Prisma test DB | Phase 2 |
| E2E | Playwright | Phase 2 |

Run the suite with `bun run test`. Coverage report: `bun run test:coverage`.

## 12. Phase plan

| Phase | Focus |
| --- | --- |
| **Phase 1 — Foundation** | Design system, i18n, theme, Prisma schema, app shell, key sections, AI Coach API, unit tests, documentation. (This release.) |
| **Phase 2 — Auth + CRUD + Pi** | NextAuth credentials + email magic-link; user-owned CRUD endpoints; full multi-route App Router split; Pi Network sandbox; E2E tests with Playwright; CI pipeline; deployment config. |
| **Phase 3 — Family + Professional + Reports** | Kids Mode, Parent Dashboard, Professional mode, Reports, Insights dashboard, Voice Brain Dump, Smart Task Breakdown. |
