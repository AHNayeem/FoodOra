import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { Permissions, Public } from '../../../common/decorators';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, toPayload } from '../../../graphql';
import type { CountryRecord, CurrencyRecord, LanguageRecord, LanguageSetEntry } from '../domain';
import { RegionsAdminService } from '../application/regions-admin.service';
import { RegionsService } from '../application/regions.service';
import {
  CountryInput,
  CountryInputSchema,
  CountryLanguagesInput,
  CountryLanguagesSchema,
  CountryPatchInput,
  CountryPatchSchema,
  CurrencyInput,
  CurrencyInputSchema,
  CurrencyPatchInput,
  CurrencyPatchSchema,
  LanguageInput,
  LanguageInputSchema,
  LanguagePatchInput,
  LanguagePatchSchema,
} from './inputs/region.inputs';
import {
  CountryDetailModel,
  CountryModel,
  CountryPayload,
  CurrencyModel,
  CurrencyPayload,
  LanguageModel,
  LanguagePayload,
} from './models/region.models';

/**
 * Reference data: three public lists and the admin writes behind them.
 *
 * The reads are `@Public()`, and that is load-bearing rather than lax. The locale
 * switcher, the currency selector and the phone-number country picker all render on
 * the sign-in page — *before* anybody has a token. A version of this that required
 * authentication would mean the only way to see the language list is to already be
 * reading the site in a language you may not speak.
 *
 * `includeInactive` is the exception: it is the admin's view of the same tables, and a
 * country that has been switched off is a business fact — a market being prepared, or
 * one that closed — so it takes `regions:read`.
 */
@Resolver()
export class RegionsResolver {
  constructor(
    private readonly regions: RegionsService,
    private readonly admin: RegionsAdminService,
  ) {}

  // --- public reads ---------------------------------------------------------

  @Public()
  @Query(() => [CountryModel], {
    name: 'countries',
    description: 'Active countries, in display order. Replaces frontend/config/regions.ts.',
  })
  async countries(): Promise<CountryModel[]> {
    return this.regions.activeCountries();
  }

  @Public()
  @Query(() => CountryDetailModel, {
    name: 'country',
    nullable: true,
    description: 'One country with its currency and languages. Null when unknown or inactive.',
  })
  async country(
    @Args('code', { type: () => String }) code: string,
  ): Promise<CountryDetailModel | null> {
    const detail = await this.regions.countryDetail(code);
    // The domain's arrays are `readonly` on purpose — nothing downstream should mutate a cached
    // snapshot's contents. Copying at the boundary is the price of that guarantee.
    return detail ? { ...detail, languages: [...detail.languages] } : null;
  }

  @Public()
  @Query(() => [CurrencyModel], { name: 'currencies', description: 'Active currencies.' })
  async currencies(): Promise<CurrencyModel[]> {
    return this.regions.activeCurrencies();
  }

  @Public()
  @Query(() => [LanguageModel], {
    name: 'languages',
    description: 'Active languages. Replaces frontend/config/i18n/config.ts::localeMeta.',
  })
  async languages(): Promise<LanguageModel[]> {
    return this.regions.activeLanguages();
  }

  // --- admin reads ----------------------------------------------------------

  @Permissions('regions:read')
  @Query(() => [CountryModel], {
    name: 'allCountries',
    description: 'Every country, including inactive ones. For the admin screen.',
  })
  async allCountries(): Promise<CountryModel[]> {
    return this.admin.listAllCountries();
  }

  @Permissions('regions:read')
  @Query(() => [CurrencyModel], { name: 'allCurrencies', description: 'Every currency.' })
  async allCurrencies(): Promise<CurrencyModel[]> {
    return this.admin.listAllCurrencies();
  }

  @Permissions('regions:read')
  @Query(() => [LanguageModel], { name: 'allLanguages', description: 'Every language.' })
  async allLanguages(): Promise<LanguageModel[]> {
    return this.admin.listAllLanguages();
  }

  // --- currencies -----------------------------------------------------------

  @Permissions('regions:write')
  @Mutation(() => CurrencyPayload, { description: 'Add a currency the platform may price in.' })
  async createCurrency(
    @Args('input', zodPipe(CurrencyInputSchema)) input: CurrencyInput,
  ): Promise<DataPayload<CurrencyRecord>> {
    return toPayload(
      await this.admin.createCurrency({
        code: input.code,
        symbol: input.symbol,
        formatLocale: input.formatLocale,
        fractionDigits: input.fractionDigits ?? 2,
        isActive: input.isActive ?? true,
        sort: input.sort ?? 0,
      }),
    );
  }

  @Permissions('regions:write')
  @Mutation(() => CurrencyPayload, { description: 'Change a currency, or switch it off.' })
  async updateCurrency(
    @Args('code', { type: () => String }) code: string,
    @Args('input', zodPipe(CurrencyPatchSchema)) input: CurrencyPatchInput,
  ): Promise<DataPayload<CurrencyRecord>> {
    return toPayload(await this.admin.updateCurrency(code, input));
  }

  // --- languages ------------------------------------------------------------

  @Permissions('regions:write')
  @Mutation(() => LanguagePayload, { description: 'Add a language the platform speaks.' })
  async createLanguage(
    @Args('input', zodPipe(LanguageInputSchema)) input: LanguageInput,
  ): Promise<DataPayload<LanguageRecord>> {
    return toPayload(
      await this.admin.createLanguage({
        code: input.code,
        name: input.name,
        nativeName: input.nativeName,
        direction: input.direction ?? 'ltr',
        isActive: input.isActive ?? true,
        sort: input.sort ?? 0,
      }),
    );
  }

  @Permissions('regions:write')
  @Mutation(() => LanguagePayload, { description: 'Change a language, or switch it off.' })
  async updateLanguage(
    @Args('code', { type: () => String }) code: string,
    @Args('input', zodPipe(LanguagePatchSchema)) input: LanguagePatchInput,
  ): Promise<DataPayload<LanguageRecord>> {
    return toPayload(await this.admin.updateLanguage(code, input));
  }

  // --- countries ------------------------------------------------------------

  @Permissions('regions:write')
  @Mutation(() => CountryPayload, {
    description: 'Open a market: the country row and its language set, in one transaction.',
  })
  async createCountry(
    @Args('input', zodPipe(CountryInputSchema)) input: CountryInput,
  ): Promise<DataPayload<CountryRecord>> {
    return toPayload(
      await this.admin.createCountry(
        {
          code: input.code,
          name: input.name,
          currencyCode: input.currencyCode,
          timezone: input.timezone,
          dialCode: input.dialCode,
          // Derived from the language set inside the service; this is only the value it
          // falls back to if the set somehow names no default, which it cannot.
          defaultLocale: input.languages[0]?.languageCode ?? 'en',
          isActive: input.isActive ?? true,
          sort: input.sort ?? 0,
        },
        toLanguageSet(input.languages),
      ),
    );
  }

  @Permissions('regions:write')
  @Mutation(() => CountryPayload, { description: 'Change a country, or switch it off.' })
  async updateCountry(
    @Args('code', { type: () => String }) code: string,
    @Args('input', zodPipe(CountryPatchSchema)) input: CountryPatchInput,
  ): Promise<DataPayload<CountryRecord>> {
    return toPayload(await this.admin.updateCountry(code, input));
  }

  @Permissions('regions:write')
  @Mutation(() => CountryPayload, {
    description: 'Replace a country’s language set. Also moves its `defaultLocale`.',
  })
  async setCountryLanguages(
    @Args('input', zodPipe(CountryLanguagesSchema)) input: CountryLanguagesInput,
  ): Promise<DataPayload<CountryRecord>> {
    return toPayload(
      await this.admin.setCountryLanguages(input.countryCode, toLanguageSet(input.languages)),
    );
  }
}

/** GraphQL's optional-with-default fields become the domain's required ones. */
function toLanguageSet(
  entries: readonly { languageCode: string; isDefault?: boolean; sort?: number }[],
): LanguageSetEntry[] {
  return entries.map((entry, index) => ({
    languageCode: entry.languageCode,
    isDefault: entry.isDefault ?? false,
    sort: entry.sort ?? index,
  }));
}
