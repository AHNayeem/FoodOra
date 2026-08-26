/**
 * The regions module's published contract.
 *
 * Other modules import from here and nowhere else in this module. In practice they
 * want exactly two things: `REGION_CATALOG` to validate a country or currency code,
 * and `RegionDefaults` to know what an account created there inherits.
 */
export type {
  CountryDetail,
  CountryLanguageRecord,
  CountryPatch,
  CountryRecord,
  CurrencyPatch,
  CurrencyRecord,
  LanguagePatch,
  LanguageRecord,
  NewCountry,
  NewCurrency,
  NewLanguage,
  RegionDefaults,
} from './models';
export {
  isCountryCode,
  isCurrencyCode,
  isDialCode,
  isLocaleCode,
  isTimezone,
  normaliseCountryCode,
  normaliseCurrencyCode,
  normaliseLocaleCode,
} from './policies/codes';
export {
  defaultLanguageOf,
  type LanguageSetEntry,
  normaliseLanguageSet,
} from './policies/language-set';
export { REGION_CATALOG, type RegionCatalogPort } from './ports/region-catalog.port';
export {
  REGIONS_CACHE,
  type RegionsCachePort,
  type RegionSnapshot,
} from './ports/regions-cache.port';
export { REGIONS_REPOSITORY, type RegionsRepositoryPort } from './ports/regions.repository.port';
export { RegionError, type RegionErrorKey } from './region-errors';
