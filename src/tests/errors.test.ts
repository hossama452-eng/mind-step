import { describe, it, expect } from "vitest";
import {
  AppError,
  ErrorCodes,
  toApiError,
  type ErrorCode,
} from "@/lib/errors";

describe("AppError", () => {
  it("uses default status code when none is provided", () => {
    const err = new AppError(ErrorCodes.NOT_FOUND, "missing");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("not_found");
  });
  it("allows overriding the status code", () => {
    const err = new AppError(ErrorCodes.VALIDATION_ERROR, "bad input", {
      statusCode: 422,
    });
    expect(err.statusCode).toBe(422);
  });
  it("preserves details", () => {
    const err = new AppError(ErrorCodes.VALIDATION_ERROR, "bad input", {
      details: { field: "title" },
    });
    expect(err.details).toEqual({ field: "title" });
  });
});

describe("toApiError", () => {
  it("serializes AppError to a JSON-friendly shape", () => {
    const err = new AppError(ErrorCodes.NOT_OWNER, "forbidden", {
      details: { resource: "task" },
    });
    expect(toApiError(err)).toEqual({
      error: {
        code: "not_owner",
        message: "forbidden",
        details: { resource: "task" },
      },
    });
  });
  it("masks unknown errors as internal_error", () => {
    const result = toApiError(new Error("PostgreSQL connection refused: db password is hunter2"));
    expect(result.error.code).toBe("internal_error");
    // The original error message must NEVER leak.
    expect(result.error.message).not.toContain("hunter2");
  });
});

describe("error code taxonomy — status codes", () => {
  const cases: Array<[ErrorCode, number]> = [
    [ErrorCodes.VALIDATION_ERROR, 400],
    [ErrorCodes.INVALID_INPUT, 400],
    [ErrorCodes.UNAUTHORIZED, 401],
    [ErrorCodes.SESSION_EXPIRED, 401],
    [ErrorCodes.FORBIDDEN, 403],
    [ErrorCodes.NOT_OWNER, 403],
    [ErrorCodes.NOT_FOUND, 404],
    [ErrorCodes.CONFLICT, 409],
    [ErrorCodes.RATE_LIMITED, 429],
    [ErrorCodes.INTERNAL_ERROR, 500],
  ];
  for (const [code, expected] of cases) {
    it(`${code} → ${expected}`, () => {
      const err = new AppError(code, "x");
      expect(err.statusCode).toBe(expected);
    });
  }
});
