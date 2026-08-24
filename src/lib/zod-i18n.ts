import { z } from "zod";
import type { Locale } from "@/i18n/locale";

/**
 * Zod → i18n error map.
 *
 * In Zod v4 the error map is set globally via `z.config({ customError })`.
 * In Zod v3 it could be passed per-parse via `{ errorMap }`.
 *
 * To remain version-agnostic, we export:
 *   1. `makeZodErrorMap(t)` — builds a function you can pass to
 *      `z.config({ customError })` (Zod v4) or `{ errorMap }` (Zod v3).
 *   2. `localizeZodIssues(issues, t)` — post-parses a `ZodError.issues`
 *      array into `{ [fieldPath]: localizedMessage }`. This is the
 *      recommended path — it does NOT mutate Zod's global config and
 *      works in any Zod version.
 *   3. `parseWithI18n(schema, input, t)` — wraps `safeParse` and applies
 *      the post-parse localization.
 *
 * NEVER exposes internal exception details to users (Prompt 03 §30, §31).
 */

type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

/** Default translator — returns the key verbatim. Used in tests / SSR. */
const identityTranslator: TranslateFn = (key) => key;

/** Zod issue — typed loosely to remain compatible across versions. */
interface ZodIssueLike {
  code: string;
  message?: string;
  path?: Array<string | number | symbol>;
  expected?: string;
  origin?: string;
  validation?: string;
  inclusive?: unknown;
  keys?: string[];
}

/**
 * Build a Zod error map function. Pass the result to:
 *   - `z.config({ customError: makeZodErrorMap(t) })` (Zod v4 global)
 *   - `{ errorMap: makeZodErrorMap(t) }` (Zod v3 per-parse, deprecated)
 *
 * The translator should be scoped to `validation.*` (e.g.
 * `const t = useTranslations("validation")`).
 */
export function makeZodErrorMap(t: TranslateFn = identityTranslator) {
  return (issue: ZodIssueLike): { message: string } => {
    // Custom messages set on the schema (e.g.
    // `z.string().min(1, { message: "validation.required" })`)
    // take precedence. We detect them by checking if the message looks
    // like an i18n key — i.e., it matches `[a-z]+\.[a-zA-Z._]+`.
    // If the message is the default Zod English text ("Invalid input: ...")
    // we replace it with the localized version.
    if (issue?.message && looksLikeI18nKey(issue.message)) {
      return { message: issue.message };
    }

    const code = issue?.code;
    const origin = issue?.origin;
    const validation = issue?.validation;

    switch (code) {
      case "invalid_type":
        return { message: t("required") };

      case "too_small":
        if (origin === "string") return { message: t("tooShort") };
        if (origin === "array") return { message: t("selectOption") };
        return { message: t("tooShort") };

      case "too_big":
        if (origin === "string") return { message: t("tooLong") };
        return { message: t("tooLong") };

      case "invalid_string":
        if (validation === "email") return { message: t("email") };
        if (validation === "url") return { message: t("invalidUrl") };
        return { message: t("invalidUrl") };

      case "invalid_format":
        // Zod v4 renamed invalid_string to invalid_format
        if (validation === "email") return { message: t("email") };
        if (validation === "url") return { message: t("invalidUrl") };
        return { message: t("invalidUrl") };

      case "invalid_date":
        return { message: t("invalidDate") };

      case "not_finite":
      case "not_multiple_of":
        return { message: t("numberOutOfRange") };

      case "invalid_enum_value":
      case "unrecognized_keys":
      case "invalid_union":
      case "invalid_union_discriminator":
      case "invalid_key":
      case "invalid_element":
      case "invalid_value":
        return { message: t("selectOption") };

      default:
        return { message: t("required") };
    }
  };
}

/**
 * Heuristic: does `s` look like an i18n key path (e.g., `validation.required`,
 * `errors.codes.NOT_FOUND`) rather than a default Zod message
 * (e.g., "Invalid input: expected number, received string")?
 *
 * Used to decide whether to preserve the schema-set message or override
 * it with the localized version.
 */
function looksLikeI18nKey(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  // i18n keys are dot-separated lowercase identifiers, optionally with
  // uppercase final segments (e.g., errors.codes.NOT_FOUND).
  return /^[a-z][a-z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(s);
}

/**
 * Post-parse localization: takes the array of issues from a ZodError and
 * returns a flat `{ [fieldPath]: localizedMessage }` object.
 *
 * This is the recommended path — it does not mutate Zod's global config
 * and works with any Zod version.
 */
export function localizeZodIssues(
  issues: ZodIssueLike[],
  t: TranslateFn = identityTranslator
): Record<string, string> {
  const errorMap = makeZodErrorMap(t);
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const pathKey = (issue.path ?? []).join(".") || "_";
    if (!errors[pathKey]) {
      errors[pathKey] = errorMap(issue).message;
    }
  }
  return errors;
}

/**
 * Wrap `schema.safeParse(input)` with post-parse localization.
 *
 * @example
 *   const { success, data, errors } = parseWithI18n(createTaskSchema, input, t);
 *   if (!success) {
 *     // errors.title === "validation.required" (the resolved message)
 *   }
 */
export function parseWithI18n<T>(
  schema: z.ZodType<T>,
  input: unknown,
  t: TranslateFn = identityTranslator,
  locale: Locale = "en"
):
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = localizeZodIssues(result.error.issues as unknown as ZodIssueLike[], t);
  void locale;
  return { success: false, errors };
}

/**
 * Optionally install the localized error map as Zod's global default.
 * Useful for SSR rendering or any path where `parseWithI18n` can't be
 * used directly (e.g. third-party libraries calling `schema.parse`).
 *
 * WARNING: This sets a GLOBAL default. Only call once at app startup.
 */
export function installZodI18nGlobally(t: TranslateFn): void {
  // Zod v4 API
  const zodAny = z as unknown as { config?: (opts: { customError?: (issue: ZodIssueLike) => { message: string } }) => void };
  if (typeof zodAny.config === "function") {
    zodAny.config({ customError: makeZodErrorMap(t) });
  }
}
