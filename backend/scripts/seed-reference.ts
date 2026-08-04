/**
 * E3's reference-data bootstrap.
 *
 *   bun run seed:reference
 *
 * Writes the rows the platform cannot function without, and only those:
 *
 *   currencies · countries · languages · country_languages · tax_rules · roles · permissions
 *
 * ## Why this exists in E3 rather than E12
 *
 * E12 owns "Seeders", and it still does — the demo restaurants, the Phase C `usr_*` accounts,
 * the sample orders. This is a different thing: `User.countryCode` is a **non-null foreign key**
 * to `countries`, so until a country row exists, no account can be created by any means. E2 shipped
 * with that as a known cutover blocker. The tables in question are exactly the ones E3 introduces,
 * so the phase that owns them is the phase that should be able to populate them.
 *
 * The role and permission rows are the same argument from the other direction: E2's registration
 * logs a warning and skips the role assignment when the `Role` row is missing, which leaves every
 * account with a working role gate and an **empty permission set**. That is a deliberate
 * degradation, not a design — and this is what undoes it.
 *
 * ## Idempotent, and safe to re-run
 *
 * Every write is an upsert on a natural key. Re-running after adding a country to
 * `frontend/config/regions.ts`'s equivalent below adds that country and leaves the rest alone.
 *
 * Two deliberate non-behaviours:
 *
 * - **It never deletes.** A currency removed from this file stays in the database, because a row
 *   here may be referenced by accounts, branches and zones.
 * - **It does not overwrite `isActive` or `sort` on an existing row.** Those are operational
 *   decisions an operator makes through the admin API, and a re-run of the bootstrap should not
 *   silently re-open a market somebody closed.
 *
 * ## Verified
 *
 * Run against real PostgreSQL from V1 Unit 2 onwards. The E3 note that said this had never
 * touched a database was true when written and is no longer: Postgres.app was already on the
 * development machine, `psql` simply was not on `PATH`.
 *
 * `tax_rules` arrived in Unit 3, and it is the one section here whose *values* matter rather than
 * just its rows: a wrong rate charges every customer in that market the wrong amount.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { IdService } from '../src/common/ids';
import { PrismaService } from '../src/infrastructure/prisma';
import { BUILTIN_ROLES } from '../src/modules/rbac/domain';
import { PERMISSION_CATALOGUE } from '../src/shared/permissions';

/**
 * The five markets `frontend/config/regions.ts` has served since Phase C, and the three locales
 * from `frontend/config/i18n/config.ts`.
 *
 * Copied rather than imported: the two repositories do not share a build, and the point of this
 * phase is that the *database* becomes the source of truth. Once the frontend reads `countries`
 * from the API, its local constant becomes a fallback and this becomes the original.
 *
 * `taxRate` and `taxLabel` from the frontend's `Country` do not live on `Country` here: they are
 * `TaxRule` rows, which are dated and scoped because one order can attract several rules at once.
 * V1 Unit 3 seeds them below, because checkout cannot price an order without them.
 */
const CURRENCIES = [
  { code: 'BDT', symbol: '৳', formatLocale: 'bn-BD', fractionDigits: 0, sort: 0 },
  { code: 'USD', symbol: '$', formatLocale: 'en-US', fractionDigits: 2, sort: 1 },
  { code: 'GBP', symbol: '£', formatLocale: 'en-GB', fractionDigits: 2, sort: 2 },
  { code: 'EUR', symbol: '€', formatLocale: 'de-DE', fractionDigits: 2, sort: 3 },
  { code: 'AED', symbol: 'د.إ', formatLocale: 'ar-AE', fractionDigits: 2, sort: 4 },
] as const;

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'LTR', sort: 0 },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'LTR', sort: 1 },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'RTL', sort: 2 },
] as const;

/** `languages` is the served set; the first entry is the default and becomes `defaultLocale`. */
const COUNTRIES = [
  {
    code: 'BD',
    name: 'Bangladesh',
    currencyCode: 'BDT',
    timezone: 'Asia/Dhaka',
    dialCode: '+880',
    languages: ['bn', 'en'],
    sort: 0,
  },
  {
    code: 'US',
    name: 'United States',
    currencyCode: 'USD',
    timezone: 'America/New_York',
    dialCode: '+1',
    languages: ['en'],
    sort: 1,
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currencyCode: 'GBP',
    timezone: 'Europe/London',
    dialCode: '+44',
    languages: ['en'],
    sort: 2,
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    currencyCode: 'AED',
    timezone: 'Asia/Dubai',
    dialCode: '+971',
    languages: ['ar', 'en'],
    sort: 3,
  },
  {
    code: 'DE',
    name: 'Germany',
    currencyCode: 'EUR',
    timezone: 'Europe/Berlin',
    dialCode: '+49',
    languages: ['en'],
    sort: 4,
  },
] as const;

/**
 * Consumption tax per market, copied from `frontend/config/regions.ts` — the same rates the
 * prototype's checkout has always charged.
 *
 * ## Why this is reference data and not demo data
 *
 * Because checkout cannot price an order without it, and getting it wrong is not a cosmetic
 * failure: no rule means no tax, so a market with no row silently undercharges every order in
 * it. A production install runs `seed:reference` and neither of the other two seeders, which
 * makes this the only seeder allowed to carry it.
 *
 * ## Why the rates match the frontend exactly
 *
 * Because the frontend still computes the total it displays, and will keep doing so — the
 * summary has to update the instant a tip is tapped. If these rates and
 * `config/regions.ts::countries[cc].taxRate` disagreed, the checkout screen would show one
 * total and the receipt another, which reads as a bug whichever number is right.
 * `verify:checkout` asserts the two agree.
 *
 * ## What is deliberately narrow
 *
 * One rule per country, `appliesTo: ORDER_SUBTOTAL`, no city or vendor narrowing, no end
 * date. `tax_rules` models much more than that — a municipal levy on delivery, a vendor
 * override, a rate that changes on a date — and V1 needs none of it. `effectiveFrom` is the
 * Unix epoch so that no clock skew or backdated order can find itself before the rule that
 * governs it.
 */
const TAX_RULES = [
  { countryCode: 'BD', label: 'VAT', rate: '0.0500' },
  { countryCode: 'US', label: 'Sales Tax', rate: '0.0875' },
  { countryCode: 'GB', label: 'VAT', rate: '0.2000' },
  { countryCode: 'AE', label: 'VAT', rate: '0.0500' },
  { countryCode: 'DE', label: 'VAT', rate: '0.1900' },
] as const;

/** Before any order could exist, so no order can predate the rule that prices it. */
const TAX_EFFECTIVE_FROM = new Date('1970-01-01T00:00:00.000Z');

interface Counts {
  currencies: number;
  languages: number;
  countries: number;
  countryLanguages: number;
  taxRules: number;
  permissions: number;
  roles: number;
  rolePermissions: number;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const ids = app.get(IdService);
  const db = prisma.db;

  const counts: Counts = {
    currencies: 0,
    languages: 0,
    countries: 0,
    countryLanguages: 0,
    taxRules: 0,
    permissions: 0,
    roles: 0,
    rolePermissions: 0,
  };

  // --- currencies -----------------------------------------------------------
  // Before countries, because `Country.currencyCode` is an FK onto this.
  for (const currency of CURRENCIES) {
    await db.currency.upsert({
      where: { code: currency.code },
      create: { ...currency, isActive: true },
      // `isActive` and `sort` are left alone: they are operational decisions made through the
      // admin API, and a re-run must not re-enable something somebody switched off.
      update: {
        symbol: currency.symbol,
        formatLocale: currency.formatLocale,
        fractionDigits: currency.fractionDigits,
        deletedAt: null,
      },
    });
    counts.currencies += 1;
  }

  // --- languages ------------------------------------------------------------
  for (const language of LANGUAGES) {
    await db.language.upsert({
      where: { code: language.code },
      create: { ...language, isActive: true },
      update: {
        name: language.name,
        nativeName: language.nativeName,
        direction: language.direction,
        deletedAt: null,
      },
    });
    counts.languages += 1;
  }

  // --- countries and their language sets ------------------------------------
  for (const country of COUNTRIES) {
    const defaultLocale = country.languages[0];

    await db.country.upsert({
      where: { code: country.code },
      create: {
        code: country.code,
        name: country.name,
        currencyCode: country.currencyCode,
        timezone: country.timezone,
        dialCode: country.dialCode,
        defaultLocale,
        isActive: true,
        sort: country.sort,
      },
      update: {
        name: country.name,
        currencyCode: country.currencyCode,
        timezone: country.timezone,
        dialCode: country.dialCode,
        defaultLocale,
        deletedAt: null,
      },
    });
    counts.countries += 1;

    for (const [index, languageCode] of country.languages.entries()) {
      await db.countryLanguage.upsert({
        where: {
          countryCode_languageCode: { countryCode: country.code, languageCode },
        },
        create: {
          countryCode: country.code,
          languageCode,
          isDefault: index === 0,
          sort: index,
        },
        update: { isDefault: index === 0, sort: index },
      });
      counts.countryLanguages += 1;
    }
  }

  // --- tax rules ------------------------------------------------------------
  /**
   * Keyed by (country, kind, appliesTo, effectiveFrom) rather than by a minted id, so a re-run
   * updates the one rule per market instead of stacking a second one beside it. `tax_rules` has
   * no natural unique constraint — it cannot, since dated overlapping rules are the feature —
   * so the lookup is a `findFirst` and the write is a create-or-update by hand.
   */
  for (const rule of TAX_RULES) {
    const existing = await db.taxRule.findFirst({
      where: {
        countryCode: rule.countryCode,
        appliesTo: 'ORDER_SUBTOTAL',
        region: null,
        city: null,
        vendorId: null,
      },
      select: { id: true },
    });

    if (existing) {
      await db.taxRule.update({
        where: { id: existing.id },
        data: {
          label: rule.label,
          rate: rule.rate,
          kind: rule.countryCode === 'US' ? 'SALES_TAX' : 'VAT',
          effectiveFrom: TAX_EFFECTIVE_FROM,
          effectiveTo: null,
          deletedAt: null,
        },
      });
    } else {
      await db.taxRule.create({
        data: {
          id: ids.next('taxRule'),
          countryCode: rule.countryCode,
          kind: rule.countryCode === 'US' ? 'SALES_TAX' : 'VAT',
          appliesTo: 'ORDER_SUBTOTAL',
          label: rule.label,
          rate: rule.rate,
          isInclusive: false,
          effectiveFrom: TAX_EFFECTIVE_FROM,
        },
      });
    }
    counts.taxRules += 1;
  }

  // --- permissions ----------------------------------------------------------
  // Before roles, because `RolePermission` connects by permission slug.
  for (const permission of PERMISSION_CATALOGUE) {
    await db.permission.upsert({
      where: { slug: permission.slug },
      create: {
        id: ids.next('permission'),
        slug: permission.slug,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      update: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
    });
    counts.permissions += 1;
  }

  // --- the fourteen built-in roles ------------------------------------------
  for (const role of BUILTIN_ROLES) {
    /**
     * Permission grants are attached **only when the role row is new**.
     *
     * `BUILTIN_ROLES` is a starting point, not a constraint the code re-asserts. An operator who
     * decides that customer-support may also cancel orders has made a business decision, and a
     * bootstrap re-run must not undo it — which is the one place in this script where being
     * idempotent about *everything* would have been wrong: it would turn a re-run into a reset of
     * the permission matrix.
     *
     * Identity and rank *are* refreshed on every run, because those are facts about the software.
     */
    const existed = await db.role.findUnique({ where: { slug: role.slug }, select: { id: true } });

    await db.role.upsert({
      where: { slug: role.slug },
      create: {
        id: ids.next('role'),
        slug: role.slug,
        name: role.name,
        description: role.description,
        builtin: toBuiltinEnum(role.slug),
        isSystem: true,
        rank: role.rank,
        permissions: {
          create: role.permissions.map((slug) => ({ permission: { connect: { slug } } })),
        },
      },
      update: {
        name: role.name,
        description: role.description,
        builtin: toBuiltinEnum(role.slug),
        isSystem: true,
        rank: role.rank,
        deletedAt: null,
      },
    });

    counts.roles += 1;
    if (!existed) counts.rolePermissions += role.permissions.length;
  }

  await app.close();

  console.log('✓ Reference data written.');
  console.table(counts);
  console.log(
    '\nThe role→permission grants above are written for NEW roles only, so an operator’s\n' +
      'edits to a built-in’s permissions survive a re-run.',
  );
}

/**
 * Wire slug → the Prisma client's enum member: `restaurant-owner` → `RESTAURANT_OWNER`.
 *
 * Done inline rather than through `enumCodec` because that returns the literal union type only
 * when parameterised, and a script's one call site does not justify threading `$Enums` through.
 * The transformation is exactly the schema's `@map` convention, in reverse.
 */
function toBuiltinEnum(slug: string) {
  return slug.toUpperCase().replace(/-/g, '_') as never;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
