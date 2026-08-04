/**
 * The catalog's vocabularies, verbatim from `frontend/types/common.ts`.
 *
 * All three are kebab-case in at least one member — `cloud-kitchen`,
 * `gluten-free`, `delivery-time` — which is why they reach the wire as validated
 * scalars rather than GraphQL enums (D5 §Enums). Postgres keeps native enums
 * underneath with the same `@map`ped labels, and `assertVocabularyMatches` in
 * `CatalogModule.onModuleInit` fails the boot if the two ever drift.
 */

/** `frontend/types/common.ts::VendorType`. Postgres: `vendor_type_kind`. */
export const VENDOR_TYPES = ['restaurant', 'cafe', 'cloud-kitchen', 'home-chef', 'catering'] as const;

export type VendorType = (typeof VENDOR_TYPES)[number];

/** `frontend/types/common.ts::DietaryTag`. Postgres: `dietary_tag_kind`. */
export const DIETARY_TAGS = [
  'halal',
  'vegetarian',
  'vegan',
  'gluten-free',
  'keto',
  'healthy',
  'spicy',
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

/**
 * `frontend/types/common.ts::Weekday`, in the order `WeeklyHours` is keyed.
 *
 * Postgres: `weekday_kind`. The order matters beyond display: it is the order the
 * seven fields of `WeeklyHours` are built in, and Monday-first is what the
 * opening-hours table on the restaurant page already renders.
 */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * How a vendor list is ordered — `frontend/services/catalog.ts::VendorQuery.sort`.
 *
 * The only vocabulary here with **no** Postgres enum behind it: it is a query
 * parameter, not a stored fact, so there is nothing for `assertVocabularyMatches`
 * to compare it against. `recommended` is the default and means featured first,
 * then rating.
 */
export const VENDOR_SORTS = ['recommended', 'rating', 'delivery-time', 'distance'] as const;

export type VendorSort = (typeof VENDOR_SORTS)[number];
