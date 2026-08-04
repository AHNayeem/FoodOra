import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { TextDirection } from '../../../shared/enums';
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
  RegionsRepositoryPort,
} from '../domain';

const directions = enumCodec<TextDirection, $Enums.TextDirection>('TextDirection');

const CURRENCY_FIELDS = {
  code: true,
  symbol: true,
  formatLocale: true,
  fractionDigits: true,
  isActive: true,
  sort: true,
} as const;

const COUNTRY_FIELDS = {
  code: true,
  name: true,
  currencyCode: true,
  timezone: true,
  dialCode: true,
  defaultLocale: true,
  isActive: true,
  sort: true,
} as const;

const LANGUAGE_FIELDS = {
  code: true,
  name: true,
  nativeName: true,
  direction: true,
  isActive: true,
  sort: true,
} as const;

/**
 * The only file in the module that knows Prisma exists.
 *
 * Two conventions inherited from E2 and worth restating, because both are invisible
 * until they bite:
 *
 * - **Nothing here opens a transaction.** `this.db` is the transaction's client when
 *   one is open and the plain one otherwise, so `createCountry` + `setCountryLanguages`
 *   compose into one atomic market-opening without either method knowing it
 *   (D1 §Transactions).
 * - **Naming `deletedAt` in a `where` opts out of the soft-delete filter.** These three
 *   models are soft-deletable, so the default reads already exclude tombstones; the
 *   `includeInactive` flag is about the `isActive` column, which is a different question
 *   — "not on offer right now" versus "removed".
 */
@Injectable()
export class PrismaRegionsRepository implements RegionsRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  // --- reads ----------------------------------------------------------------

  async listCurrencies(includeInactive: boolean): Promise<CurrencyRecord[]> {
    return this.db.currency.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      select: CURRENCY_FIELDS,
    });
  }

  async listCountries(includeInactive: boolean): Promise<CountryRecord[]> {
    return this.db.country.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: COUNTRY_FIELDS,
    });
  }

  async listLanguages(includeInactive: boolean): Promise<LanguageRecord[]> {
    const rows = await this.db.language.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      select: LANGUAGE_FIELDS,
    });
    return rows.map(toLanguage);
  }

  async listCountryLanguages(codes: readonly string[]): Promise<CountryLanguageRecord[]> {
    return this.db.countryLanguage.findMany({
      where: codes.length ? { countryCode: { in: [...codes] } } : {},
      orderBy: [{ countryCode: 'asc' }, { sort: 'asc' }],
      select: { countryCode: true, languageCode: true, isDefault: true, sort: true },
    });
  }

  async findCurrency(code: string): Promise<CurrencyRecord | null> {
    return this.db.currency.findUnique({ where: { code }, select: CURRENCY_FIELDS });
  }

  async findCountry(code: string): Promise<CountryRecord | null> {
    return this.db.country.findUnique({ where: { code }, select: COUNTRY_FIELDS });
  }

  async findLanguage(code: string): Promise<LanguageRecord | null> {
    const row = await this.db.language.findUnique({ where: { code }, select: LANGUAGE_FIELDS });
    return row ? toLanguage(row) : null;
  }

  // --- writes ---------------------------------------------------------------

  async createCurrency(input: NewCurrency): Promise<CurrencyRecord> {
    return this.db.currency.create({ data: { ...input }, select: CURRENCY_FIELDS });
  }

  async updateCurrency(code: string, patch: CurrencyPatch): Promise<CurrencyRecord> {
    return this.db.currency.update({ where: { code }, data: patch, select: CURRENCY_FIELDS });
  }

  async createCountry(input: NewCountry): Promise<CountryRecord> {
    return this.db.country.create({ data: { ...input }, select: COUNTRY_FIELDS });
  }

  async updateCountry(code: string, patch: CountryPatch): Promise<CountryRecord> {
    return this.db.country.update({ where: { code }, data: patch, select: COUNTRY_FIELDS });
  }

  async createLanguage(input: NewLanguage): Promise<LanguageRecord> {
    const row = await this.db.language.create({
      data: { ...input, direction: directions.toDb(input.direction) },
      select: LANGUAGE_FIELDS,
    });
    return toLanguage(row);
  }

  async updateLanguage(code: string, patch: LanguagePatch): Promise<LanguageRecord> {
    const row = await this.db.language.update({
      where: { code },
      data: {
        ...patch,
        direction: patch.direction === undefined ? undefined : directions.toDb(patch.direction),
      },
      select: LANGUAGE_FIELDS,
    });
    return toLanguage(row);
  }

  /**
   * Delete-then-insert rather than a diff.
   *
   * `CountryLanguage` has no surrogate key and no data of its own beyond `isDefault`
   * and `sort`, so there is nothing a diff would preserve — and the set has an
   * invariant across its members (exactly one default) that a sequence of upserts
   * would pass through an invalid state to satisfy. The caller wraps this in a
   * transaction, so the window where the country has no languages never commits.
   */
  async setCountryLanguages(
    countryCode: string,
    entries: readonly Omit<CountryLanguageRecord, 'countryCode'>[],
  ): Promise<CountryLanguageRecord[]> {
    // `CountryLanguage` is not soft-deletable, so `deleteMany` is permitted here —
    // the extension only refuses it on models that carry a `deletedAt`.
    await this.db.countryLanguage.deleteMany({ where: { countryCode } });
    if (entries.length === 0) return [];

    await this.db.countryLanguage.createMany({
      data: entries.map((entry) => ({ ...entry, countryCode })),
    });

    return this.listCountryLanguages([countryCode]);
  }

  // --- dependency counts ----------------------------------------------------

  /**
   * Everything that would be left pointing at a country nobody offers.
   *
   * Counted rather than summed from a join so each number can be reported separately
   * later if the admin screen wants to say *what* is in the way; today the caller only
   * needs to know whether the answer is zero.
   */
  async countCountryDependents(code: string): Promise<number> {
    const [users, branches, zones] = await Promise.all([
      this.db.user.count({ where: { countryCode: code } }),
      this.db.vendorBranch.count({ where: { countryCode: code } }),
      this.db.deliveryZone.count({ where: { countryCode: code } }),
    ]);
    return users + branches + zones;
  }

  async countCurrencyDependents(code: string): Promise<number> {
    return this.db.country.count({ where: { currencyCode: code } });
  }
}

/** The one field that needs the codec: `LTR` in the client, `"ltr"` on the wire. */
function toLanguage(row: {
  code: string;
  name: string;
  nativeName: string;
  direction: string;
  isActive: boolean;
  sort: number;
}): LanguageRecord {
  return { ...row, direction: directions.toWire(row.direction) };
}
