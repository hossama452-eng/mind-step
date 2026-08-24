import "server-only";
/**
 * MindStep — Pi Authentication Service (Prompt 12 §1).
 *
 * Implements the CURRENT official Pi authentication flow:
 *
 *   1. Frontend: `Pi.authenticate(scopes, onIncompletePaymentFound)` returns
 *      `{ accessToken, user: { uid, username } }`.
 *   2. Frontend POSTs `{ accessToken }` to /api/pi/auth.
 *   3. Backend: calls Pi Platform API `GET /me` with the accessToken to
 *      VERIFY the user's identity. NEVER trusts the client-reported uid.
 *   4. Backend: creates or updates a `PiAccount` row keyed by
 *      `(piUid, network)`. The Pi uid is app-specific per Pi's docs.
 *   5. Backend: creates a `PiSession` row with a server-issued opaque
 *      session token. The session token is set as an HTTP-only cookie.
 *   6. The Pi access token is NEVER persisted to the DB. Each subsequent
 *      request re-verifies via the session token, and the access token is
 *      discarded after the initial /me call.
 *
 * === LOGOUT ===
 *
 *   POST /api/pi/logout with the session cookie → marks the session revoked.
 *   The PiAccount and PremiumEntitlement are preserved — they survive logout.
 *
 * === SESSION EXPIRY ===
 *
 *   Pi access tokens are short-lived (per Pi docs). Our session lasts 7 days,
 *   after which the user must re-authenticate. The middleware checks the
 *   session on every protected request.
 *
 * === AUTHENTICATION FAILURE ===
 *
 *   - If the user cancels the Pi auth dialog → frontend reports
 *     `{ cancelled: true }`, no session is created.
 *   - If the accessToken is invalid → /me returns 401, we return 401.
 *   - If the network is misconfigured → we return 503.
 *
 * === COMPLIANCE ===
 *
 *   - NEVER request or store the user's Pi wallet passphrase. We never see
 *     it — the Pi SDK handles wallet interactions entirely.
 *   - Only the minimum scopes are requested: `["username", "payments"]`.
 *   - The accessToken is used ONCE for /me verification, then discarded.
 */

import { db } from "@/lib/db";
import { getPiServerConfig, type PiNetwork } from "./config";
import { getMe, type PiUserDTO } from "./platform-api";
import { randomBytes } from "crypto";

// ============================================================
// CONSTANTS
// ============================================================

export const SESSION_COOKIE_NAME = "mindstep.pi.session";
export const SESSION_DURATION_DAYS = 7;
export const SCOPES = ["username", "payments"];

// ============================================================
// AUTHENTICATE
// ============================================================

export interface AuthenticateInput {
  accessToken: string;
  // Optional — if the client knows its Pi uid and username from the SDK
  // response, we accept them for logging/audit but ALWAYS re-verify via /me.
  reportedUid?: string;
  reportedUsername?: string;
}

export interface AuthenticateResult {
  ok: true;
  userId: string;
  piAccountId: string;
  piUid: string;
  piUsername: string | null;
  network: PiNetwork;
  sessionToken: string;
  expiresAt: Date;
  // Whether a NEW MindStep user was created (vs an existing one re-authenticating).
  createdNewUser: boolean;
}

export interface AuthenticateError {
  ok: false;
  code: "INVALID_TOKEN" | "NETWORK_MISMATCH" | "SERVER_NOT_CONFIGURED" | "INTERNAL_ERROR";
  message: string;
}

/**
 * Verifies a Pioneer's identity using the CURRENT official Pi auth flow.
 *
 * Steps:
 *   1. Calls Pi Platform API `GET /me` with the access token.
 *   2. If 401 → returns { ok: false, code: "INVALID_TOKEN" }.
 *   3. Reads the verified `uid` and `username` from the UserDTO.
 *   4. Upserts a User (creates a placeholder if first time).
 *   5. Upserts a PiAccount keyed by (piUid, network).
 *   6. Creates a new PiSession row with a server-issued opaque token.
 *   7. Returns the session token for cookie setting.
 */
export async function authenticateWithPi(
  input: AuthenticateInput,
  context: { ipAddress?: string; userAgent?: string },
): Promise<AuthenticateResult | AuthenticateError> {
  const cfg = getPiServerConfig();
  if (!cfg.apiKey || !cfg.appId) {
    return {
      ok: false,
      code: "SERVER_NOT_CONFIGURED",
      message: `Pi server is not configured for the ${cfg.network} network. Set PI_APP_ID_${cfg.network.toUpperCase()} and PI_APP_API_KEY_${cfg.network.toUpperCase()}.`,
    };
  }

  // 1. Verify the access token via /me.
  let verifiedUser: PiUserDTO;
  try {
    verifiedUser = await getMe(input.accessToken);
  } catch (err: any) {
    if (err?.status === 401) {
      return { ok: false, code: "INVALID_TOKEN", message: "Pi access token is invalid or expired." };
    }
    return { ok: false, code: "INTERNAL_ERROR", message: err?.message ?? "Verification failed." };
  }

  // 2. The uid is app-specific per Pi docs — must match the server's network.
  const piUid = verifiedUser.uid;
  if (!piUid) {
    return { ok: false, code: "INVALID_TOKEN", message: "/me returned no uid." };
  }
  const piUsername = verifiedUser.username ?? null;

  // 3. Upsert the User. Use a deterministic email derived from piUid+network
  // so re-authentication finds the same user.
  const deterministicEmail = `pi-${cfg.network}-${piUid}@mindstep.app`;
  const user = await db.user.upsert({
    where: { email: deterministicEmail },
    update: {
      name: piUsername ?? `Pi Pioneer ${piUid.slice(0, 8)}`,
    },
    create: {
      email: deterministicEmail,
      name: piUsername ?? `Pi Pioneer ${piUid.slice(0, 8)}`,
    },
    select: { id: true, email: true, name: true, createdAt: true, updatedAt: true },
  });

  // 4. Upsert the PiAccount.
  const piAccount = await db.piAccount.upsert({
    where: { piUid_network: { piUid, network: cfg.network } },
    update: {
      piUsername,
      lastVerifiedAt: new Date(),
    },
    create: {
      userId: user.id,
      piUid,
      piUsername,
      network: cfg.network,
      lastVerifiedAt: new Date(),
      isPrimary: true,
    },
    select: { id: true, userId: true },
  });

  // 5. Mark any previous active sessions for this account as revoked
  // (only one active session per account — Pi doesn't mandate this, but
  // it's safer).
  await db.piSession.updateMany({
    where: { piAccountId: piAccount.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // 6. Create a new session with a server-issued opaque token.
  // 32 bytes = 256 bits of entropy. Use hex encoding for cookie-safety.
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await db.piSession.create({
    data: {
      userId: user.id,
      piAccountId: piAccount.id,
      sessionToken,
      network: cfg.network,
      expiresAt,
      lastUsedAt: new Date(),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    },
  });

  return {
    ok: true,
    userId: user.id,
    piAccountId: piAccount.id,
    piUid,
    piUsername,
    network: cfg.network,
    sessionToken,
    expiresAt,
    createdNewUser: user.email === deterministicEmail && user.createdAt?.getTime() === user.updatedAt?.getTime(),
  };
}

// ============================================================
// SESSION RESOLUTION
// ============================================================

/**
 * Resolves the current user ID from the session cookie.
 * Returns null if there is no session, the session has been revoked,
 * or the session has expired.
 *
 * Updates `lastUsedAt` on the session row (best-effort).
 *
 * This is the function that middleware should call to authenticate
 * requests via Pi sessions.
 */
export async function resolveUserIdFromPiSession(sessionToken: string | null): Promise<string | null> {
  if (!sessionToken) return null;
  const session = await db.piSession.findUnique({
    where: { sessionToken },
    select: {
      id: true,
      userId: true,
      piAccountId: true,
      network: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  // Best-effort: update lastUsedAt (don't block on it).
  try {
    await db.piSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // Ignore — lastUsedAt is best-effort.
  }

  return session.userId;
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Marks a session as revoked. The PiAccount and PremiumEntitlement
 * are preserved — they survive logout (Prompt 12 §4).
 */
export async function logoutSession(sessionToken: string): Promise<void> {
  await db.piSession.updateMany({
    where: { sessionToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ============================================================
// SESSION INFO (for the client to display "signed in as")
// ============================================================

export interface SessionInfo {
  userId: string;
  piUid: string;
  piUsername: string | null;
  network: PiNetwork;
  expiresAt: Date;
  lastUsedAt: Date;
}

export async function getSessionInfo(sessionToken: string): Promise<SessionInfo | null> {
  const session = await db.piSession.findUnique({
    where: { sessionToken },
    select: {
      userId: true,
      piAccountId: true,
      network: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      piAccount: { select: { piUid: true, piUsername: true } },
    },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  return {
    userId: session.userId,
    piUid: session.piAccount.piUid,
    piUsername: session.piAccount.piUsername,
    network: session.network as PiNetwork,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt,
  };
}

// ============================================================
// PRUNE EXPIRED SESSIONS (background job, optional)
// ============================================================

/**
 * Marks sessions past their expiry as revoked. Useful as a periodic
 * cleanup — not strictly required, since resolveUserIdFromPiSession
 * already rejects expired sessions.
 */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.piSession.updateMany({
    where: { expiresAt: { lt: new Date() }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
