# MindStep — Pi Network Integration

This document describes MindStep's integration with the **Pi Network** SDK
and Platform API. It is the canonical reference for the integration.

**Last updated**: 2026-08-22
**SDK version**: 2.0 (current per Pi docs as of this writing)
**Official reference docs**:
- https://minepi.com/developers/
- https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/piAppPlatform/piAppPlatformSDK
- https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/piAppPlatform/piAppPlatformAPIs
- https://pi-apps.github.io/community-developer-guide/docs/importantTopics/paymentFlow/piPaymentFlow
- https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md

If the official docs change, follow the **CURRENT** documentation, not this
file. This file documents MindStep's _usage_ of the Pi APIs, not the Pi
APIs themselves.

---

## 1. Architecture overview

MindStep's Pi integration lives in **`src/lib/pi/`**. Pi-specific code is
NOT scattered throughout the application — all Pi Network calls go through
the dedicated service.

| File | Purpose |
|------|---------|
| `src/lib/pi/config.ts` | Environment-driven config (testnet/mainnet separation, no secrets in client code). |
| `src/lib/pi/products.ts` | Centrally-configured payment products (PREMIUM_MONTHLY, etc.). |
| `src/lib/pi/platform-api.ts` | Server-side calls to `api.minepi.com/v2/*` — getMe, getPayment, approvePayment, completePayment, cancelPayment. |
| `src/lib/pi/auth.ts` | Pi auth flow — verify access token via `/me`, upsert PiAccount, create PiSession (opaque token in HTTP-only cookie). |
| `src/lib/pi/payments.ts` | Payment lifecycle service — create record, approve, complete, cancel, sync, get state, get history. |
| `src/lib/pi/entitlements.ts` | Durable premium entitlement — persists across logout/login/refresh/new device. Only grants after full Pi verification. |
| `src/lib/pi/client.ts` | Client-side SDK loader + typed wrappers for `Pi.authenticate`, `Pi.createPayment`, plus session polling. |

API routes (all under `/api/pi/`):
- `GET /api/pi/status` — health-check (public)
- `GET /api/pi/client-config` — public config for the SDK (no secrets)
- `POST /api/pi/auth` — verify access token via `/me`, create session
- `GET /api/pi/auth` — get current session info
- `POST /api/pi/logout` — revoke session
- `GET /api/pi/products` — list configured products (public)
- `POST /api/pi/payments` — record pending payment (with idempotency key)
- `GET /api/pi/payments/[id]` — get payment state (for polling)
- `POST /api/pi/payments/[id]/approve` — server-side /approve (Pi Platform API)
- `POST /api/pi/payments/[id]/complete` — server-side /complete + grant entitlement
- `POST /api/pi/payments/[id]/cancel` — server-side /cancel
- `POST /api/pi/payments/[id]/sync` — re-fetch payment state from Pi Servers (recovery)
- `GET /api/pi/payments/history` — user's payment history (sanitized)
- `GET /api/pi/entitlement` — current premium entitlement

UI:
- `src/components/mindstep/sections/PiAccountSection.tsx` — Pi Account section in the sidebar.
- Loaded automatically when the user navigates to "Pi Account".

---

## 2. SDK version and current documentation reference

The Pi SDK is loaded from:
\`\`\`
https://sdk.minepi.com/pi-sdk.js
\`\`\`

Initialization (current per Pi docs):
\`\`\`html
<script src="https://sdk.minepi.com/pi-sdk.js"></script>
<script>
  Pi.init({ version: "2.0", sandbox: true /* true for testnet, false for mainnet */ });
</script>
\`\`\`

**Important**: As of this writing, version 2.0 is the current stable version.
If Pi releases a newer version, update `PI_SDK_VERSION` in `.env` and
verify against the official docs.

MindStep's `usePiSdk()` hook (`src/lib/pi/client.ts`) loads the SDK
script tag dynamically and calls `Pi.init()` with the active network's
sandbox flag.

The SDK ONLY works inside the **Pi Browser**. On Chrome/Safari/etc,
`window.Pi` is undefined — MindStep's UI gracefully falls back to a
"Open this page in the Pi Browser" banner.

---

## 3. Authentication flow

The CURRENT official Pi authentication flow is:

1. **Frontend**: `Pi.authenticate(scopes, onIncompletePaymentFound)` opens
   the Pi auth dialog. Returns `{ accessToken, user: { uid, username } }`.
   - `scopes`: `["username", "payments"]` (the only scopes MindStep needs).
   - `onIncompletePaymentFound`: callback for resuming incomplete payments
     (MindStep handles this in the payment service).

2. **Frontend**: POST `/api/pi/auth` with `{ accessToken, reportedUid, reportedUsername }`.

3. **Backend**: `src/lib/pi/auth.ts` `authenticateWithPi()`:
   - Calls Pi Platform API `GET /me` with `Authorization: Bearer <accessToken>`.
   - If 401 → reject with `INVALID_TOKEN` (token tampered or expired).
   - The `/me` response contains the **verified** `uid` — MindStep NEVER
     trusts the client-reported uid.
   - Upserts a `User` row (deterministic email derived from `piUid+network`).
   - Upserts a `PiAccount` row keyed by `(piUid, network)`.
   - Marks any previous active sessions for this account as revoked
     (one session per account — not mandated by Pi, but safer).
   - Creates a `PiSession` row with a server-issued opaque 32-byte token
     (256 bits of entropy).
   - The session token is set as an HTTP-only cookie (`mindstep.pi.session`)
     — the access token is NEVER persisted.

4. **Subsequent requests**: `requireUserId()` in `src/lib/auth.ts` reads
   the session cookie, calls `resolveUserIdFromPiSession()` which
   queries the PiSession table.

5. **Logout**: `POST /api/pi/logout` revokes the session. The `PiAccount`
   and `PremiumEntitlement` are PRESERVED — they survive logout
   (Prompt 12 §4).

6. **Session expiry**: Sessions last 7 days (`SESSION_DURATION_DAYS`).
   On expiry, the user must re-authenticate. `resolveUserIdFromPiSession()`
   automatically rejects expired sessions.

7. **Authentication failure**:
   - User cancels Pi dialog → frontend reports `{ ok: false, code: "USER_CANCELLED" }`.
   - Access token invalid → backend returns 401 with `INVALID_TOKEN`.
   - Server not configured → backend returns 503 with `SERVER_NOT_CONFIGURED`.

### Compliance

- **NEVER** request or store the user's Pi wallet passphrase. The Pi SDK
  handles wallet interactions entirely — MindStep never sees the passphrase.
- Only the minimum scopes are requested: `["username", "payments"]`.
- The `accessToken` is used ONCE for `/me` verification, then discarded.

---

## 4. Payment flow

The CURRENT official Pi payment flow is documented at
https://pi-apps.github.io/community-developer-guide/docs/importantTopics/paymentFlow/piPaymentFlow

It has **3 phases**:

### Phase I — Payment creation & server-side approval

1. **Frontend** calls `Pi.createPayment(paymentData, callbacks)`. The Pi
   Payment Flow UI opens but cannot be interacted with yet.
2. SDK fires `onReadyForServerApproval(paymentId)`.
3. **Frontend** POSTs `/api/pi/payments` with `{ productKey, piPaymentId, idempotencyKey, amount, currency }`.
   - Backend validates `productKey` against the centrally-configured products.
   - Backend validates `amount` + `currency` match the product's configured value.
   - Backend creates a `PiPayment` row with status `pending` and the active network.
4. **Frontend** POSTs `/api/pi/payments/[id]/approve`.
   - Backend calls Pi Platform API `POST /payments/{id}/approve` with `Authorization: Key <API_KEY>`.
   - Updates `PiPayment.status` to `developer_approved` and stores the PaymentDTO.

### Phase II — Pioneer interaction & blockchain transaction

5. The Pi Payment Flow becomes interactive. The Pioneer confirms in their
   Pi Wallet, signs the transaction, and submits it to the Pi blockchain.
6. The blockchain completes the transaction. The Pi Servers notify the SDK.

### Phase III — Server-side completion

7. SDK fires `onReadyForServerCompletion(paymentId, txid)`.
8. **Frontend** POSTs `/api/pi/payments/[id]/complete` with `{ txid }`.
   - Backend calls Pi Platform API `POST /payments/{id}/complete` with `{ txid }`.
   - The returned `PaymentDTO` is checked: `status.developer_completed`
     AND `status.transaction_verified` MUST both be true.
   - The payment's `network` field must match the server's active network.
   - Only then is `grantEntitlementFromPayment()` called.
9. Backend updates `PiPayment.status` to `completed`, sets `completedAt`
   and `txid`.

### Cancellation

- The user can cancel in the Pi Wallet at any time. SDK fires `onCancel(paymentId)`.
- The frontend can also call `/api/pi/payments/[id]/cancel` directly.
- Backend calls Pi Platform API `POST /payments/{id}/cancel` for safety
  (idempotent — safe to call on already-cancelled payments).

### Error handling

- Every step catches errors and persists them on the `PiPayment.error` field
  (JSON `{ code, message, retryable }`).
- The frontend can poll `/api/pi/payments/[id]` to display the current state.
- `/api/pi/payments/[id]/sync` re-fetches the state from Pi Servers (recovery).

### Duplicate prevention

- The client generates a unique `idempotencyKey` per purchase attempt.
- `PiPayment.clientPaymentIdempotencyKey` has a `@unique` constraint.
- Re-calling `/api/pi/payments` with the same `idempotencyKey` returns the
  existing payment row (no new row created).
- `piPaymentId` also has `@unique` — prevents the same Pi payment from
  being recorded twice with different idempotency keys.

### Critical security: NEVER trust the frontend

- The client-reported `amount` is VALIDATED against the centrally-configured
  product value. A malicious client cannot pay 0.001 Pi for PREMIUM_LIFETIME.
- The userId is taken from the session, never from the request body.
- The network is taken from the server config, never from the client.
- The entitlement is only granted after Pi's `/complete` returns a PaymentDTO
  with `developer_completed: true` AND `transaction_verified: true`.
  The frontend cannot fake this — only the Pi Servers can set these flags.

---

## 5. Premium entitlements

Premium entitlements are **durable** across:
- ✅ Logout — persisted in the DB keyed by `userId` (not session).
- ✅ Login — re-read from the DB on every auth.
- ✅ Refresh — read from the DB in `requireUserId()` on each request.
- ✅ New device — read from the DB by `userId` — works on any device.
- ✅ App restart — read from the DB on startup.

**NEVER** rely on frontend localStorage. The frontend can read the
entitlement for display, but every server-side feature gate MUST call
`getActiveEntitlement(userId)` which reads from the DB.

### Entitlement lifecycle

- **Free**: default state — no row, or `status: "free"`.
- **Active**: `status: "active"` AND `expiresAt > now` (or `expiresAt IS NULL` for lifetime).
- **Expired**: `status: "active"` AND `expiresAt < now` — auto-transitioned
  to `status: "expired"` on the next read.
- **Cancelled**: revoked manually via `revokeEntitlement()`.

### Renewals

- Buying the same product again EXTENDS the existing `expiresAt` by the
  product's duration (e.g., buying 1 month twice = 2 months total).
- Buying LIFETIME supersedes everything (sets `expiresAt` to NULL).

### Idempotency

- `grantEntitlementFromPayment()` checks for an existing entitlement with
  the same `grantingPaymentId` (FK to PiPayment). If found, returns it
  without re-granting.
- The `grantingPaymentId` field has a `@unique` constraint — guarantees
  one entitlement per payment.

---

## 6. Testnet / mainnet separation

**NEVER** mix Test-Pi and Mainnet configuration on the same server.

### Environment variables (server-only)

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `PI_NETWORK` | No (default: `testnet`) | Active network: `testnet` or `mainnet`. |
| `PI_APP_ID_TESTNET` | Yes (testnet) | Public app id from Pi Developer Portal. |
| `PI_APP_API_KEY_TESTNET` | Yes (testnet) | Server API key — NEVER in client code. |
| `PI_APP_ID_MAINNET` | Yes (mainnet) | Public app id (production). |
| `PI_APP_API_KEY_MAINNET` | Yes (mainnet) | Server API key — NEVER in client code. |
| `PI_SDK_VERSION` | No (default: `2.0`) | SDK version to pass to `Pi.init()`. |
| `PI_SDK_SCRIPT_URL` | No (default: `https://sdk.minepi.com/pi-sdk.js`) | SDK script URL. |
| `PI_API_BASE_URL` | No (default: `https://api.minepi.com/v2`) | Platform API base URL. |

### Safety guarantees

1. The active network is read once at module load.
2. The Server API Key is ONLY readable from `getPiServerConfig()` — the
   client config endpoint (`/api/pi/client-config`) NEVER returns it.
3. **Test-Pi transactions can NEVER grant real entitlements.**
   - Every `PiPayment` row records its `network` (e.g., `pi_testnet`).
   - `grantEntitlementFromPayment()` rejects if the payment's network
     doesn't match the server's active network.
   - Even if a malicious client tried to forge a PaymentDTO from testnet
     to mainnet, the network mismatch check would reject it.
4. If the env vars are misconfigured for the active network, all
   payment/auth endpoints return 503 rather than silently using the
   wrong-network keys.

### Switching from testnet to mainnet

1. Set `PI_NETWORK=mainnet` in your production `.env`.
2. Set `PI_APP_ID_MAINNET` and `PI_APP_API_KEY_MAINNET` from the Pi
   Developer Portal (production app).
3. Restart the server.
4. Verify via `GET /api/pi/status` — it should return
   `{ network: "mainnet", configured: true }`.
5. **Testnet data is preserved** — existing `PiAccount` rows on
   `pi_testnet` are NOT deleted. They simply won't be used for auth
   when the server is on mainnet. New auth attempts will create
   new `PiAccount` rows on `pi_mainnet`.

---

## 7. Payment products

Products are centrally-configured in `src/lib/pi/products.ts`:

\`\`\`typescript
export const PRODUCTS: Record<ProductKey, Product> = {
  PREMIUM_MONTHLY:  { amount: 1,  currency: "PI", durationDays: 30,  ... },
  PREMIUM_YEARLY:   { amount: 9,  currency: "PI", durationDays: 365, ... },
  PREMIUM_LIFETIME: { amount: 50, currency: "PI", durationDays: null, ... },
};
\`\`\`

### Adding a new product

1. Add the entry to `PRODUCTS` in `src/lib/pi/products.ts`.
2. Add the product key to the `ProductKey` type.
3. Add localized strings to `src/i18n/messages/{en,ar,fr,zh}.json`.
4. Run tests + verify the new product is returned by `/api/pi/products`.

### Why central config?

- **Prevents tampering**: the server validates `amount` and `currency`
  against the centrally-configured value. A malicious client cannot pay
  0.001 Pi for PREMIUM_LIFETIME.
- **Single source of truth**: UI screens fetch the product list from
  `/api/pi/products` — no hard-coded product info anywhere.
- **Easy to add**: a new product is one entry in `PRODUCTS`.

---

## 8. Payment history

Stored in the `PiPayment` table. Per Prompt 12 §7, we store the minimum
required transaction info:

- `piPaymentId`: the Pi payment identifier (returned by `Pi.createPayment`).
- `amount`, `currency`, `product`: payment details.
- `status`: lifecycle state.
- `txid`: blockchain transaction id (only after Pi confirms the blockchain tx).
- `network`: which network the payment was made on.
- `verifiedAt`, `completedAt`, `cancelledAt`: lifecycle timestamps.
- `error`: sanitized error message (the raw error is internal — never
  exposed to the client).

The `piPaymentDTO` field stores the full Pi Platform API PaymentDTO as
JSON for audit purposes. This is server-side only — the client never
sees it.

`GET /api/pi/payments/history` returns a sanitized list:
- The `error` field is replaced with "An error occurred." (no internal context).
- The `piPaymentDTO` is NOT returned.

---

## 9. Pi App Studio compatibility

The final architecture is **suitable for deployment through Pi App Studio's
external AI/vibe-coding integration flow**.

### What runs in the external application backend (MindStep)

- All of `src/lib/pi/*` (config, products, platform-api, auth, payments, entitlements).
- All `/api/pi/*` routes.
- All Pi Platform API calls (server-to-server, using the Server API Key).
- All entitlement persistence (Prisma + DB).
- Session management (cookies + PiSession table).

### What Pi App Studio can configure

- The Pi App ID (which appears in the Pi Developer Portal).
- The Server API Key (which the app generates in the Developer Portal).
- The app's URL (Development URL and Production URL).
- The app's scopes (`username`, `payments`).

### Deployment requirements

1. The app must be accessible via HTTPS (required by the Pi SDK).
2. The app must run on a domain that's registered in the Pi Developer
   Portal as either the Development URL or the Production URL.
3. The app must expose `/api/pi/*` routes publicly (no IP allowlist).
4. The Server API Key MUST be set as an environment variable on the
   server — NEVER in client code, NEVER in a `.env` file committed
   to a public repo.
5. The database (Prisma + SQLite/Postgres) must be persistent —
   premium entitlements survive across deployments.

### What Pi App Studio does NOT support

- Arbitrary backend infrastructure beyond what MindStep already provides.
- The MindStep server is the canonical backend — Pi App Studio is just
  the configuration + distribution layer.

---

## 10. Compliance

MindStep follows current Pi requirements. **NEVER**:

- ❌ Ask for wallet passphrases (we never see them — Pi SDK handles wallet).
- ❌ Fake Pi transactions (every transaction goes through the real Pi SDK).
- ❌ Claim a transaction is confirmed when it is not (we verify via
  `/complete` and check `transaction_verified` + `developer_completed`).
- ❌ Use unsupported payment methods (we only use the official Pi SDK
  `Pi.createPayment`).
- ❌ Misrepresent Pi affiliation (MindStep is a third-party app on the
  Pi Apps Platform — not affiliated with the Pi Core Team).
- ❌ Store unnecessary identity information (we only store the
  app-specific `uid` and optional `username`; we never see wallet
  addresses or passphrases).

A compliance banner is shown at the top of the Pi Account section in the
UI to make these guarantees visible to the user.

---

## 11. Verification flow (end-to-end)

When a user purchases MindStep Premium:

1. **User opens the Pi Account section** in the MindStep UI.
2. **User clicks "Sign in with Pi"** → `Pi.authenticate(["username", "payments"], ...)` is called.
3. **Frontend POSTs to `/api/pi/auth`** with the `accessToken`.
4. **Backend** calls `GET /me` with the access token → verifies identity.
5. **Backend creates session** → sets `mindstep.pi.session` HTTP-only cookie.
6. **User sees the products grid** (fetched from `/api/pi/products`).
7. **User clicks "Get Yearly"** → frontend generates `idempotencyKey` and calls `Pi.createPayment(...)`.
8. **SDK fires `onReadyForServerApproval(paymentId)`** → frontend POSTs to:
   - `/api/pi/payments` (records the pending payment with idempotency key)
   - `/api/pi/payments/[id]/approve` (backend calls Pi Platform API `/approve`)
9. **Pi Wallet opens** → user confirms the transaction.
10. **Blockchain tx completes** → SDK fires `onReadyForServerCompletion(paymentId, txid)`.
11. **Frontend POSTs to `/api/pi/payments/[id]/complete`** with `{ txid }`.
12. **Backend** calls Pi Platform API `POST /payments/{id}/complete` with `{ txid }`.
13. **Backend verifies** `developer_completed === true && transaction_verified === true`.
14. **Backend verifies** the PaymentDTO's `network` matches the server's active network.
15. **Backend grants entitlement** via `grantEntitlementFromPayment()`.
16. **Frontend polls** `/api/pi/payments/[id]` → sees `status: "completed"` → shows success.
17. **Frontend refreshes** `/api/pi/entitlement` → sees the new premium plan.

If any step fails, the user can:
- Click "Refresh" on the payment history to trigger `/sync` (re-fetches from Pi Servers).
- Contact support with the `piPaymentId` for manual entitlement grant.

---

## 12. Failure handling

### Authentication failures

| Failure | What happens |
|---------|--------------|
| User cancels Pi dialog | Frontend shows "You cancelled the Pi sign-in." |
| Access token invalid | Backend returns 401 with `INVALID_TOKEN`. |
| Server not configured | Backend returns 503 with `SERVER_NOT_CONFIGURED`. |
| Network error | Backend returns 500 with generic message. |

### Payment failures

| Failure | What happens |
|---------|--------------|
| User cancels payment | SDK fires `onCancel(paymentId)` → frontend POSTs to `/cancel` → backend calls Pi Platform API `/cancel`. |
| Amount mismatch | Backend rejects with `INVALID_PRODUCT` (product validation fails). |
| Idempotency key reused | Backend returns existing payment row (no double-charge). |
| Pi `/approve` fails | Backend logs error on `PiPayment.error`, returns 400. User can retry. |
| Pi `/complete` fails | Backend logs error on `PiPayment.error`. User can click "Refresh" → `/sync` retries. |
| Entitlement grant fails | Backend logs error. The payment is marked completed on Pi's side, but no entitlement was granted. User can contact support with the `piPaymentId`. |
| Network mismatch (test→main) | Backend rejects with `NETWORK_MISMATCH`. No entitlement granted. |

### Session expiry

- Sessions last 7 days (`SESSION_DURATION_DAYS`).
- On expiry, `resolveUserIdFromPiSession()` returns null → `requireUserId()`
  throws `UNAUTHORIZED`.
- Frontend receives 401 → shows "Your session has expired. Please sign in again."

### Unverified payments

- If the client reports `onReadyForServerCompletion` but the Pi `/complete`
  call returns a PaymentDTO without `transaction_verified: true`, the
  entitlement is **NOT granted**.
- The `PiPayment.status` is set to whatever Pi reports (e.g.,
  `user_approved` if the tx isn't verified yet).
- The user can trigger `/sync` later to re-check.

### Duplicate callbacks

- The SDK may fire callbacks multiple times (network retries).
- All our endpoints are idempotent:
  - `/approve` is idempotent on Pi's side (safe to call again).
  - `/complete` checks if the payment is already completed → returns
    the existing state without re-calling Pi.
  - `/cancel` is idempotent on Pi's side.

### Network failure (frontend ↔ backend)

- If the frontend can't reach `/approve` or `/complete`, the payment is
  left in the `pending` or `developer_approved` state.
- The user can navigate to the Pi Account section → click "Refresh" →
  triggers `/sync` which re-fetches from Pi Servers and auto-grants
  the entitlement if the payment is now fully verified.

### Backend failure (backend ↔ Pi)

- If the backend can't reach `api.minepi.com/v2`, the Pi API call fails
  with a non-2xx status.
- The error is logged on `PiPayment.error` (sanitized).
- The user can retry or contact support.

---

## 13. Deployment requirements

### Production checklist

- [ ] Set `PI_NETWORK=mainnet` in the production environment.
- [ ] Set `PI_APP_ID_MAINNET` from the Pi Developer Portal (production app).
- [ ] Set `PI_APP_API_KEY_MAINNET` from the Pi Developer Portal — NEVER
      in client code, NEVER in a public repo.
- [ ] Verify `GET /api/pi/status` returns `{ network: "mainnet", configured: true }`.
- [ ] Verify the app's Production URL is registered in the Pi Developer Portal.
- [ ] Verify the app is deployed via HTTPS (required by the Pi SDK).
- [ ] Verify the database is persistent (Postgres recommended for production).
- [ ] Verify `secure: true` is set on the session cookie (handled automatically
      when `NODE_ENV=production`).

### Test environment checklist

- [ ] Set `PI_NETWORK=testnet` in the test environment.
- [ ] Set `PI_APP_ID_TESTNET` and `PI_APP_API_KEY_TESTNET` from the Pi
      Developer Portal (test app).
- [ ] Verify the app's Development URL is registered in the Pi Developer
      Portal (use the Sandbox URL for local dev).
- [ ] Authorize the sandbox (open the Pi App → Pi Utilities → Authorize Sandbox).
- [ ] Verify `GET /api/pi/status` returns `{ network: "testnet", configured: true }`.

---

## 14. Testing

Unit tests (`tests/pi-integration.test.ts`):
- Config separation (testnet/mainnet, no API key leak)
- Product validation (reject amount tampering, unknown products)
- Payment status normalization
- `isPaymentFullyVerified` (rejects testnet PaymentDTO on mainnet server, vice versa)
- Entitlement idempotency
- Entitlement grant safety checks

End-to-end tests (`scripts/test-pi-api.ts`):
- Authentication (sign-in flow, logout, session expiry)
- Products (list, validate)
- Payments (create, approve, complete, cancel, sync)
- Duplicate callback prevention
- Unverified payment rejection
- Network failure handling (simulated)
- Entitlement persistence across logout/login
- Cross-user isolation

Run:
\`\`\`bash
bun run test tests/pi-integration.test.ts
bun run scripts/test-pi-api.ts  # requires dev server
\`\`\`

---

## 15. Final notes

- This integration uses ONLY current, officially documented Pi SDK and
  Platform API methods. No deprecated patterns.
- The frontend NEVER decides if a payment is successful — only the Pi
  Servers (via `/complete` returning `transaction_verified: true`) do.
- Premium entitlements are durable across all the required scenarios
  (logout, login, refresh, new device, app restart).
- Test-Pi transactions can NEVER grant real entitlements — even if they
  reach our backend via a misconfigured client.
- The Server API Key is NEVER exposed to the client. The client config
  endpoint returns only public values (appId, sandbox flag, SDK URL).
