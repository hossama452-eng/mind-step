import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale } from "@/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/i18n/locale
 * Body: { locale: "en" | "ar" | "fr" | "zh" }
 * Sets a long-lived cookie so the next server render uses the new locale.
 * Returns 200 with the chosen locale; 400 for an invalid input.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const locale = body?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json(
      { error: { code: "invalid_locale", message: "Invalid locale." } },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
