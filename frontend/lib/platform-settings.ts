import {
  countries,
  defaultCountry as configDefaultCountry,
  type CountryCode,
} from "@/config/regions";
import type {
  DeliveryZone,
  PlatformRegion,
  PlatformSettings,
  PlatformSettingsDraft,
  RegionPatch,
  TaxTerms,
  ZonePatch,
} from "@/types";

/**
 * platform-settings.ts — what the platform may change about itself, and whether
 * it may (Phase 19, G30).
 *
 * Pure: no clock read here (callers pass `now`), no storage, no `next-intl`, no
 * store import — the same contract `lib/vendor-settings`, `lib/menu` and
 * `lib/settlement` hold to. Every mutation is `(draft, input) → { draft, errors }`,
 * so `stores/platform-settings` commits and no form can save a rate that would
 * price an order wrong or a radius that would strand a zone.
 *
 * Two ideas carry the whole file.
 *
 * **The fold.** The platform's configuration is a diff over `config/regions.ts`
 * and `lib/mock/delivery-zones.ts`, and `effectiveSettings` is the only function
 * that applies it. Everything downstream reads the fold: the customer's location
 * picker, the serviceability notice, the checkout's tax line, the POS and dine-in
 * bills, the courier's fares and cash ceiling, and the admin screen that edits it.
 * So there is exactly one answer to "what does this zone cover" and no surface has
 * to know whether the value it is showing came from the seed or from this morning.
 * That is the arrangement `lib/vendor-settings.effectiveVendor` established, and
 * the reason this phase needed no second config table.
 *
 * **The baseline still wins where nobody has spoken.** A patch holds only the
 * fields an operator actually set. An untouched field reads from the config, so
 * editing `config/regions.ts` still reaches every device — which a stored copy of
 * the whole table would have quietly stopped doing.
 *
 * One consequence worth stating: a deactivated zone is **folded, not dropped**. It
 * comes back carrying `deletedAt`, the soft-delete marker every existing zone
 * reader already filters on (`services/delivery.getDeliveryZones`,
 * `getFleet`, the seed's own `!z.deletedAt` guards). Dropping it would have made an
 * order that was placed while the zone was live unpriceable — dispatch resolves a
 * trip's fares by looking its zone up, and a missing zone means no trip at all
 * (`services/delivery.jobForOrder`). Marking it refuses the *next* order without
 * rewriting the last one.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Everything this module can refuse, as i18n keys.
 *
 * Keys rather than prose, matching `SettingsError` and `MenuError`: the domain
 * decides *that* something is wrong, the catalogue decides how to say it, and a
 * refusal is therefore translatable and testable at once.
 */
export type PlatformSettingsError =
  | "errors.required"
  | "errors.negative"
  | "errors.invalidRate"
  | "errors.invalidMultiplier"
  | "errors.invalidRadius"
  | "errors.invalidHour"
  | "errors.pickOneArea"
  | "errors.lastRegion"
  | "errors.lastZone"
  | "errors.notFound";

/** The highest tax rate a form will accept, as a fraction. */
export const MAX_TAX_RATE = 0.5;

/** Bounds on a peak multiplier. Below 1 would make peak hours pay *less*. */
export const MIN_PEAK_MULTIPLIER = 1;
export const MAX_PEAK_MULTIPLIER = 3;

/** Bounds on the cross-zone allowance, km. Zero would strand every zone. */
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;

/** Drop the nulls, so an empty object means "nothing wrong". */
function compact(
  errors: Record<string, PlatformSettingsError | null>,
): Record<string, PlatformSettingsError> {
  return Object.entries(errors).reduce<Record<string, PlatformSettingsError>>(
    (acc, [field, error]) => {
      if (error) acc[field] = error;
      return acc;
    },
    {},
  );
}

function nonNegative(value: number): PlatformSettingsError | null {
  if (!Number.isFinite(value)) return "errors.required";
  return value < 0 ? "errors.negative" : null;
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** An untouched draft. Never null, so callers need no guard. */
export function emptyPlatformDraft(): PlatformSettingsDraft {
  return { regions: {}, zones: {}, defaultCountry: null, updatedAt: null };
}

/**
 * A shared empty draft, for a default parameter.
 *
 * Frozen because it is handed out rather than copied: a service that took this as
 * its default and mutated it would change what every other caller reads.
 */
export const EMPTY_PLATFORM_DRAFT: PlatformSettingsDraft = Object.freeze(
  emptyPlatformDraft(),
);

/** Has an operator changed anything at all? */
export function isPlatformDraftEmpty(draft: PlatformSettingsDraft): boolean {
  return (
    Object.keys(draft.regions).length === 0 &&
    Object.keys(draft.zones).length === 0 &&
    draft.defaultCountry === null
  );
}

/** Stamp the save time in one place, so no mutation forgets to. */
function touched(
  draft: PlatformSettingsDraft,
  now: number,
): PlatformSettingsDraft {
  return { ...draft, updatedAt: new Date(now).toISOString() };
}

// ---------------------------------------------------------------------------
// Tax — the one piece of the config the pricing functions read
// ---------------------------------------------------------------------------

/**
 * The tax terms for a country, from the config alone.
 *
 * The exact expression the five pricing functions in `lib/` used to inline
 * (`countries[code] ?? countries[defaultCountry]`), lifted so it exists once. A
 * country the config does not know falls back to the default, which is what every
 * one of them already did.
 */
function configTax(countryCode: string | null | undefined): TaxTerms {
  const country =
    countries[countryCode as CountryCode] ?? countries[configDefaultCountry];
  return { rate: country.taxRate, label: country.taxLabel };
}

/**
 * The tax terms a pricing function should use — the seam the five of them take.
 *
 * `override` is what a caller injects: the fold's answer for this country, read
 * from the store by whichever client surface is pricing. Absent, the config's own
 * row is used, which is exactly the behaviour before this phase — so a server
 * component (the meal-plan page) and the deterministic seeds
 * (`lib/mock/demo-orders`, `vendor-orders`, `delivery-jobs`) are unchanged by
 * construction rather than by remembering to leave them alone.
 */
export function resolveTax(
  countryCode: string | null | undefined,
  override?: TaxTerms | null,
): TaxTerms {
  return override ?? configTax(countryCode);
}

/**
 * The effective tax terms for a country, with the operator's edit applied.
 *
 * What a client surface passes as `resolveTax`'s override. Reads the draft rather
 * than the fold so a caller that only needs a rate does not have to build every
 * region and zone to get one.
 */
export function taxFor(
  draft: PlatformSettingsDraft,
  countryCode: string | null | undefined,
): TaxTerms {
  const base = configTax(countryCode);
  const patch = draft.regions[String(countryCode ?? "")];
  if (!patch) return base;
  return {
    rate: patch.taxRate ?? base.rate,
    label: patch.taxLabel ?? base.label,
  };
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

/**
 * Every country the config knows, with the draft applied.
 *
 * Config order, not alphabetical and not "edited first": a table that reshuffles
 * when somebody saves a rate is a table nobody can find a row in twice.
 */
export function effectiveRegions(draft: PlatformSettingsDraft): PlatformRegion[] {
  return Object.values(countries).map((country) => {
    const patch = draft.regions[country.code];
    if (!patch) return { country, active: true, authored: false };
    return {
      country: {
        ...country,
        taxRate: patch.taxRate ?? country.taxRate,
        taxLabel: patch.taxLabel ?? country.taxLabel,
      },
      active: patch.active ?? true,
      authored: true,
    };
  });
}

/**
 * Every zone in the seed, with the draft applied.
 *
 * A deactivated zone keeps its row and gains `deletedAt` — see the file header for
 * why it is marked rather than removed. `updatedAt` moves to the save time so a
 * screen showing the record can say when it last changed without consulting the
 * draft.
 */
export function effectiveZones(
  seed: readonly DeliveryZone[],
  draft: PlatformSettingsDraft,
): DeliveryZone[] {
  return seed.map((zone) => {
    const patch = draft.zones[zone.id];
    if (!patch) return zone;

    const at = draft.updatedAt ?? zone.updatedAt;
    const next: DeliveryZone = {
      ...zone,
      name: patch.name ?? zone.name,
      areas: patch.areas ?? zone.areas,
      deliveryRadiusKm: patch.deliveryRadiusKm ?? zone.deliveryRadiusKm,
      baseFare: patch.baseFare ?? zone.baseFare,
      perKm: patch.perKm ?? zone.perKm,
      peakMultiplier: patch.peakMultiplier ?? zone.peakMultiplier,
      peakHours: patch.peakHours ?? zone.peakHours,
      batchBonus: patch.batchBonus ?? zone.batchBonus,
      cashLimit: patch.cashLimit ?? zone.cashLimit,
      updatedAt: at,
      deletedAt: patch.active === false ? at : zone.deletedAt,
    };
    return next;
  });
}

/** The effective fallback country. The config's own default until somebody moves it. */
export function effectiveDefaultCountry(draft: PlatformSettingsDraft): string {
  const chosen = draft.defaultCountry;
  return chosen && chosen in countries ? chosen : configDefaultCountry;
}

/**
 * The whole configuration, folded — what `services/platform-settings` returns and
 * what the admin screen renders.
 */
export function effectiveSettings(
  seed: readonly DeliveryZone[],
  draft: PlatformSettingsDraft,
): PlatformSettings {
  return {
    regions: effectiveRegions(draft),
    zones: effectiveZones(seed, draft),
    defaultCountry: effectiveDefaultCountry(draft),
    authored: !isPlatformDraftEmpty(draft),
    updatedAt: draft.updatedAt,
  };
}

/** The zones a new order may be placed into — the fold, minus the deactivated. */
export function serviceableZones(
  seed: readonly DeliveryZone[],
  draft: PlatformSettingsDraft,
): DeliveryZone[] {
  return effectiveZones(seed, draft).filter((zone) => !zone.deletedAt);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * A country's terms.
 *
 * A negative rate would credit tax back to the customer and a rate above
 * `MAX_TAX_RATE` is a typo rather than a jurisdiction — `0.19` typed as `19` is
 * the mistake this catches, and it would otherwise multiply every order on the
 * platform by twenty. The label is required because `OrderPricing.taxLabel` is
 * what the receipt prints, and an empty one leaves a bare number on the bill.
 */
export function regionErrors(
  patch: Pick<RegionPatch, "taxRate" | "taxLabel">,
): Record<string, PlatformSettingsError> {
  const rate = patch.taxRate ?? 0;
  return compact({
    taxRate: !Number.isFinite(rate)
      ? "errors.required"
      : rate < 0 || rate > MAX_TAX_RATE
        ? "errors.invalidRate"
        : null,
    taxLabel: patch.taxLabel?.trim() ? null : "errors.required",
  });
}

/**
 * A zone's terms.
 *
 * Every rule here is a thing a courier or a customer would otherwise hit. A zone
 * with no areas covers nowhere, so `zoneForArea` could never match it and the
 * picker would offer an empty list. A radius of zero would refuse every
 * cross-zone restaurant, which is most of the catalog. A peak multiplier below 1
 * would make peak hours pay *less* than quiet ones, which is the opposite of what
 * the field means. A peak hour outside 0–23 is not an hour. Negative fares and a
 * negative cash limit would pay a courier to refuse work.
 */
export function zoneErrors(
  patch: Required<Omit<ZonePatch, "active">>,
): Record<string, PlatformSettingsError> {
  const areas = patch.areas.map((a) => a.trim()).filter(Boolean);
  const radius = patch.deliveryRadiusKm;
  const peak = patch.peakMultiplier;

  return compact({
    name: patch.name.trim() ? null : "errors.required",
    areas: areas.length > 0 ? null : "errors.pickOneArea",
    deliveryRadiusKm: !Number.isFinite(radius)
      ? "errors.required"
      : radius < MIN_RADIUS_KM || radius > MAX_RADIUS_KM
        ? "errors.invalidRadius"
        : null,
    baseFare: nonNegative(patch.baseFare),
    perKm: nonNegative(patch.perKm),
    batchBonus: nonNegative(patch.batchBonus),
    cashLimit: nonNegative(patch.cashLimit),
    peakMultiplier: !Number.isFinite(peak)
      ? "errors.required"
      : peak < MIN_PEAK_MULTIPLIER || peak > MAX_PEAK_MULTIPLIER
        ? "errors.invalidMultiplier"
        : null,
    peakHours: patch.peakHours.every(
      (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
    )
      ? null
      : "errors.invalidHour",
  });
}

// ---------------------------------------------------------------------------
// Mutations — every one returns the next draft, or the errors that stopped it
// ---------------------------------------------------------------------------

/** A saved-draft result. `errors` empty means `draft` is the committed one. */
export interface PlatformDraftResult {
  draft: PlatformSettingsDraft;
  errors: Record<string, PlatformSettingsError>;
}

/** Free of edits and back to the config — dropped, not emptied. See `stores/menu`. */
function withoutRegion(
  draft: PlatformSettingsDraft,
  code: string,
): PlatformSettingsDraft {
  const regions = { ...draft.regions };
  delete regions[code];
  return { ...draft, regions };
}

/**
 * Save a country's tax terms.
 *
 * The patch records only what differs from the config, so an operator who types
 * the config's own values back in leaves no patch behind and the row goes on
 * tracking `config/regions.ts`. That is not a micro-optimisation: a stored value
 * identical to the seed is indistinguishable from an edit until the seed changes,
 * and then it silently pins the old number.
 */
export function saveRegion(
  draft: PlatformSettingsDraft,
  code: string,
  input: { taxRate: number; taxLabel: string },
  now: number,
): PlatformDraftResult {
  const base = countries[code as CountryCode];
  if (!base) return { draft, errors: { region: "errors.notFound" } };

  const errors = regionErrors(input);
  if (Object.keys(errors).length) return { draft, errors };

  const previous = draft.regions[code];
  const label = input.taxLabel.trim();
  const patch: RegionPatch = {
    ...(input.taxRate === base.taxRate ? {} : { taxRate: input.taxRate }),
    ...(label === base.taxLabel ? {} : { taxLabel: label }),
    ...(previous?.active === false ? { active: false } : {}),
  };

  const next =
    Object.keys(patch).length === 0
      ? withoutRegion(draft, code)
      : { ...draft, regions: { ...draft.regions, [code]: patch } };
  return { draft: touched(next, now), errors: {} };
}

/**
 * Trade there, or stop trading there.
 *
 * Refused when it would be the last one. A platform that trades nowhere cannot
 * price an order at all — `resolveTax` would fall back to a country the operator
 * has just switched off — and "you have turned everything off" is a state a form
 * should refuse to reach rather than a state to recover from.
 */
export function setRegionActive(
  draft: PlatformSettingsDraft,
  code: string,
  active: boolean,
  now: number,
): PlatformDraftResult {
  if (!(code in countries)) return { draft, errors: { region: "errors.notFound" } };

  if (!active) {
    const live = effectiveRegions(draft).filter((r) => r.active);
    if (live.length <= 1) return { draft, errors: { active: "errors.lastRegion" } };
    // The fallback country cannot be one the platform does not trade in.
    if (effectiveDefaultCountry(draft) === code) {
      return { draft, errors: { active: "errors.lastRegion" } };
    }
  }

  // Back to trading is the config's own answer, so the flag is *removed* rather
  // than written as `true` — and if it was the only thing this row held, the row
  // goes with it. `{ active: true }` left behind would be an edit that says
  // nothing, which is the state `saveRegion` takes the same trouble to avoid.
  const { taxRate, taxLabel } = draft.regions[code] ?? {};
  const patch = prune<RegionPatch>({
    taxRate,
    taxLabel,
    active: active ? undefined : false,
  });

  const next =
    Object.keys(patch).length === 0
      ? withoutRegion(draft, code)
      : { ...draft, regions: { ...draft.regions, [code]: patch } };
  return { draft: touched(next, now), errors: {} };
}

/** Which country a record with no country of its own is priced in. */
export function setDefaultCountry(
  draft: PlatformSettingsDraft,
  code: string,
  now: number,
): PlatformDraftResult {
  if (!(code in countries)) return { draft, errors: { region: "errors.notFound" } };
  const region = effectiveRegions(draft).find((r) => r.country.code === code);
  if (!region?.active) return { draft, errors: { region: "errors.notFound" } };

  const next: PlatformSettingsDraft = {
    ...draft,
    defaultCountry: code === configDefaultCountry ? null : code,
  };
  return { draft: touched(next, now), errors: {} };
}

/** Free of edits and back to the seed — dropped, not emptied. */
function withoutZone(
  draft: PlatformSettingsDraft,
  id: string,
): PlatformSettingsDraft {
  const zones = { ...draft.zones };
  delete zones[id];
  return { ...draft, zones };
}

/** What the zone form submits — every field, because the form shows every field. */
export interface ZoneInput {
  name: string;
  areas: string[];
  deliveryRadiusKm: number;
  baseFare: number;
  perKm: number;
  peakMultiplier: number;
  peakHours: number[];
  batchBonus: number;
  cashLimit: number;
}

/**
 * Save a zone's coverage and fares.
 *
 * The same "record only the difference" rule `saveRegion` follows, field by
 * field, so a zone nobody has really changed keeps tracking
 * `lib/mock/delivery-zones.ts`. `areas` and `peakHours` are compared by content
 * because they arrive as fresh arrays on every keystroke and a reference check
 * would call every save a change.
 */
export function saveZone(
  draft: PlatformSettingsDraft,
  seed: readonly DeliveryZone[],
  id: string,
  input: ZoneInput,
  now: number,
): PlatformDraftResult {
  const base = seed.find((zone) => zone.id === id);
  if (!base) return { draft, errors: { zone: "errors.notFound" } };

  const areas = input.areas.map((a) => a.trim()).filter(Boolean);
  const peakHours = [...new Set(input.peakHours)].sort((a, b) => a - b);
  const errors = zoneErrors({ ...input, areas, peakHours });
  if (Object.keys(errors).length) return { draft, errors };

  const previous = draft.zones[id];
  const patch: ZonePatch = {
    ...(input.name.trim() === base.name ? {} : { name: input.name.trim() }),
    ...(sameNumbers(peakHours, base.peakHours) ? {} : { peakHours }),
    ...(sameStrings(areas, base.areas) ? {} : { areas }),
    ...(input.deliveryRadiusKm === base.deliveryRadiusKm
      ? {}
      : { deliveryRadiusKm: input.deliveryRadiusKm }),
    ...(input.baseFare === base.baseFare ? {} : { baseFare: input.baseFare }),
    ...(input.perKm === base.perKm ? {} : { perKm: input.perKm }),
    ...(input.peakMultiplier === base.peakMultiplier
      ? {}
      : { peakMultiplier: input.peakMultiplier }),
    ...(input.batchBonus === base.batchBonus ? {} : { batchBonus: input.batchBonus }),
    ...(input.cashLimit === base.cashLimit ? {} : { cashLimit: input.cashLimit }),
    ...(previous?.active === false ? { active: false } : {}),
  };

  const next =
    Object.keys(patch).length === 0
      ? withoutZone(draft, id)
      : { ...draft, zones: { ...draft.zones, [id]: patch } };
  return { draft: touched(next, now), errors: {} };
}

/**
 * Open a zone, or close it.
 *
 * Refused when it would be the last one open. A network with no zones serves
 * nowhere: `servedAreas` would return an empty list, the location picker would
 * have nothing to offer, and every address in the country would answer
 * `outsideNetwork`. The delivery network switching itself off is not a
 * configuration an operator can have meant.
 */
export function setZoneActive(
  draft: PlatformSettingsDraft,
  seed: readonly DeliveryZone[],
  id: string,
  active: boolean,
  now: number,
): PlatformDraftResult {
  if (!seed.some((zone) => zone.id === id)) {
    return { draft, errors: { zone: "errors.notFound" } };
  }

  if (!active && serviceableZones(seed, draft).length <= 1) {
    return { draft, errors: { active: "errors.lastZone" } };
  }

  // Reopening removes the flag rather than writing `true` — see `setRegionActive`.
  const patch = prune<ZonePatch>({
    ...draft.zones[id],
    active: active ? undefined : false,
  });

  const next =
    Object.keys(patch).length === 0
      ? withoutZone(draft, id)
      : { ...draft, zones: { ...draft.zones, [id]: patch } };
  return { draft: touched(next, now), errors: {} };
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * Drop the `undefined` members of a patch.
 *
 * A patch's keys are what an operator actually set, and `{ active: undefined }`
 * has a key — so `Object.keys(...).length === 0` (the test for "this row is back
 * to the baseline, drop it") would answer no for a row holding nothing. It also
 * survives `JSON.stringify` as an absent key on one device and a present one on
 * another, which is the kind of difference a persisted diff should not have.
 */
function prune<T extends object>(patch: T): T {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as T;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

// ---------------------------------------------------------------------------
// Reading, for the screen
// ---------------------------------------------------------------------------

/**
 * How many areas the network covers, and how many zones are open.
 *
 * Derived at read time rather than stored, for the reason `lib/risk` derives every
 * flag: a count kept in step by whatever remembered to would be wrong exactly
 * when somebody was reading it.
 */
export function networkReach(zones: readonly DeliveryZone[]): {
  openZones: number;
  areas: number;
} {
  const open = zones.filter((zone) => !zone.deletedAt);
  return {
    openZones: open.length,
    areas: new Set(open.flatMap((zone) => zone.areas)).size,
  };
}
