import type { CountryRecord, CurrencyRecord, LanguageRecord, RegionDefaults } from '../models';

export const REGION_CATALOG = Symbol('REGION_CATALOG');

/**
 * The module's **published contract** — what other modules are allowed to know about
 * regions (D1 §The dependency rule: a module may import another module's `domain/`,
 * and this is the part of `domain/` meant to be imported).
 *
 * Read-only, and narrower than the repository on purpose. `UsersModule` needs to know
 * whether `"BD"` is a country it may put on an account and what currency that implies;
 * it has no business creating one. Handing it the repository port would let it, and
 * "nothing stops it" is how a module boundary becomes decorative.
 *
 * Every method is cached and answers from memory in the common case — these are read
 * on the registration path, so a database round trip per lookup would put reference
 * data on the critical path of every signup.
 */
export interface RegionCatalogPort {
  /** `null` when the code is unknown *or* inactive — both mean "not on offer". */
  activeCountry(code: string): Promise<CountryRecord | null>;
  activeCurrency(code: string): Promise<CurrencyRecord | null>;
  activeLanguage(code: string): Promise<LanguageRecord | null>;

  /**
   * The defaults an account created in this country inherits.
   *
   * Falls back to the configured platform defaults when the country is unknown or the
   * table is unreachable, and never throws. A signup must not fail because reference
   * data is missing — E2 already learned the shape of that mistake with `apiStatus`
   * and a downed database.
   */
  defaultsFor(countryCode: string | null | undefined): Promise<RegionDefaults>;
}
