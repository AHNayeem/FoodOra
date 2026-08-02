"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * Server Action to persist the visitor's locale choice. Called from the
 * client-side LocaleSwitcher. Setting the cookie + a refresh re-runs the
 * request config, so all `useTranslations` output and <html dir> update.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
