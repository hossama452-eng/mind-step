"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { errorCodeToKey } from "@/lib/error-messages";
import type { ErrorCode } from "@/lib/errors";

/**
 * Client-side hook for resolving stable server error codes into
 * localized user-facing messages.
 *
 * Server returns `{ error: { code, message? } }`. The client reads
 * the `code`, looks up the corresponding i18n key, and renders the
 * localized text via next-intl.
 *
 * @example
 *   const { getMessage } = useLocalizedError();
 *   const message = getMessage("NOT_FOUND");
 *
 * See Prompt 03 §31 & §32.
 */
export function useLocalizedError() {
  const t = useTranslations("errors");

  const getMessage = useCallback(
    (code: ErrorCode | string | undefined | null): string => {
      const key = errorCodeToKey(code);
      // Strip the leading "errors." prefix because the translator is
      // already scoped to "errors".
      try {
        const scopedKey = key.replace(/^errors\./, "");
        return t(scopedKey as never) as string;
      } catch {
        return t("unknown");
      }
    },
    [t]
  );

  return { getMessage };
}
