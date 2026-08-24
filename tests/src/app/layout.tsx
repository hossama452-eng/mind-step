import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers/Providers";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getLocaleDirection, localeNames } from "@/i18n/locale";
import type { Locale } from "@/i18n/locale";
import { MEDICAL_DISCLAIMER } from "@/lib/constants";

/**
 * Generate locale-aware metadata — title, description, OG tags all localized.
 *
 * Server-side `getTranslations` resolves the user's locale from the
 * `mindstep.locale` cookie (or Accept-Language header for first-time
 * visitors). The returned metadata is rendered into the initial HTML
 * response — no English flash before JS hydrates (Prompt 03 §12 & §21).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: "app" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const title = `${t("name")} — ${t("tagline")}`;
  const description = t("description");
  const tagline = t("tagline");

  return {
    title,
    description,
    keywords: [
      "ADHD support",
      "productivity",
      "focus",
      "task breakdown",
      "time management",
      "executive function",
      "routine builder",
    ],
    authors: [{ name: "MindStep" }],
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
      apple: [
        { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    manifest: "/manifest.webmanifest",
    applicationName: "MindStep",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "MindStep",
    },
    openGraph: {
      title,
      description: `${description} ${tagline}`,
      siteName: "MindStep",
      type: "website",
      locale: locale.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
    // Hint browsers to treat the page in the user's locale — improves
    // search-engine snippet language and accessibility.
    alternates: {
      canonical: "/",
      languages: {
        en: "/",
        ar: "/",
        fr: "/",
        zh: "/",
      },
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#211d18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = (await getLocale()) as Locale;
  const direction = getLocaleDirection(locale);
  const messages = await getMessages();
  const tAccessibility = await getTranslations({ locale, namespace: "accessibility" });

  // Localized skip-link text — never hardcoded English.
  const skipLinkText = tAccessibility("skipToMain");
  // Localized noscript medical disclaimer (uses constant, but the
  // banner wrapper announces the language tag explicitly so screen
  // readers know it is in the user's locale).
  const currentLanguageName = localeNames[locale];

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:start-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
        >
          {skipLinkText}
        </a>
        <Providers messages={messages} locale={locale} direction={direction}>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
          {/* Live region for locale-change announcements (Prompt 03 §33). */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            id="locale-live-region"
            data-locale={locale}
            data-language={currentLanguageName}
          />
        </Providers>
        {/* Persistent medical disclaimer banner — never removed, never collapsed.
            Inline-styled so it renders even when CSS fails to load. */}
        <noscript>
          <div
            lang={locale}
            dir={direction}
            style={{
              position: "fixed",
              insetInlineStart: 0,
              insetInlineEnd: 0,
              bottom: 0,
              padding: "8px",
              background: "#faf6ef",
              color: "#2b2a26",
              fontSize: "12px",
              textAlign: "center",
              borderTop: "1px solid #e8d9b5",
            }}
          >
            {MEDICAL_DISCLAIMER}
          </div>
        </noscript>
      </body>
    </html>
  );
}
