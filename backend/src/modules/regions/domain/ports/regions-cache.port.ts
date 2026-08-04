import type {
  CountryLanguageRecord,
  CountryRecord,
  CurrencyRecord,
  LanguageRecord,
} from '../models';

export const REGIONS_CACHE = Symbol('REGIONS_CACHE');

/** Everything active, in one entry. */
export interface RegionSnapshot {
  currencies: readonly CurrencyRecord[];
  countries: readonly CountryRecord[];
  languages: readonly LanguageRecord[];
  countryLanguages: readonly CountryLanguageRecord[];
}

/**
 * One cache entry for the whole active catalogue, not one per code.
 *
 * The data is a few kilobytes and changes a handful of times a year, while the read
 * pattern is "give me the switcher" and "which currency does BD use" — so per-code
 * keys would multiply round trips to save nothing, and would let the snapshot be
 * internally inconsistent: a country cached before an edit pointing at a currency
 * cached after it. One entry cannot half-update.
 *
 * A miss is a database read, never a failure.
 */
export interface RegionsCachePort {
  read(): Promise<RegionSnapshot | null>;
  write(snapshot: RegionSnapshot): Promise<void>;
  invalidate(): Promise<void>;
}
