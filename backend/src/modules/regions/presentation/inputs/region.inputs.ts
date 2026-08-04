import { Field, InputType, Int } from '@nestjs/graphql';
import { z } from 'zod';

import { TextDirectionScalar } from '../../../../graphql';
import { TEXT_DIRECTIONS, type TextDirection } from '../../../../shared/enums';
import { RegionError } from '../../domain';

/**
 * Inputs and their Zod schemas.
 *
 * The regexes here mirror `domain/policies/codes.ts` rather than replacing it: Zod
 * refuses malformed input at the edge with a field path the form can attach to, and the
 * domain predicates refuse it again for callers that never pass through GraphQL — the
 * reference-data script, and whatever E12's seeder becomes. Two checks of one rule is
 * duplication; two checks of one rule where only one of them is reachable from every
 * caller is a rule with a back door.
 */

const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, RegionError.invalidCountryCode);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, RegionError.invalidCurrencyCode);

const localeCode = z
  .string()
  .trim()
  .max(8)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, RegionError.invalidLocaleCode);

const sort = z.number().int().min(0).max(9_999).optional();

// --- currencies -------------------------------------------------------------

@InputType({ description: 'Add a currency the platform may price in.' })
export class CurrencyInput {
  @Field(() => String) code!: string;
  @Field(() => String, { description: 'e.g. "৳". Rendered verbatim.' }) symbol!: string;
  @Field(() => String, { description: 'Intl locale, e.g. "bn-BD".' }) formatLocale!: string;

  @Field(() => Int, { nullable: true, defaultValue: 2, description: 'Display digits. 0 for BDT.' })
  fractionDigits?: number;

  @Field(() => Boolean, { nullable: true, defaultValue: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true, defaultValue: 0 }) sort?: number;
}

export const CurrencyInputSchema = z.object({
  code: currencyCode,
  symbol: z.string().trim().min(1).max(8),
  formatLocale: localeCode,
  fractionDigits: z.number().int().min(0).max(4).optional(),
  isActive: z.boolean().optional(),
  sort,
});

@InputType({ description: 'Change a currency. Omitted fields are left alone.' })
export class CurrencyPatchInput {
  @Field(() => String, { nullable: true }) symbol?: string;
  @Field(() => String, { nullable: true }) formatLocale?: string;
  @Field(() => Int, { nullable: true }) fractionDigits?: number;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true }) sort?: number;
}

export const CurrencyPatchSchema = z.object({
  symbol: z.string().trim().min(1).max(8).optional(),
  formatLocale: localeCode.optional(),
  fractionDigits: z.number().int().min(0).max(4).optional(),
  isActive: z.boolean().optional(),
  sort,
});

// --- languages --------------------------------------------------------------

@InputType({ description: 'Add a language the platform speaks.' })
export class LanguageInput {
  @Field(() => String, { description: 'BCP-47, e.g. "bn".' }) code!: string;
  @Field(() => String, { description: 'English name.' }) name!: string;
  @Field(() => String, { description: 'Endonym.' }) nativeName!: string;

  @Field(() => TextDirectionScalar, { nullable: true, defaultValue: 'ltr' })
  direction?: TextDirection;

  @Field(() => Boolean, { nullable: true, defaultValue: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true, defaultValue: 0 }) sort?: number;
}

export const LanguageInputSchema = z.object({
  code: localeCode,
  name: z.string().trim().min(1).max(60),
  nativeName: z.string().trim().min(1).max(60),
  direction: z.enum(TEXT_DIRECTIONS).optional(),
  isActive: z.boolean().optional(),
  sort,
});

@InputType({ description: 'Change a language. Omitted fields are left alone.' })
export class LanguagePatchInput {
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) nativeName?: string;
  @Field(() => TextDirectionScalar, { nullable: true }) direction?: TextDirection;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true }) sort?: number;
}

export const LanguagePatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  nativeName: z.string().trim().min(1).max(60).optional(),
  direction: z.enum(TEXT_DIRECTIONS).optional(),
  isActive: z.boolean().optional(),
  sort,
});

// --- countries --------------------------------------------------------------

@InputType({ description: 'One language a country is served in.' })
export class CountryLanguageInput {
  @Field(() => String) languageCode!: string;

  @Field(() => Boolean, {
    nullable: true,
    defaultValue: false,
    description:
      'Exactly one entry must be the default — it becomes the country’s `defaultLocale`. A single-entry set defaults itself.',
  })
  isDefault?: boolean;

  @Field(() => Int, { nullable: true, defaultValue: 0 }) sort?: number;
}

@InputType({ description: 'Open a market.' })
export class CountryInput {
  @Field(() => String, { description: 'ISO 3166-1 alpha-2.' }) code!: string;
  @Field(() => String) name!: string;
  @Field(() => String) currencyCode!: string;
  @Field(() => String, { description: 'IANA zone, e.g. "Asia/Dhaka".' }) timezone!: string;
  @Field(() => String, { description: 'e.g. "+880".' }) dialCode!: string;

  @Field(() => [CountryLanguageInput], {
    description: 'At least one. The default becomes `defaultLocale`, so that field is derived.',
  })
  languages!: CountryLanguageInput[];

  @Field(() => Boolean, { nullable: true, defaultValue: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true, defaultValue: 0 }) sort?: number;
}

const languageEntries = z
  .array(
    z.object({
      languageCode: localeCode,
      isDefault: z.boolean().optional(),
      sort: z.number().int().min(0).max(9_999).optional(),
    }),
  )
  .min(1, RegionError.noDefaultLanguage)
  .max(40);

export const CountryInputSchema = z.object({
  code: countryCode,
  name: z.string().trim().min(1).max(80),
  currencyCode,
  timezone: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/, RegionError.invalidTimezone),
  dialCode: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{0,3}$/, RegionError.invalidDialCode),
  languages: languageEntries,
  isActive: z.boolean().optional(),
  sort,
});

@InputType({ description: 'Change a country. Omitted fields are left alone.' })
export class CountryPatchInput {
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) currencyCode?: string;
  @Field(() => String, { nullable: true }) timezone?: string;
  @Field(() => String, { nullable: true }) dialCode?: string;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true }) sort?: number;

  /**
   * No `defaultLocale`. It is derived from the language set, and `setCountryLanguages`
   * is how it moves — a patch field for it would let the two disagree, which is the one
   * failure mode that leaves a market rendering in a language it does not read.
   */
}

export const CountryPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currencyCode: currencyCode.optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/, RegionError.invalidTimezone)
    .optional(),
  dialCode: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{0,3}$/, RegionError.invalidDialCode)
    .optional(),
  isActive: z.boolean().optional(),
  sort,
});

@InputType({ description: 'Replace a country’s language set wholesale.' })
export class CountryLanguagesInput {
  @Field(() => String) countryCode!: string;
  @Field(() => [CountryLanguageInput]) languages!: CountryLanguageInput[];
}

export const CountryLanguagesSchema = z.object({
  countryCode,
  languages: languageEntries,
});
