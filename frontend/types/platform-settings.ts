import type { Country } from "@/config/regions";
import type { ISODate } from "./common";
import type { DeliveryZone } from "./delivery";

/**
 * platform-settings.ts — what the platform may change about itself (Phase 19, G30).
 *
 * **There is no second configuration system here.** `config/regions.ts` is still
 * the country/currency/tax table and `lib/mock/delivery-zones.ts` is still the
 * delivery network; both remain exactly what they were, and both are now read as
 * the **baseline** rather than as the last word. What this file adds is the same
 * two things `types/vendor-settings.ts` had to add for the restaurant's own
 * settings, and for the same reasons:
 *
 *  - **A draft.** The region table is a module-scope `const` and the zones are a
 *    seeded array (and, behind `LIVE`, server-owned rows), so an operator's edit
 *    cannot be written into either. `PlatformSettingsDraft` is the *diff* and
 *    `lib/platform-settings.effectiveSettings` folds it back. That fold is the
 *    only reader, so there is no second table to keep in step.
 *  - **The fields the config genuinely does not have.** Neither table records
 *    whether the platform actually *trades* in a country or whether couriers
 *    actually *work* a zone — the seed's answer to both is "all of them, always",
 *    which is not a configuration so much as the absence of one.
 *
 * Four boundaries are deliberate and stated rather than discovered:
 *
 *  - **Currency definitions are not editable.** `Currency.symbol`, `.locale` and
 *    `.fractionDigits` are facts about ISO 4217 and `Intl`, not platform policy.
 *    An operator who could set BDT to two decimals would not be configuring the
 *    platform, they would be breaking `lib/format`. The tax *rate* and the tax
 *    *label* are policy and are editable; the money's own shape is not.
 *  - **A zone's centre, city and currency are not editable either.** They are the
 *    zone's identity — `lat`/`lng` place every synthesised pickup in
 *    `lib/mock/delivery-jobs`, and moving one would silently re-price a seeded
 *    week. What an operator changes is what a zone *costs* and what it *covers*.
 *  - **A restaurant's own delivery terms stay the restaurant's.**
 *    `VendorDeliverySettings` (its fee, minimum, free-over threshold and ETA)
 *    already has an owner and a surface. This is the geography those terms are
 *    applied inside — the boundary `components/dashboard/settings/delivery-panel`
 *    has stated since Phase 10.
 *  - **Commission is not here.** `Vendor.commissionRate` is a negotiated term per
 *    restaurant with `DEFAULT_COMMISSION_RATE` behind it (`lib/settlement`), which
 *    is a money-domain decision from Phase 2 and not a platform preference.
 */

/**
 * The tax terms an order is priced with.
 *
 * Two fields, because the five pricing functions in `lib/` read exactly two
 * fields off a `Country` — `taxRate` and `taxLabel` — and passing the whole
 * country would let a caller inject a rate for one place and a label for another.
 * `lib/platform-settings.resolveTax` is what turns a country code into one of
 * these, so the fallback to the config lives in one function.
 */
export interface TaxTerms {
  /** 0–1. `OrderPricing.taxRate` is this value. */
  rate: number;
  /** "VAT", "Sales Tax" — what the receipt calls the line. */
  label: string;
}

/**
 * What an operator may change about a country the platform trades in.
 *
 * Every member optional on purpose, and the distinction matters: an absent field
 * means "nobody has touched this", which is a different fact from "somebody set
 * it to the value the config already had" — only the first can pick up a change
 * to `config/regions.ts`.
 */
export interface RegionPatch {
  /** Consumption tax / VAT applied to orders, 0–1. */
  taxRate?: number;
  taxLabel?: string;
  /** Whether the platform trades there at all. */
  active?: boolean;
}

/**
 * What an operator may change about a delivery zone.
 *
 * The fares (`baseFare`, `perKm`, `peakMultiplier`, `peakHours`, `batchBonus`)
 * are what a trip in this zone pays a courier; `cashLimit` is what a courier may
 * hold before a remittance is required; `areas` and `deliveryRadiusKm` are what
 * the zone *covers* and therefore what serviceability answers. See the file
 * header for what is deliberately absent.
 */
export interface ZonePatch {
  name?: string;
  /** The area labels a dropoff address is matched against. */
  areas?: string[];
  /** Cross-zone reach: how far outside a restaurant may be and still deliver in. */
  deliveryRadiusKm?: number;
  baseFare?: number;
  perKm?: number;
  peakMultiplier?: number;
  /** Local hours (0–23) that count as peak here. */
  peakHours?: number[];
  batchBonus?: number;
  cashLimit?: number;
  /** Whether couriers work this zone at all. */
  active?: boolean;
}

/**
 * Everything an operator has changed about the platform's configuration.
 *
 * One draft rather than one per section, because a platform has one configuration
 * and a save to the tax table and a save to a zone are edits to the same record.
 * Keyed maps rather than arrays so a patch is addressed by the id of the thing it
 * patches and two saves to one country cannot both survive.
 */
export interface PlatformSettingsDraft {
  /** ISO 3166-1 alpha-2 → what changed about that country. */
  regions: Record<string, RegionPatch>;
  /** Zone id → what changed about that zone. */
  zones: Record<string, ZonePatch>;
  /**
   * Which country a surface falls back to when a record does not name one.
   * `null` means the config's own `defaultCountry` still stands.
   */
  defaultCountry: string | null;
  /** When the operator last saved anything. Null while the draft is empty. */
  updatedAt: ISODate | null;
}

/** One country, as the platform actually trades in it. Derived, never stored. */
export interface PlatformRegion {
  /** The config's row with the draft's tax terms applied. */
  country: Country;
  /** Whether the platform trades there. Seeded true — the config has no such field. */
  active: boolean;
  /** Whether any of this came from an operator rather than `config/regions.ts`. */
  authored: boolean;
}

/**
 * The platform as it actually is — the fold, and the only thing surfaces read.
 *
 * Derived, never stored. `authored` says whether any of this came from an operator
 * rather than the config, so a screen can label an edited value without diffing
 * the tables itself.
 */
export interface PlatformSettings {
  /** Every country in `config/regions.ts`, folded. Config order. */
  regions: PlatformRegion[];
  /**
   * Every zone in the seed, folded. A deactivated zone is present and carries
   * `deletedAt`, which is the flag every existing zone reader already filters on
   * — so dispatch can still price an order that was placed while the zone was
   * live, and serviceability still refuses a new one.
   */
  zones: DeliveryZone[];
  /** The effective fallback country code. */
  defaultCountry: string;
  authored: boolean;
  updatedAt: ISODate | null;
}
