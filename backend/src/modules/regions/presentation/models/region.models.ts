import { Field, Int, ObjectType } from '@nestjs/graphql';

import { payloadOf } from '../../../../graphql';
import { TextDirectionScalar } from '../../../../graphql';
import type { TextDirection } from '../../../../shared/enums';

/**
 * The wire types for reference data.
 *
 * Unlike `User`, these have no existing service seam to match — the frontend reads
 * `config/regions.ts` and `config/i18n/config.ts`, two static constants. So the field
 * names follow the domain, and the cutover replaces each constant with a query plus a
 * one-line map (`{ locale: formatLocale }`). The alternative — naming the field
 * `locale` because a config object happens to — would carry a prototype's shorthand
 * into the schema permanently, and `Currency.locale` next to `Country.defaultLocale`
 * next to `User.locale` is three different meanings for one word.
 */
@ObjectType('Currency', { description: 'ISO 4217. Replaces frontend/config/regions.ts::currencies.' })
export class CurrencyModel {
  @Field(() => String, { description: 'ISO 4217, uppercase.' }) code!: string;
  @Field(() => String) symbol!: string;

  @Field(() => String, {
    description:
      'Intl locale amounts are formatted with, e.g. "bn-BD" — why BDT renders in Bengali numerals. Backs the frontend’s `Currency.locale`.',
  })
  formatLocale!: string;

  @Field(() => Int, { description: 'Display digits: 0 for BDT, 2 for most. Storage is always 2.' })
  fractionDigits!: number;

  @Field(() => Boolean) isActive!: boolean;
  @Field(() => Int) sort!: number;
}

@ObjectType('Language', { description: 'BCP-47 locale. Replaces frontend/config/i18n/config.ts::localeMeta.' })
export class LanguageModel {
  @Field(() => String) code!: string;
  @Field(() => String, { description: 'English name, e.g. "Bengali".' }) name!: string;
  @Field(() => String, { description: 'Endonym, e.g. "বাংলা".' }) nativeName!: string;

  @Field(() => TextDirectionScalar, { description: 'What the root layout puts in <html dir>.' })
  direction!: TextDirection;

  @Field(() => Boolean) isActive!: boolean;
  @Field(() => Int) sort!: number;
}

@ObjectType('Country', { description: 'ISO 3166-1 alpha-2. Replaces frontend/config/regions.ts::countries.' })
export class CountryModel {
  @Field(() => String) code!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { description: 'ISO 4217 of the currency this market prices in.' })
  currencyCode!: string;

  @Field(() => String, { description: 'IANA zone. Every local-date calculation resolves here.' })
  timezone!: string;

  @Field(() => String, { description: 'E.164 prefix, e.g. "+880".' }) dialCode!: string;

  @Field(() => String, { description: 'BCP-47 default for accounts created here.' })
  defaultLocale!: string;

  @Field(() => Boolean) isActive!: boolean;
  @Field(() => Int) sort!: number;

  /**
   * `taxRate` and `taxLabel` are **absent**, and their absence is deliberate. The
   * frontend's `Country` carries both, but a single rate per country is the prototype's
   * simplification: `TaxRule` is a dated, scoped table because one order can attract a
   * goods VAT and a municipal delivery levy at once, and because a rate change must
   * never rewrite the history of orders priced under the old one. E5 owns taxes and
   * exposes them per priced document; until then the frontend keeps its local table.
   */
}

@ObjectType('CountryDetail', { description: 'A country with its currency and languages resolved.' })
export class CountryDetailModel extends CountryModel {
  @Field(() => CurrencyModel) currency!: CurrencyModel;

  @Field(() => [LanguageModel], { description: 'Served languages, the default first.' })
  languages!: LanguageModel[];
}

export const CurrencyPayload = payloadOf(CurrencyModel, 'CurrencyPayload');
export const CountryPayload = payloadOf(CountryModel, 'CountryPayload');
export const LanguagePayload = payloadOf(LanguageModel, 'LanguagePayload');
