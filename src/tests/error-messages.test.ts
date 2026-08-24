import { describe, it, expect } from "vitest";
import {
  ERROR_CODE_TO_KEY,
  errorCodeToKey,
  toErrorCode,
  buildApiErrorResponse,
} from "@/lib/error-messages";
import { AppError, ErrorCodes } from "@/lib/errors";

describe("ERROR_CODE_TO_KEY — full coverage", () => {
  it("every ErrorCode has a corresponding i18n key path", () => {
    const codes = Object.values(ErrorCodes);
    expect(codes.length).toBe(Object.keys(ERROR_CODE_TO_KEY).length);
    for (const code of codes) {
      expect(ERROR_CODE_TO_KEY[code]).toMatch(/^errors\.codes\./);
    }
  });

  it("NOT_FOUND maps to errors.codes.NOT_FOUND", () => {
    // ErrorCodes.NOT_FOUND === "not_found" (the lowercase string value).
    expect(ERROR_CODE_TO_KEY[ErrorCodes.NOT_FOUND]).toBe("errors.codes.NOT_FOUND");
  });

  it("VALIDATION_ERROR maps to errors.codes.VALIDATION_ERROR", () => {
    expect(ERROR_CODE_TO_KEY[ErrorCodes.VALIDATION_ERROR]).toBe("errors.codes.VALIDATION_ERROR");
  });

  it("AI_SERVICE_ERROR maps to errors.codes.AI_SERVICE_ERROR", () => {
    expect(ERROR_CODE_TO_KEY[ErrorCodes.AI_SERVICE_ERROR]).toBe("errors.codes.AI_SERVICE_ERROR");
  });

  it("PI_SERVICE_ERROR maps to errors.codes.PI_SERVICE_ERROR", () => {
    expect(ERROR_CODE_TO_KEY[ErrorCodes.PI_SERVICE_ERROR]).toBe("errors.codes.PI_SERVICE_ERROR");
  });
});

describe("errorCodeToKey", () => {
  it("returns the i18n key for a known code value", () => {
    expect(errorCodeToKey("not_found")).toBe("errors.codes.NOT_FOUND");
    expect(errorCodeToKey("validation_error")).toBe("errors.codes.VALIDATION_ERROR");
    expect(errorCodeToKey("not_owner")).toBe("errors.codes.NOT_OWNER");
  });

  it("falls back to errors.unknown for unknown codes", () => {
    expect(errorCodeToKey("made_up_code")).toBe("errors.unknown");
  });

  it("falls back to errors.unknown for null / undefined / empty", () => {
    expect(errorCodeToKey(null)).toBe("errors.unknown");
    expect(errorCodeToKey(undefined)).toBe("errors.unknown");
    expect(errorCodeToKey("")).toBe("errors.unknown");
  });
});

describe("toErrorCode", () => {
  it("returns the code from an AppError", () => {
    const err = new AppError(ErrorCodes.NOT_FOUND, "missing");
    expect(toErrorCode(err)).toBe("not_found");
  });

  it("returns INTERNAL_ERROR for unknown thrown values", () => {
    expect(toErrorCode(new Error("postgres refused connection"))).toBe("internal_error");
    expect(toErrorCode("random string")).toBe("internal_error");
    expect(toErrorCode(42)).toBe("internal_error");
    expect(toErrorCode(null)).toBe("internal_error");
    expect(toErrorCode(undefined)).toBe("internal_error");
  });
});

describe("buildApiErrorResponse", () => {
  it("returns the stable code and AppError message", () => {
    const err = new AppError(ErrorCodes.NOT_OWNER, "forbidden");
    const res = buildApiErrorResponse(err);
    expect(res.error.code).toBe("not_owner");
    expect(res.error.message).toBe("forbidden");
  });

  it("returns INTERNAL_ERROR with no message for non-AppError", () => {
    const res = buildApiErrorResponse(new Error("internal stack trace"));
    expect(res.error.code).toBe("internal_error");
    // Internal message is NOT exposed — the client resolves via i18n.
    expect(res.error.message).toBeUndefined();
  });

  it("returns INTERNAL_ERROR for null / undefined", () => {
    expect(buildApiErrorResponse(null).error.code).toBe("internal_error");
    expect(buildApiErrorResponse(undefined).error.code).toBe("internal_error");
  });

  it("preserves AppError details", () => {
    const err = new AppError(ErrorCodes.VALIDATION_ERROR, "bad", {
      details: { field: "title" },
    });
    const res = buildApiErrorResponse(err);
    expect(res.error.details).toEqual({ field: "title" });
  });
});

describe("server error code → client i18n contract", () => {
  it("every error code value maps to a key whose path is `errors.codes.*`", () => {
    const codes = Object.values(ErrorCodes);
    for (const code of codes) {
      const key = errorCodeToKey(code);
      expect(key.startsWith("errors.codes.")).toBe(true);
    }
  });
});
