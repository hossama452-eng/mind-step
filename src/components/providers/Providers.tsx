"use client";

import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { ReactNode, useEffect, useRef } from "react";
import { PreferenceApplier } from "./PreferenceApplier";
import { signInWithPi, usePiSdk, usePiSession } from "@/lib/pi/client";

interface ProvidersProps {
  /** Locale messages already loaded on the server. */
  messages: Record<string, unknown>;
  locale: string;
  /** Whether the document direction is RTL (Arabic). */
  direction: "rtl" | "ltr";
  children: ReactNode;
}

function PiAuthBootstrap() {
  const { loaded, sdk } = usePiSdk();
  const { session, loading, refresh } = usePiSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (!loaded || !sdk || loading || session || attempted.current) return;
    attempted.current = true;
    void signInWithPi(sdk).then((result) => {
      if (result.ok) void refresh();
    });
  }, [loaded, sdk, loading, session, refresh]);

  return null;
}

export function Providers({ messages, locale, direction, children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      // Respect prefers-reduced-motion + do not flash incorrect theme on load.
      storageKey="mindstep.theme"
    >
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        // Force RTL/LTR on the React tree.
        // The <html dir=...> attribute is already set server-side.
        timeZone={typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined}
      >
        {/* Keep the first render independent from network/PWA queue startup. */}
        <PiAuthBootstrap />
        {children}
        <PreferenceApplier />
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
