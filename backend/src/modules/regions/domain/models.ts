import type { TextDirection } from '../../../shared/enums';

/**
 * Reference data: the countries the platform operates in, the currencies it prices
 * in, and the languages it speaks (D2 §Platform).
 *
 * This module replaces `frontend/config/regions.ts` and the locale list in
 * `frontend/config/i18n/config.ts` — two hard-coded constants that today require a
 * deploy to open a new market. Everything here is keyed by its **natural key**: the
 * ISO code. No surrogate ids, because `"BD"` is already stable, already globally
 * unique, and already what every other table's FK holds.
 */

export interface CurrencyRecord {
  /** ISO 4217, uppercase. */
  code: string;
  symbol: string;
  /**
   * The Intl locale amounts are formatted with, e.g. `"bn-BD"`. Backs
   * `frontend/config/regions.ts::Currency.locale` — which is why BDT renders in
   * Bengali numerals without any component knowing that it does.
   */
  formatLocale: string;
  /** Display digits. 0 for BDT, 2 for most. Storage is always Decimal(14,2). */
  fractionDigits: number;
  isActive: boolean;
  sort: number;
}

export interface CountryRecord {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  name: string;
  currencyCode: string;
  /** IANA zone, e.g. `"Asia/Dhaka"`. Every local-date calculation resolves here. */
  timezone: string;
  dialCode: string;
  /** BCP-47 default for accounts created in this country. */
  defaultLocale: string;
  isActive: boolean;
  sort: number;
}

export interface LanguageRecord {
  /** BCP-47, e.g. `"en"`, `"bn"`, `"ar"`. */
  code: string;
  name: string;
  nativeName: string;
  direction: TextDirection;
  isActive: boolean;
  sort: number;
}

/** Which languages a country is served in, and which one it defaults to. */
export interface CountryLanguageRecord {
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
  sort: number;
}

/** A country with its currency and languages resolved — one read, one object. */
export interface CountryDetail extends CountryRecord {
  currency: CurrencyRecord;
  languages: readonly LanguageRecord[];
}

export type NewCurrency = CurrencyRecord;
export type NewLanguage = LanguageRecord;
export type NewCountry = CountryRecord;

/**
 * A patch is `Partial` minus the key, and `undefined` means "leave alone" — never
 * "set to null". None of these columns is nullable, so there is nothing to clear;
 * the distinction matters in modules where it is, and keeping the convention uniform
 * is cheaper than remembering which is which.
 */
export type CurrencyPatch = Partial<Omit<CurrencyRecord, 'code'>>;
export type CountryPatch = Partial<Omit<CountryRecord, 'code'>>;
export type LanguagePatch = Partial<Omit<LanguageRecord, 'code'>>;

/**
 * What a request needs to know about where it is: the defaults a new account
 * inherits, and the values a price is formatted with.
 *
 * Resolved from the country row rather than from configuration, which is the point of
 * the module — `DEFAULT_CURRENCY=BDT` in an environment file is a fallback for a
 * request with no country, not a statement that Bangladeshis pay in taka.
 */
export interface RegionDefaults {
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
}
