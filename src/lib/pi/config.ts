/**
 * MindStep — Pi Network Integration Configuration (Prompt 12 §5).
 *
 * Clean testnet/mainnet separation. All secrets stay server-side.
 *
 * === ENVIRONMENT VARIABLES ===
 *
 * Required (server-only — never exposed to client):
 *   PI_NETWORK              "testnet" | "mainnet"   (default: "testnet")
 *   PI_APP_ID_TESTNET       Pi app id (from Developer Portal) for testnet
 *   PI_APP_API_KEY_TESTNET  Server API key (testnet) — NEVER in client code
 *   PI_APP_ID_MAINNET       Pi app id for mainnet (production)
 *   PI_APP_API_KEY_MAINNET  Server API key (mainnet) — NEVER in client code
 *
 * Optional (public — safe to expose to client):
 *   PI_SDK_VERSION          defaults to "2.0" (current per Pi docs)
 *   PI_SDK_SCRIPT_URL       defaults to "https://sdk.minepi.com/pi-sdk.js"
 *   PI_API_BASE_URL         defaults to "https://api.minepi.com/v2"
 *
 * === SAFETY GUARANTEES ===
 *
 *  1. The active network is read once at module load (server-only).
 *  2. The Server API Key is ONLY readable from the server config functions —
 *     the client config endpoint NEVER returns it.
 *  3. Test-Pi transactions are marked with `network: "pi_testnet"` and can
 *     NEVER grant real entitlements — see `grantEntitlement()` in
 *     src/lib/pi/entitlements.ts.
 *  4. If the env vars are misconfigured for the active network, all
 *     payment/auth endpoints return 503 Service Unavailable rather than
 *     silently using the wrong-network keys.
 */

// ============================================================
// TYPES
// ============================================================

export type PiNetwork = "testnet" | "mainnet";

export interface PiServerConfig {
  network: PiNetwork;
  appId: string;
  apiKey: string;
  apiBaseUrl: string;
}

export interface PiClientConfig {
  /** The network the SDK should target (controls `sandbox: true|false`). */
  network: PiNetwork;
  /** The SDK script URL (public). */
  sdkScriptUrl: string;
  /** The SDK version (public). */
  sdkVersion: string;
  /** The Pi app id (public — Pi Browser matches this against the Developer Portal). */
  appId: string;
  /** The API base URL (public — clients never use it, but is fine to expose). */
  apiBaseUrl: string;
  /** Whether the SDK should run in sandbox mode. True for testnet. */
  sandbox: boolean;
}

// ============================================================
// READ ENVIRONMENT (server-only)
// ============================================================

function readNetwork(): PiNetwork {
  const raw = (process.env.PI_NETWORK ?? "testnet").toLowerCase();
  if (raw !== "testnet" && raw !== "mainnet") {
    console.warn(`[pi-config] Invalid PI_NETWORK value "${raw}", defaulting to testnet.`);
    return "testnet";
  }
  return raw;
}

function readServerApiKey(network: PiNetwork): string {
  const envVar = network === "testnet" ? "PI_APP_API_KEY_TESTNET" : "PI_APP_API_KEY_MAINNET";
  const key = process.env[envVar];
  if (!key) {
    console.warn(`[pi-config] Missing ${envVar} — Pi server endpoints will be unavailable.`);
    return "";
  }
  return key;
}

function readAppId(network: PiNetwork): string {
  const envVar = network === "testnet" ? "PI_APP_ID_TESTNET" : "PI_APP_ID_MAINNET";
  return process.env[envVar] ?? "";
}

// ============================================================
// SERVER CONFIG (server-only — never import from a client component)
// ============================================================

/**
 * Returns the server-side Pi config (includes the API key).
 * MUST NOT be called from client code or serialized into a response.
 */
export function getPiServerConfig(): PiServerConfig {
  const network = readNetwork();
  return {
    network,
    appId: readAppId(network),
    apiKey: readServerApiKey(network),
    apiBaseUrl: (process.env.PI_API_BASE_URL ?? "https://api.minepi.com/v2").replace(/\/$/, ""),
  };
}

/**
 * Returns true iff the server-side Pi config is usable (i.e., we have an
 * API key for the active network). Endpoints should refuse to act if this
 * returns false.
 */
export function isPiServerConfigured(): boolean {
  const cfg = getPiServerConfig();
  return !!cfg.appId && !!cfg.apiKey;
}

// ============================================================
// CLIENT CONFIG (safe to expose to the client)
// ============================================================

/**
 * Returns the public Pi config that the client SDK needs to initialize.
 * This is safe to expose to the browser — no API keys here.
 */
export function getPiClientConfig(): PiClientConfig {
  const network = readNetwork();
  return {
    network,
    appId: readAppId(network),
    apiBaseUrl: (process.env.PI_API_BASE_URL ?? "https://api.minepi.com/v2").replace(/\/$/, ""),
    sdkScriptUrl: process.env.PI_SDK_SCRIPT_URL ?? "https://sdk.minepi.com/pi-sdk.js",
    sdkVersion: process.env.PI_SDK_VERSION ?? "2.0",
    sandbox: network === "testnet",
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Map our internal network name to the value Pi Platform API returns in
 * PaymentDTO.network ("pi_testnet" | "pi_mainnet"). Used when we persist
 * a payment — we mark it with the network it was created on.
 */
export function networkToPiNetwork(network: PiNetwork): "pi_testnet" | "pi_mainnet" {
  return network === "testnet" ? "pi_testnet" : "pi_mainnet";
}

/**
 * Inverse of networkToPiNetwork. Used when validating an incoming payment
 * came from the same network the server is configured for.
 */
export function piNetworkToNetwork(piNet: string): PiNetwork | null {
  if (piNet === "pi_testnet") return "testnet";
  if (piNet === "pi_mainnet") return "mainnet";
  return null;
}
