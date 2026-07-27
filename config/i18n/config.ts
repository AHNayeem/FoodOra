/**
 * i18n configuration — the set of supported locales and their metadata.
 * The platform requirement is multi-language + RTL; this is the single source
 * of truth consumed by the request config, the locale switcher and <html dir>.
 */

export const locales = ["en", "bn", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie key used to persist the visitor's locale choice (no URL segment). */
export const LOCALE_COOKIE = "FOODORA_LOCALE";

export interface LocaleMeta {
  code: Locale;
  label: string; // English label
  native: string; // endonym
  dir: "ltr" | "rtl";
  flag: string; // emoji flag for the switcher
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  en: { code: "en", label: "English", native: "English", dir: "ltr", flag: "🇬🇧" },
  bn: { code: "bn", label: "Bengali", native: "বাংলা", dir: "ltr", flag: "🇧🇩" },
  ar: { code: "ar", label: "Arabic", native: "العربية", dir: "rtl", flag: "🇸🇦" },
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return localeMeta[locale].dir;
}
