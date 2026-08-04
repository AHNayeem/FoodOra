import type {
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
} from '../models';

export const REGIONS_REPOSITORY = Symbol('REGIONS_REPOSITORY');

/**
 * Reference data, read and written.
 *
 * Every `list*` takes `includeInactive` rather than exposing a filter object: there
 * are exactly two callers — the public switcher, which wants what it may offer, and
 * the admin screen, which wants everything — and a boolean says that better than a
 * predicate the caller has to get right.
 */
export interface RegionsRepositoryPort {
  listCurrencies(includeInactive: boolean): Promise<CurrencyRecord[]>;
  listCountries(includeInactive: boolean): Promise<CountryRecord[]>;
  listLanguages(includeInactive: boolean): Promise<LanguageRecord[]>;
  /** The join rows for a set of countries, or for all of them when `codes` is empty. */
  listCountryLanguages(codes: readonly string[]): Promise<CountryLanguageRecord[]>;

  findCurrency(code: string): Promise<CurrencyRecord | null>;
  findCountry(code: string): Promise<CountryRecord | null>;
  findLanguage(code: string): Promise<LanguageRecord | null>;

  createCurrency(input: NewCurrency): Promise<CurrencyRecord>;
  updateCurrency(code: string, patch: CurrencyPatch): Promise<CurrencyRecord>;
  createCountry(input: NewCountry): Promise<CountryRecord>;
  updateCountry(code: string, patch: CountryPatch): Promise<CountryRecord>;
  createLanguage(input: NewLanguage): Promise<LanguageRecord>;
  updateLanguage(code: string, patch: LanguagePatch): Promise<LanguageRecord>;

  /**
   * Replaces a country's language set wholesale.
   *
   * A whole-set write rather than add/remove calls, because "which languages is this
   * country served in, and which is default" has an invariant across the set — exactly
   * one default — and an invariant across a set cannot be maintained by operations
   * that see one element.
   */
  setCountryLanguages(
    countryCode: string,
    entries: readonly Omit<CountryLanguageRecord, 'countryCode'>[],
  ): Promise<CountryLanguageRecord[]>;

  /** How many accounts, branches or zones would be orphaned by removing a country. */
  countCountryDependents(code: string): Promise<number>;
  /** How many countries price in a currency. */
  countCurrencyDependents(code: string): Promise<number>;
}
