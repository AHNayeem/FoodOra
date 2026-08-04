/**
 * i18n keys, never prose (D5 §Errors). Namespaced under `regions.*` so they can be
 * translated as a group, and listed in one object so the frontend's translation files
 * have a single place to be checked against.
 */
export const RegionError = {
  unknownCountry: 'regions.errors.unknownCountry',
  unknownCurrency: 'regions.errors.unknownCurrency',
  unknownLanguage: 'regions.errors.unknownLanguage',

  invalidCountryCode: 'regions.errors.invalidCountryCode',
  invalidCurrencyCode: 'regions.errors.invalidCurrencyCode',
  invalidLocaleCode: 'regions.errors.invalidLocaleCode',
  invalidDialCode: 'regions.errors.invalidDialCode',
  invalidTimezone: 'regions.errors.invalidTimezone',

  countryExists: 'regions.errors.countryExists',
  currencyExists: 'regions.errors.currencyExists',
  languageExists: 'regions.errors.languageExists',

  /** A country cannot point at a currency that is switched off or absent. */
  currencyNotAvailable: 'regions.errors.currencyNotAvailable',
  languageNotAvailable: 'regions.errors.languageNotAvailable',

  /**
   * Deactivating the last active country, or a country that accounts still live in.
   * `Country.code` is an FK from `users`, `vendor_branches` and `delivery_zones` with
   * `onDelete: Restrict`, so the database would refuse a delete anyway — this refuses
   * it in a language the admin screen can render.
   */
  countryInUse: 'regions.errors.countryInUse',
  currencyInUse: 'regions.errors.currencyInUse',
  lastActiveCountry: 'regions.errors.lastActiveCountry',
  lastActiveLanguage: 'regions.errors.lastActiveLanguage',
  /** A country must be served in at least one language, and one must be the default. */
  noDefaultLanguage: 'regions.errors.noDefaultLanguage',
} as const;

export type RegionErrorKey = (typeof RegionError)[keyof typeof RegionError];
