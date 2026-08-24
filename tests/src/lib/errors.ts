/**
 * MindStep error taxonomy.
 * Every error returned by the server has a `code` from this enum,
 * so the client can render a localized, actionable message.
 */
export const ErrorCodes = {
  // 400-class
  VALIDATION_ERROR: "validation_error",
  INVALID_INPUT: "invalid_input",
  INVALID_LOCALE: "invalid_locale",

  // 401-class
  UNAUTHORIZED: "unauthorized",
  SESSION_EXPIRED: "session_expired",

  // 403-class
  FORBIDDEN: "forbidden",
  NOT_OWNER: "not_owner",         // user attempted to read/modify another user's record
  CONSENT_REQUIRED: "consent_required",
  FEATURE_DISABLED: "feature_disabled",

  // 404-class
  NOT_FOUND: "not_found",

  // 409-class
  CONFLICT: "conflict",
  DUPLICATE: "duplicate",

  // 422-class
  BUSINESS_RULE_VIOLATION: "business_rule_violation",

  // 429-class
  RATE_LIMITED: "rate_limited",

  // 500-class
  INTERNAL_ERROR: "internal_error",
  DATABASE_ERROR: "database_error",
  AI_SERVICE_ERROR: "ai_service_error",
  PI_SERVICE_ERROR: "pi_service_error",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = options?.statusCode ?? defaultStatusFor(code);
    this.details = options?.details;
  }
}

function defaultStatusFor(code: ErrorCode): number {
  switch (code) {
    case ErrorCodes.VALIDATION_ERROR:
    case ErrorCodes.INVALID_INPUT:
    case ErrorCodes.INVALID_LOCALE:
      return 400;
    case ErrorCodes.UNAUTHORIZED:
    case ErrorCodes.SESSION_EXPIRED:
      return 401;
    case ErrorCodes.FORBIDDEN:
    case ErrorCodes.NOT_OWNER:
    case ErrorCodes.CONSENT_REQUIRED:
    case ErrorCodes.FEATURE_DISABLED:
      return 403;
    case ErrorCodes.NOT_FOUND:
      return 404;
    case ErrorCodes.CONFLICT:
    case ErrorCodes.DUPLICATE:
      return 409;
    case ErrorCodes.BUSINESS_RULE_VIOLATION:
      return 422;
    case ErrorCodes.RATE_LIMITED:
      return 429;
    default:
      return 500;
  }
}

/** Standard JSON error response shape — used by all API routes. */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function toApiError(error: unknown): ApiErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  // Unknown shape — never leak internals to the client.
  return {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: "An unexpected error occurred.",
    },
  };
}
