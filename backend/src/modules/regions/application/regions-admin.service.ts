import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../../shared/contracts';
import { fail, ok, type Result } from '../../../shared/kernel';
import {
  type CountryPatch,
  type CountryRecord,
  type CurrencyPatch,
  type CurrencyRecord,
  defaultLanguageOf,
  isCountryCode,
  isCurrencyCode,
  isDialCode,
  isLocaleCode,
  isTimezone,
  type LanguagePatch,
  type LanguageRecord,
  type LanguageSetEntry,
  type NewCountry,
  type NewCurrency,
  type NewLanguage,
  normaliseCountryCode,
  normaliseCurrencyCode,
  normaliseLanguageSet,
  normaliseLocaleCode,
  REGIONS_CACHE,
  type RegionsCachePort,
  REGIONS_REPOSITORY,
  type RegionsRepositoryPort,
  RegionError,
} from '../domain';

/**
 * The write side: opening a market, switching a currency on, adding a language.
 *
 * Rare, high-consequence operations, so the refusals matter more than the writes.
 * Three rules run through all of them:
 *
 * 1. **Referential sanity before the database enforces it.** A country pointing at an
 *    inactive currency, or a language set with no default, would either violate an FK
 *    or — worse — succeed and quietly break formatting for that market. Checked here so
 *    the admin screen gets `regions.errors.*` on a field instead of a Prisma code.
 *
 * 2. **Deactivation is not deletion, and is refused when it would orphan rows.**
 *    `Country.code` is an FK from `users`, `vendor_branches` and `delivery_zones` with
 *    `onDelete: Restrict`. Turning a country off while accounts live in it leaves those
 *    accounts pointing at something the catalogue no longer offers, which every read
 *    path then has to have an opinion about. Better to refuse with a count in the
 *    message.
 *
 * 3. **Every write invalidates the whole snapshot.** One key, one `del`, and the next
 *    read is correct. Fine-grained invalidation would be a caching optimisation on data
 *    that changes a handful of times a year, bought with a class of staleness bug that
 *    is very hard to see.
 */
@Injectable()
export class RegionsAdminService {
  constructor(
    @Inject(REGIONS_REPOSITORY) private readonly repository: RegionsRepositoryPort,
    @Inject(REGIONS_CACHE) private readonly cache: RegionsCachePort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  // --- admin reads ----------------------------------------------------------

  /**
   * Uncached, and unlike the public reads these bypass the snapshot entirely.
   *
   * The snapshot holds only what is *active*, because that is what every hot path wants.
   * An admin listing a market that was switched off last week has to see it, and reading
   * it through a cache of active rows would mean either a second cache or a snapshot
   * that serves two masters. These are a handful of queries a day.
   */
  async listAllCountries(): Promise<CountryRecord[]> {
    return this.repository.listCountries(true);
  }

  async listAllCurrencies(): Promise<CurrencyRecord[]> {
    return this.repository.listCurrencies(true);
  }

  async listAllLanguages(): Promise<LanguageRecord[]> {
    return this.repository.listLanguages(true);
  }

  // --- currencies -----------------------------------------------------------

  async createCurrency(input: NewCurrency): Promise<Result<CurrencyRecord>> {
    const code = normaliseCurrencyCode(input.code);
    if (!isCurrencyCode(code)) return fail(RegionError.invalidCurrencyCode, { path: 'input.code' });
    if (!isLocaleCode(input.formatLocale)) {
      return fail(RegionError.invalidLocaleCode, { path: 'input.formatLocale' });
    }
    if (await this.repository.findCurrency(code)) {
      return fail(RegionError.currencyExists, { path: 'input.code', params: { code } });
    }

    const created = await this.repository.createCurrency({ ...input, code });
    await this.cache.invalidate();
    return ok(created);
  }

  async updateCurrency(rawCode: string, patch: CurrencyPatch): Promise<Result<CurrencyRecord>> {
    const code = normaliseCurrencyCode(rawCode);
    const existing = await this.repository.findCurrency(code);
    if (!existing) return fail(RegionError.unknownCurrency, { params: { code } });

    if (patch.formatLocale !== undefined && !isLocaleCode(patch.formatLocale)) {
      return fail(RegionError.invalidLocaleCode, { path: 'input.formatLocale' });
    }

    // Switching a currency off while a country prices in it would leave that country
    // unable to format a total. The FK does not cover this — `Country.currencyCode`
    // restricts *deletes*, not deactivation — so it is checked here or nowhere.
    if (patch.isActive === false && existing.isActive) {
      const dependents = await this.repository.countCurrencyDependents(code);
      if (dependents > 0) {
        return fail(RegionError.currencyInUse, { params: { code, countries: dependents } });
      }
    }

    const updated = await this.repository.updateCurrency(code, patch);
    await this.cache.invalidate();
    return ok(updated);
  }

  // --- countries ------------------------------------------------------------

  /**
   * Opening a market. Transactional because it is two writes — the country row and its
   * language set — and a country with no languages is not a country the switcher can
   * offer.
   */
  async createCountry(
    input: NewCountry,
    languages: readonly LanguageSetEntry[],
  ): Promise<Result<CountryRecord>> {
    const code = normaliseCountryCode(input.code);
    const currencyCode = normaliseCurrencyCode(input.currencyCode);

    const shape = this.checkCountryShape({ ...input, code, currencyCode });
    if (!shape.ok) return shape;

    if (await this.repository.findCountry(code)) {
      return fail(RegionError.countryExists, { path: 'input.code', params: { code } });
    }

    const currency = await this.repository.findCurrency(currencyCode);
    if (!currency?.isActive) {
      return fail(RegionError.currencyNotAvailable, {
        path: 'input.currencyCode',
        params: { code: currencyCode },
      });
    }

    const set = normaliseLanguageSet(languages);
    if (!set.ok) return fail(set.error.key, { path: 'input.languages' });

    const available = await this.checkLanguagesAvailable(set.data);
    if (!available.ok) return available;

    return this.unitOfWork.runInTransaction(async () => {
      const created = await this.repository.createCountry({
        ...input,
        code,
        currencyCode,
        // The country's default locale *is* the default of its language set. Storing it
        // twice and letting them disagree is the bug this line exists to prevent.
        defaultLocale: defaultLanguageOf(set.data) ?? input.defaultLocale,
      });
      await this.repository.setCountryLanguages(code, set.data);
      await this.cache.invalidate();
      return ok(created);
    });
  }

  async updateCountry(rawCode: string, patch: CountryPatch): Promise<Result<CountryRecord>> {
    const code = normaliseCountryCode(rawCode);
    const existing = await this.repository.findCountry(code);
    if (!existing) return fail(RegionError.unknownCountry, { params: { code } });

    const merged = { ...existing, ...patch };
    const shape = this.checkCountryShape(merged);
    if (!shape.ok) return shape;

    if (patch.currencyCode !== undefined) {
      const currencyCode = normaliseCurrencyCode(patch.currencyCode);
      const currency = await this.repository.findCurrency(currencyCode);
      if (!currency?.isActive) {
        return fail(RegionError.currencyNotAvailable, {
          path: 'input.currencyCode',
          params: { code: currencyCode },
        });
      }
      patch = { ...patch, currencyCode };
    }

    if (patch.isActive === false && existing.isActive) {
      const remaining = (await this.repository.listCountries(false)).filter(
        (country) => country.code !== code,
      );
      // A platform with no active country cannot register anybody: `User.countryCode`
      // is a non-null FK, so there would be nothing valid to put in it.
      if (remaining.length === 0) return fail(RegionError.lastActiveCountry, { params: { code } });

      const dependents = await this.repository.countCountryDependents(code);
      if (dependents > 0) {
        return fail(RegionError.countryInUse, { params: { code, dependents } });
      }
    }

    const updated = await this.repository.updateCountry(code, patch);
    await this.cache.invalidate();
    return ok(updated);
  }

  /** Replace a country's language set. Also rewrites `defaultLocale` to match. */
  async setCountryLanguages(
    rawCode: string,
    languages: readonly LanguageSetEntry[],
  ): Promise<Result<CountryRecord>> {
    const code = normaliseCountryCode(rawCode);
    const existing = await this.repository.findCountry(code);
    if (!existing) return fail(RegionError.unknownCountry, { params: { code } });

    const set = normaliseLanguageSet(languages);
    if (!set.ok) return fail(set.error.key, { path: 'input.languages' });

    const available = await this.checkLanguagesAvailable(set.data);
    if (!available.ok) return available;

    return this.unitOfWork.runInTransaction(async () => {
      await this.repository.setCountryLanguages(code, set.data);
      const defaultLocale = defaultLanguageOf(set.data);
      const updated =
        defaultLocale && defaultLocale !== existing.defaultLocale
          ? await this.repository.updateCountry(code, { defaultLocale })
          : existing;
      await this.cache.invalidate();
      return ok(updated);
    });
  }

  // --- languages ------------------------------------------------------------

  async createLanguage(input: NewLanguage): Promise<Result<LanguageRecord>> {
    const code = normaliseLocaleCode(input.code);
    if (!isLocaleCode(code)) return fail(RegionError.invalidLocaleCode, { path: 'input.code' });
    if (await this.repository.findLanguage(code)) {
      return fail(RegionError.languageExists, { path: 'input.code', params: { code } });
    }

    const created = await this.repository.createLanguage({ ...input, code });
    await this.cache.invalidate();
    return ok(created);
  }

  async updateLanguage(rawCode: string, patch: LanguagePatch): Promise<Result<LanguageRecord>> {
    const code = normaliseLocaleCode(rawCode);
    const existing = await this.repository.findLanguage(code);
    if (!existing) return fail(RegionError.unknownLanguage, { params: { code } });

    if (patch.isActive === false && existing.isActive) {
      const others = (await this.repository.listLanguages(false)).filter(
        (language) => language.code !== code,
      );
      if (others.length === 0) return fail(RegionError.lastActiveLanguage, { params: { code } });

      // A language that is some country's default cannot simply be switched off — that
      // country would have no language at all. The admin has to move the default first,
      // which is a deliberate two-step rather than a silent cascade.
      const links = await this.repository.listCountryLanguages([]);
      const defaultFor = links.filter(
        (link) => link.languageCode === code && link.isDefault,
      ).length;
      if (defaultFor > 0) {
        return fail(RegionError.languageNotAvailable, { params: { code, countries: defaultFor } });
      }
    }

    const updated = await this.repository.updateLanguage(code, patch);
    await this.cache.invalidate();
    return ok(updated);
  }

  // --- shared checks --------------------------------------------------------

  private checkCountryShape(country: {
    code: string;
    currencyCode: string;
    timezone: string;
    dialCode: string;
    defaultLocale: string;
  }): Result<null> {
    if (!isCountryCode(country.code)) {
      return fail(RegionError.invalidCountryCode, { path: 'input.code' });
    }
    if (!isCurrencyCode(country.currencyCode)) {
      return fail(RegionError.invalidCurrencyCode, { path: 'input.currencyCode' });
    }
    if (!isTimezone(country.timezone)) {
      return fail(RegionError.invalidTimezone, { path: 'input.timezone' });
    }
    if (!isDialCode(country.dialCode)) {
      return fail(RegionError.invalidDialCode, { path: 'input.dialCode' });
    }
    if (!isLocaleCode(country.defaultLocale)) {
      return fail(RegionError.invalidLocaleCode, { path: 'input.defaultLocale' });
    }
    return ok(null);
  }

  private async checkLanguagesAvailable(
    entries: readonly LanguageSetEntry[],
  ): Promise<Result<null>> {
    const active = new Map(
      (await this.repository.listLanguages(true)).map((language) => [language.code, language]),
    );
    for (const entry of entries) {
      const language = active.get(entry.languageCode);
      if (!language) {
        return fail(RegionError.unknownLanguage, {
          path: 'input.languages',
          params: { code: entry.languageCode },
        });
      }
      if (!language.isActive) {
        return fail(RegionError.languageNotAvailable, {
          path: 'input.languages',
          params: { code: entry.languageCode },
        });
      }
    }
    return ok(null);
  }
}
