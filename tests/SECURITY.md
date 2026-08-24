# MindStep Security

MindStep is a calm, non-judgmental productivity companion. Security is a precondition for trust — the design must be safe by default and explicit about every boundary.

## 1. Secure defaults (non-negotiable)

The following rules are **enforced by code review** and the schema. A pull request that violates any of them is rejected.

| # | Rule | How it is enforced |
| --- | --- | --- |
| 1 | Never put secrets in frontend code | All API routes run on the server (`runtime = "nodejs"`). The client only ever calls `/api/...` via relative paths. Secrets live in environment variables read server-side only. |
| 2 | Never trust client-side authorization | Every user-owned query includes `userId` from the server-side session. The client cannot supply `userId` — it is injected by the auth middleware (Phase 2). |
| 3 | Never store passwords unnecessarily | Phase 2 will use NextAuth credentials with Argon2id-hashed passwords. The `hashedPassword` column on `User` exists for that future. The current Phase 1 schema does not store any password. |
| 4 | Never expose private user data | Every API response is projected: `select` clauses return only the fields the user is allowed to see. The `AuditLog` model records every privileged action. |
| 5 | Never request Pi wallet passphrases | The Pi SDK is integrated server-side only (Phase 2). MindStep never asks for, stores, or transmits the user's wallet passphrase. The `PiPayment` model stores only the `piPaymentId`, `amount`, `product`, and `txid` (after verification). |
| 6 | Never log sensitive information | The `AuditLog.metadata` column is JSON-stringified by a sanitization layer that strips `password`, `token`, `secret`, `apiKey`, `passphrase` keys (Phase 2). The AI coach route logs only the request shape and the error name. |
| 7 | Validate all external input | Every API route uses a zod schema from `src/lib/validations.ts`. Unknown fields are stripped. Out-of-range values throw `AppError(VALIDATION_ERROR, ...)`. |

## 2. Ownership boundaries

Every user-owned record in the database carries a `userId String` column. Every query that touches user-owned data MUST include `userId: <current_user_id>` in the Prisma `where` clause.

\`\`\`prisma
// Correct (Phase 2 — auth middleware injects userId)
await db.task.findMany({
  where: { userId: session.user.id, status: "todo" },
  orderBy: { position: "asc" },
});

// Wrong — would let any user read any other user's tasks.
// Rejected at code review. Also rejected at runtime in Phase 2
// by a Prisma extension that asserts userId is present in every
// user-owned query.
await db.task.findMany({ where: { status: "todo" } });
\`\`\`

The `AppError(ErrorCodes.NOT_OWNER, ...)` is thrown whenever a user attempts to access a record they do not own. This code maps to HTTP 403 and a localized "Not available" message — it never reveals whether the record exists.

## 3. Authentication (Phase 2 architecture)

- Provider: NextAuth.js v4 with the `Credentials` and `Email` (magic-link) providers.
- Password hashing: Argon2id (the OWASP-recommended choice as of 2024).
- Session strategy: JWT with rotating tokens, signed with `NEXTAUTH_SECRET`.
- Session cookie: `secure`, `httpOnly`, `sameSite=lax`.
- Magic-link email: short TTL (15 minutes), single-use, IP-pinned.

Phase 1 has no authentication — the AI Coach API is anonymous but rate-limited at the gateway. This is intentional: Phase 1 is foundation-only.

## 4. Medical safety boundaries

MindStep is not a medical tool. The boundaries are enforced at three layers:

1. **System prompt** — the AI Coach is instructed never to diagnose, never to recommend medication, and to defer crisis mentions to local emergency services. See `src/app/api/ai/coach/route.ts`.
2. **UI surface** — every AI Coach screen surfaces the medical disclaimer. The Privacy and Help sections repeat it. The root layout includes a `<noscript>` banner.
3. **Refusal rules** — the AI Coach refuses to answer questions like "should I increase my dosage?" and instead directs the user to their prescriber.

## 5. Threat model (summary)

| Threat | Mitigation |
| --- | --- |
| **IDOR** — user A reads user B's tasks | Strict `userId` ownership in every query. `AppError(NOT_OWNER)` on mismatch. |
| **CSRF** — cross-site request forgery | Next.js App Router handlers use the `Origin` header check. Auth cookies are `sameSite=lax`. |
| **XSS** — user content rendered unsafely | React escapes by default. Markdown (Phase 3) uses `react-markdown` with `rehype-sanitize`. |
| **Prompt injection** — user attempts to override the AI system prompt | The system prompt is read-only. User content is the user message only, never concatenated into the system prompt. Output is post-processed to strip injection patterns. |
| **Token leakage** — JWT or session cookie exposed | Cookies are `httpOnly`, `secure`. Secrets live in env vars. No `console.log` of secrets. |
| **PII over-logging** — audit log captures sensitive fields | Audit log metadata is sanitized (Phase 2). The AI coach logs only error names, not message bodies. |
| **Pi payment fraud** — fake `piPaymentId` submitted | Server verifies every payment via the Pi SDK before marking it `completed`. The `txid` is only set after blockchain confirmation. |
| **Rate abuse** — anonymous AI coach flooded | Gateway rate-limit (Phase 2): 20 requests / minute / IP. Returns `ErrorCodes.RATE_LIMITED` (HTTP 429). |

## 6. Responsible disclosure

If you discover a security vulnerability in MindStep, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Email security@mindstep.app (Phase 2 — currently no inbox; use the project repository's private security advisories).
3. Include a clear description, reproduction steps, and (if possible) a fix suggestion.
4. You will receive an acknowledgement within 72 hours and a fix timeline within 14 days.

We credit responsible reporters in the release notes by default, or anonymously on request.

## 7. GDPR / privacy rights (architecture)

- **Right to access**: Phase 2 will ship a `/api/me/export` endpoint that returns every user-owned record as a JSON archive.
- **Right to erasure**: `/api/me/delete` deletes the user and cascades to every owned record (Prisma `onDelete: Cascade` is set in the schema).
- **Right to withdraw consent**: the `Consent` model records per-purpose opt-ins. Withdrawing consent disables the feature; data remains for a cooling-off period then is purged.
- **AI conversation retention**: conversations older than 30 days are auto-purged unless pinned by the user.
- **No third-party tracking**: MindStep ships zero analytics SDKs in Phase 1. Phase 2 will add privacy-preserving, self-hosted Plausible (no cookies, no PII).

## 8. Secrets management

| Secret | Where it lives | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `.env` (dev) / deployment env (prod) | SQLite path in dev; Postgres URL in prod (Phase 2). |
| `NEXTAUTH_SECRET` | `.env` (dev) / secrets manager (prod) | Used to sign JWTs. Rotated quarterly. |
| `PI_API_KEY` / `PI_APP_ID` | `.env` | Read server-side only. Never exposed to the client. |
| `PI_WEBHOOK_SECRET` | `.env` | Used to verify Pi webhook signatures (Phase 2). |

The `.env` file is gitignored. The committed `.env.example` (Phase 2) documents every variable without values. See ENVIRONMENT.md for the full list.

## 9. Audit log

The `AuditLog` model records every privileged action:

\`\`\`prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?                  // null for anonymous actions (e.g., failed login)
  action    String                   // see AUDIT_ACTIONS in lib/constants.ts
  resource  String                   // model name
  resourceId String?
  metadata  String?                  // JSON-stringified, sanitized
  ipAddress String?
  createdAt DateTime @default(now())
}
\`\`\`

Action codes live in `src/lib/constants.ts` under `AUDIT_ACTIONS`. New actions are append-only — values are never reused.
