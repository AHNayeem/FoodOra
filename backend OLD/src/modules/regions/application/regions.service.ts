import { Inject, Injectable, Logger } from '@nestjs/common';

import { appConfig, type AppConfig } from '../../../config';
import {
  type CountryDetail,
  type CountryRecord,
  type CurrencyRecord,
  type LanguageRecord,
  normaliseCountryCode,
  normaliseCurrencyCode,
  type RegionCatalogPort,
  type RegionDefaults,
  REGIONS_CACHE,
  type RegionsCachePort,
  REGIONS_REPOSITORY,
  type RegionsRepositoryPort,
  type RegionSnapshot,
} from '../domain';

/**
 * The read side of reference data, and the implementation behind `REGION_CATALOG`.
 *
 * Two things make this more than a thin repository wrapper.
 *
 * **One snapshot, cached whole.** The catalogue is a few kilobytes that changes a few
 * times a year and is read on the registration path, the locale switcher and every
 * price format. Caching it as one entry means a cold read costs four queries once
 * rather than one query per lookup forever — and it cannot go internally inconsistent
 * the way per-code entries can.
 *
 * **It never throws for a read.** `defaultsFor` falls back to the configured platform
 * defaults when the country is unknown *or* when the database is unreachable, because
 * every caller is on a path where failing is worse than approximating: a signup, a
 * price render, a locale choice. E2 learned this from `apiStatus` — the query whose job
 * was to report the database being down, failing because the database was down.
 */
@Injectable()
export class RegionsService implements RegionCatalogPort {
  private readonly logger = new Logger(RegionsService.name);

  constructor(
    @Inject(REGIONS_REPOSITORY) private readonly repository: RegionsRepositoryPort,
    @Inject(REGIONS_CACHE) private readonly cache: RegionsCachePort,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  // --- the public catalogue --------------------------------------------------

  async activeCountries(): Promise<CountryRecord[]> {
    return [...(await this.snapshot()).countries];
  }

  async activeCurrencies(): Promise<CurrencyRecord[]> {
    return [...(await this.snapshot()).currencies];
  }

  async activeLanguages(): Promise<LanguageRecord[]> {
    return [...(await this.snapshot()).languages];
  }

  /** A country with its currency and languages attached — the switcher's whole payload. */
  async countryDetail(code: string): Promise<CountryDetail | null> {
    const snapshot = await this.snapshot();
    const wanted = normaliseCountryCode(code);
    const country = snapshot.countries.find((candidate) => candidate.code === wanted);
    if (!country) return null;

    const currency = snapshot.currencies.find(
      (candidate) => candidate.code === country.currencyCode,
    );
    // A country whose currency has been deactivated is a misconfiguration, not a
    // reason to return nothing: the admin screen needs to be able to see it to fix it.
    if (!currency) {
      this.logger.warn(
        `Country ${country.code} points at inactive or missing currency ${country.currencyCode}.`,
      );
      return null;
    }

    const codes = new Set(
      snapshot.countryLanguages
        .filter((link) => link.countryCode === country.code)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sort - b.sort)
        .map((link) => link.languageCode),
    );

    return {
      ...country,
      currency,
      languages: [...codes]
        .map((languageCode) => snapshot.languages.find((l) => l.code === languageCode))
        .filter((language): language is LanguageRecord => language !== undefined),
    };
  }

  // --- REGION_CATALOG -------------------------------------------------------

  async activeCountry(code: string): Promise<CountryRecord | null> {
    const wanted = normaliseCountryCode(code);
    return (await this.snapshot()).countries.find((c) => c.code === wanted) ?? null;
  }

  async activeCurrency(code: string): Promise<CurrencyRecord | null> {
    const wanted = normaliseCurrencyCode(code);
    return (await this.snapshot()).currencies.find((c) => c.code === wanted) ?? null;
  }

  async activeLanguage(code: string): Promise<LanguageRecord | null> {
    const wanted = code.trim();
    return (await this.snapshot()).languages.find((l) => l.code === wanted) ?? null;
  }

  async defaultsFor(countryCode: string | null | undefined): Promise<RegionDefaults> {
    const fallback: RegionDefaults = {
      countryCode: this.app.defaults.countryCode,
      currency: this.app.defaults.currency,
      locale: this.app.defaults.locale,
      timezone: this.app.defaults.timezone,
    };

    if (!countryCode) return fallback;

    try {
      const country = await this.activeCountry(countryCode);
      if (!country) return fallback;
      return {
        countryCode: country.code,
        currency: country.currencyCode,
        locale: country.defaultLocale,
        timezone: country.timezone,
      };
    } catch (error) {
      // Reference data being unreachable must not fail a signup. The account gets the
      // platform defaults and is editable afterwards, which is a far smaller problem
      // than a registration form that returns 503.
      this.logger.warn(
        `Region defaults for "${countryCode}" fell back to configuration: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallback;
    }
  }

  // --- snapshot -------------------------------------------------------------

  /**
   * The active catalogue, from cache or from four queries.
   *
   * `countryLanguages` is fetched for every country rather than per country: the join
   * table has one row per (country, language) pair — dozens, not thousands — and one
   * query for all of them beats N+1 for a payload this size.
   */
  private async snapshot(): Promise<RegionSnapshot> {
    const cached = await this.cache.read();
    if (cached) return cached;

    const [currencies, countries, languages] = await Promise.all([
      this.repository.listCurrencies(false),
      this.repository.listCountries(false),
      this.repository.listLanguages(false),
    ]);
    const countryLanguages = await this.repository.listCountryLanguages(
      countries.map((country) => country.code),
    );

    const snapshot: RegionSnapshot = { currencies, countries, languages, countryLanguages };
    await this.cache.write(snapshot);
    return snapshot;
  }
}
