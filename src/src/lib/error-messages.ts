import type { Locale } from "@/i18n/locale";
import { ErrorCodes, type ErrorCode, AppError } from "@/lib/errors";

/**
 * Stable server error code → i18n key mapping.
 *
 * Server returns stable error codes (e.g. `VALIDATION_ERROR`, `NOT_OWNER`).
 * Client maps each code to a localized message via the `errors.codes.*`
 * dictionary keys.
 *
 * NEVER compare English error strings — always compare error codes.
 * See Prompt 03 §31 & §32.
 */

/** Map of every ErrorCode to its i18n key path. */
export const ERROR_CODE_TO_KEY: Record<ErrorCode, string> = {
  [ErrorCodes.VALIDATION_ERROR]: "errors.codes.VALIDATION_ERROR",
  [ErrorCodes.INVALID_INPUT]: "errors.codes.INVALID_INPUT",
  [ErrorCodes.INVALID_LOCALE]: "errors.codes.INVALID_LOCALE",
  [ErrorCodes.UNAUTHORIZED]: "errors.codes.UNAUTHORIZED",
  [ErrorCodes.SESSION_EXPIRED]: "errors.codes.SESSION_EXPIRED",
  [ErrorCodes.FORBIDDEN]: "errors.codes.FORBIDDEN",
  [ErrorCodes.NOT_OWNER]: "errors.codes.NOT_OWNER",
  [ErrorCodes.CONSENT_REQUIRED]: "errors.codes.CONSENT_REQUIRED",
  [ErrorCodes.FEATURE_DISABLED]: "errors.codes.FEATURE_DISABLED",
  [ErrorCodes.NOT_FOUND]: "errors.codes.NOT_FOUND",
  [ErrorCodes.CONFLICT]: "errors.codes.CONFLICT",
  [ErrorCodes.DUPLICATE]: "errors.codes.DUPLICATE",
  [ErrorCodes.BUSINESS_RULE_VIOLATION]: "errors.codes.BUSINESS_RULE_VIOLATION",
  [ErrorCodes.RATE_LIMITED]: "errors.codes.RATE_LIMITED",
  [ErrorCodes.INTERNAL_ERROR]: "errors.codes.INTERNAL_ERROR",
  [ErrorCodes.DATABASE_ERROR]: "errors.codes.DATABASE_ERROR",
  [ErrorCodes.AI_SERVICE_ERROR]: "errors.codes.AI_SERVICE_ERROR",
  [ErrorCodes.PI_SERVICE_ERROR]: "errors.codes.PI_SERVICE_ERROR",
};

/**
 * Returns the i18n key path for an error code.
 * Falls back to `errors.unknown` if the code is unknown.
 *
 * @example
 *   errorCodeToKey("NOT_FOUND")
 *   // "errors.codes.NOT_FOUND"
 */
export function errorCodeToKey(code: ErrorCode | string | undefined | null): string {
  if (code && code in ERROR_CODE_TO_KEY) {
    return ERROR_CODE_TO_KEY[code as ErrorCode];
  }
  return "errors.unknown";
}

/**
 * Resolve a server-side error code to a localized user-facing message
 * using a synchronous translator.
 *
 * Use this in Server Components or API routes where the locale is known
 * at request time.
 *
 * @example
 *   const message = getLocalizedErrorMessage("NOT_FOUND", locale, t);
 */
export function getLocalizedErrorMessage(
  code: ErrorCode | string | undefined | null,
  locale: Locale,
  translate: (key: string, values?: Record<string, unknown>) => string
): string {
  // The translator is `useTranslations` from next-intl on the client,
  // or `getTranslations` on the server.
  try {
    return translate(errorCodeToKey(code));
  } catch {
    // If the key is missing, fall back to the unknown message.
    return translate("errors.unknown");
  }
}

/**
 * Convert an unknown thrown value into a stable error code.
 * Used by API route handlers when catching unexpected exceptions.
 *
 * AppError instances carry their code; everything else becomes
 * INTERNAL_ERROR.
 */
export function toErrorCode(err: unknown): ErrorCode {
  if (err instanceof AppError) return err.code;
  return ErrorCodes.INTERNAL_ERROR;
}

/**
 * Standard JSON error response shape — returned by all API routes.
 * `code` is the stable identifier; `message` is the localized text
 * (resolved on the client); `details` is optional structured data.
 */
export interface LocalizedApiErrorResponse {
  error: {
    code: ErrorCode;
    /** The server returns the code; the client resolves the locale-specific message. */
    message?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Build a JSON error response with the stable code.
 * The client reads `code` and resolves the localized message.
 */
export function buildApiErrorResponse(err: unknown): LocalizedApiErrorResponse {
  const code = toErrorCode(err);
  return {
    error: {
      code,
      // We include the message from AppError (often English/dev-only) for
      // backwards compatibility, but the client should prefer the
      // localized version keyed off `code`.
      message: err instanceof AppError ? err.message : undefined,
      details: err instanceof AppError ? err.details : undefined,
    },
  };
}
