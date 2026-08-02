import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * next-intl request config (no URL-segment routing).
 *
 * The active locale is read from a cookie so routes stay clean (`/restaurants`
 * rather than `/en/restaurants`). Messages are lazily imported per request.
 * When we later add SEO-friendly localized URLs, only this file + middleware
 * need to change — components already read strings via `useTranslations`.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
