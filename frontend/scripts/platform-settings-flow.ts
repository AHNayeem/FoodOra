/**
 * Phase 19 (G30) flow check — exercises the platform settings domain end to end.
 * Run from the project root:
 *
 *     NODE_ENV=test bun scripts/platform-settings-flow.ts
 *
 * Every assertion is a claim the phase makes in prose somewhere; this is where
 * those claims are checked against the code rather than against confidence. The
 * ones that matter most are the four the whole phase rests on:
 *
 *  1. **An empty draft changes nothing.** The fold over an untouched draft has to
 *     be the seed and the config, exactly, or the phase has silently repriced a
 *     platform that nobody configured.
 *  2. **A change reaches the surfaces.** A tax rate has to move the checkout, the
 *     till, the dine-in bill, the catering estimate and the meal plan; a zone's
 *     coverage has to move what the storefront accepts; a zone's fares have to
 *     move what a courier is paid.
 *  3. **A closed zone is marked, not deleted.** A new order there is refused and
 *     an order placed while it was open still prices — those are two different
 *     reads and both have to be right.
 *  4. **The refusals hold.** A rate typed as `19`, a zone covering nowhere, and
 *     the last open zone being closed all have to be refused by the domain rather
 *     than by a form remembering to.
 */
import { readFileSync } from "node:fs";

import type {
  CartLine,
  CartVendor,
  DeliveryZone,
  Order,
  PlatformSettingsDraft,
  User,
} from "@/types";
import { countries, defaultCountry } from "@/config/regions";
import { locales, type Locale } from "@/config/i18n/config";
import { buildDemoOrders, deliveryZones, users } from "@/lib/mock";
import {
  EMPTY_PLATFORM_DRAFT,
  MAX_PEAK_MULTIPLIER,
  MAX_TAX_RATE,
  effectiveDefaultCountry,
  effectiveRegions,
  effectiveSettings,
  effectiveZones,
  emptyPlatformDraft,
  isPlatformDraftEmpty,
  networkReach,
  regionErrors,
  resolveTax,
  saveRegion,
  saveZone,
  serviceableZones,
  setDefaultCountry,
  setRegionActive,
  setZoneActive,
  taxFor,
  zoneErrors,
  type PlatformSettingsError,
  type ZoneInput,
} from "@/lib/platform-settings";
import { checkArea, checkVendorDelivery, servedAreas, zoneForArea } from "@/lib/serviceability";
import { computeTotals } from "@/lib/checkout";
import { computePosTotals } from "@/lib/pos";
import { computeQrTotals } from "@/lib/qr";
import { estimateQuote } from "@/lib/catering";
import { computeSubscriptionPricing } from "@/lib/subscriptions";
import { permissionForAdminPath, permissionsFor } from "@/lib/rbac";
import { AUDIT_ENTITIES } from "@/lib/audit";
import { getDeliveryZones, jobForOrder, riderEarningForOrder } from "@/services/delivery";
import {
  getPlatformSettings,
  getServiceableZones,
  platformSettingsOf,
  savePlatformSettings,
  taxTermsFor,
} from "@/services/platform-settings";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const NOW = Date.parse("2026-08-26T12:00:00.000Z");

/** The seeded zones, by the ids the assertions below name. */
const GULSHAN = "dzn_gulshan";
const DHANMONDI = "dzn_dhanmondi";
const UTTARA = "dzn_uttara";

function seedZone(id: string): DeliveryZone {
  const zone = deliveryZones.find((z) => z.id === id);
  if (!zone) throw new Error(`no seeded zone: ${id}`);
  return zone;
}

/** A zone's editable fields, as the admin form submits them. */
function formOf(zone: DeliveryZone): ZoneInput {
  return {
    name: zone.name,
    areas: [...zone.areas],
    deliveryRadiusKm: zone.deliveryRadiusKm,
    baseFare: zone.baseFare,
    perKm: zone.perKm,
    peakMultiplier: zone.peakMultiplier,
    peakHours: [...zone.peakHours],
    batchBonus: zone.batchBonus,
    cashLimit: zone.cashLimit,
  };
}

/** Commit a mutation and fail loudly if the domain refused it. */
function commit(
  label: string,
  result: { draft: PlatformSettingsDraft; errors: Record<string, PlatformSettingsError> },
): PlatformSettingsDraft {
  check(`${label} commits`, Object.keys(result.errors).length === 0, JSON.stringify(result.errors));
  return result.draft;
}

// A basket to price. Deliberately plain: the point of every tax assertion below
// is the difference between two runs of the same numbers.
const VENDOR: CartVendor = {
  id: "vnd_test",
  slug: "test",
  name: "Test Kitchen",
  currency: "BDT",
  countryCode: "BD",
  location: { lat: 23.753, lng: 90.376, place: "Dhanmondi" },
  deliveryFee: 40,
  minOrder: 200,
  freeDeliveryOver: null,
};

const LINES: CartLine[] = [
  {
    id: "line_1",
    foodId: "food_1",
    name: "Kacchi",
    image: "",
    basePrice: 500,
    unitPrice: 500,
    quantity: 2,
    options: [],
  },
];

// ── 1. An empty draft changes nothing ────────────────────────────────────────

console.log("1. The baseline");
{
  const empty = emptyPlatformDraft();

  check("an empty draft is empty", isPlatformDraftEmpty(empty));
  check("the shared empty draft is frozen", Object.isFrozen(EMPTY_PLATFORM_DRAFT));

  // Reference identity, not deep equality: an untouched zone must come back as
  // the same object, so nothing downstream can be re-rendered or re-derived for
  // a configuration nobody changed.
  const folded = effectiveZones(deliveryZones, empty);
  check(
    "an untouched zone folds to the seed row itself",
    folded.every((zone, i) => zone === deliveryZones[i]),
  );

  const regions = effectiveRegions(empty);
  check("every configured country is folded", regions.length === Object.keys(countries).length);
  check(
    "an untouched country folds to the config row",
    regions.every((r) => {
      const base = countries[r.country.code as keyof typeof countries];
      return r.country.taxRate === base.taxRate && r.country.taxLabel === base.taxLabel;
    }),
  );
  check("every country starts trading", regions.every((r) => r.active));
  check("nothing is authored", regions.every((r) => !r.authored));
  check("the fallback country is the config's", effectiveDefaultCountry(empty) === defaultCountry);

  const settings = effectiveSettings(deliveryZones, empty);
  check("the fold is not authored", settings.authored === false);
  check("the fold has no save time", settings.updatedAt === null);

  // The five pricing functions: with no override they must produce byte-identical
  // output to the call that has no `tax` field at all, which is what the seeds and
  // the server-rendered pages take.
  const before = computeTotals({
    vendor: VENDOR,
    lines: LINES,
    tipPercent: 0.1,
    coupon: null,
    fulfillment: "delivery",
  });
  const after = computeTotals({
    vendor: VENDOR,
    lines: LINES,
    tipPercent: 0.1,
    coupon: null,
    fulfillment: "delivery",
    tax: taxFor(empty, "BD"),
  });
  check("checkout is unchanged by an empty draft", JSON.stringify(before) === JSON.stringify(after));

  const posBefore = computePosTotals({
    lines: [{ id: "l", foodId: "f", name: "Kacchi", image: "", unitPrice: 500, quantity: 2 }],
    discount: null,
    currency: "BDT",
    countryCode: "BD",
  });
  const posAfter = computePosTotals({
    lines: [{ id: "l", foodId: "f", name: "Kacchi", image: "", unitPrice: 500, quantity: 2 }],
    discount: null,
    currency: "BDT",
    countryCode: "BD",
    tax: taxFor(empty, "BD"),
  });
  check("the till is unchanged", JSON.stringify(posBefore) === JSON.stringify(posAfter));

  const qrBefore = computeQrTotals({
    lines: LINES,
    currency: "BDT",
    countryCode: "BD",
    serviceChargeRate: 0.05,
  });
  const qrAfter = computeQrTotals({
    lines: LINES,
    currency: "BDT",
    countryCode: "BD",
    serviceChargeRate: 0.05,
    tax: taxFor(empty, "BD"),
  });
  check("the dine-in bill is unchanged", JSON.stringify(qrBefore) === JSON.stringify(qrAfter));

  const cateringBefore = estimateQuote({
    pricePerGuest: 900,
    guests: 50,
    addOns: [],
    currency: "BDT",
    countryCode: "BD",
  });
  const cateringAfter = estimateQuote({
    pricePerGuest: 900,
    guests: 50,
    addOns: [],
    currency: "BDT",
    countryCode: "BD",
    tax: taxFor(empty, "BD"),
  });
  check(
    "the catering estimate is unchanged",
    JSON.stringify(cateringBefore) === JSON.stringify(cateringAfter),
  );

  const planInput = {
    pricePerMeal: 250,
    mealsPerDay: 2,
    deliveryDaysPerWeek: 5,
    cycle: "monthly" as const,
    discountRate: 0.1,
    deliveryFeePerDay: 30,
    currency: "BDT",
    countryCode: "BD",
  };
  check(
    "the meal plan is unchanged",
    JSON.stringify(computeSubscriptionPricing(planInput)) ===
      JSON.stringify(computeSubscriptionPricing({ ...planInput, tax: taxFor(empty, "BD") })),
  );

  // `resolveTax`'s fallback is the expression the five functions used to inline.
  check("an unknown country falls back to the default", resolveTax("ZZ").rate === countries[defaultCountry].taxRate);
  check("a null country falls back to the default", resolveTax(null).label === countries[defaultCountry].taxLabel);
}

// ── 2. A tax change reaches every till ───────────────────────────────────────

console.log("2. Tax terms");
{
  let draft = emptyPlatformDraft();
  const base = countries.BD;
  draft = commit(
    "doubling BD's rate",
    saveRegion(draft, "BD", { taxRate: 0.1, taxLabel: "VAT (revised)" }, NOW),
  );

  check("the draft records the rate", draft.regions.BD?.taxRate === 0.1);
  check("the draft records the label", draft.regions.BD?.taxLabel === "VAT (revised)");
  check("the draft is stamped", draft.updatedAt === new Date(NOW).toISOString());
  check("the fold reports the rate", taxFor(draft, "BD").rate === 0.1);
  check("the seam reports the rate", taxTermsFor("BD", draft).rate === 0.1);
  check("the seed's own row is untouched", countries.BD.taxRate === base.taxRate);

  const plain = computeTotals({
    vendor: VENDOR,
    lines: LINES,
    tipPercent: 0,
    coupon: null,
    fulfillment: "delivery",
  });
  const taxed = computeTotals({
    vendor: VENDOR,
    lines: LINES,
    tipPercent: 0,
    coupon: null,
    fulfillment: "delivery",
    tax: taxTermsFor("BD", draft),
  });
  check("checkout charges the new rate", taxed.taxRate === 0.1);
  check("checkout prints the new label", taxed.taxLabel === "VAT (revised)");
  check("the tax line doubles", taxed.tax === plain.tax * 2, `${plain.tax} → ${taxed.tax}`);
  check(
    "the total moves by exactly the tax",
    taxed.total - plain.total === taxed.tax - plain.tax,
    `${plain.total} → ${taxed.total}`,
  );
  check("nothing else on the bill moved", taxed.subtotal === plain.subtotal && taxed.deliveryFee === plain.deliveryFee);

  const till = computePosTotals({
    lines: [{ id: "l", foodId: "f", name: "Kacchi", image: "", unitPrice: 500, quantity: 2 }],
    discount: null,
    currency: "BDT",
    countryCode: "BD",
    tax: taxTermsFor("BD", draft),
  });
  check("the till charges the new rate", till.taxRate === 0.1 && till.taxLabel === "VAT (revised)");

  const bill = computeQrTotals({
    lines: LINES,
    currency: "BDT",
    countryCode: "BD",
    serviceChargeRate: 0.05,
    tax: taxTermsFor("BD", draft),
  });
  check("the dine-in bill charges the new rate", bill.taxRate === 0.1);

  const quote = estimateQuote({
    pricePerGuest: 900,
    guests: 50,
    addOns: [],
    currency: "BDT",
    countryCode: "BD",
    tax: taxTermsFor("BD", draft),
  });
  check("the catering estimate charges the new rate", quote.taxRate === 0.1);

  const plan = computeSubscriptionPricing({
    pricePerMeal: 250,
    mealsPerDay: 2,
    deliveryDaysPerWeek: 5,
    cycle: "monthly",
    discountRate: 0.1,
    deliveryFeePerDay: 30,
    currency: "BDT",
    countryCode: "BD",
    tax: taxTermsFor("BD", draft),
  });
  check("the meal plan charges the new rate", plan.taxRate === 0.1);

  // The whole argument for a diff: an untouched row still tracks the config.
  check("an untouched country is unaffected", taxFor(draft, "GB").rate === countries.GB.taxRate);
  check("an untouched country keeps its label", taxFor(draft, "GB").label === countries.GB.taxLabel);

  // Typing the published values back in leaves no patch behind, so the row goes
  // on tracking `config/regions.ts`.
  const reverted = commit(
    "typing the published values back",
    saveRegion(draft, "BD", { taxRate: base.taxRate, taxLabel: base.taxLabel }, NOW + 1),
  );
  check("a no-op save drops the patch", reverted.regions.BD === undefined);
  check("and the draft is empty again", isPlatformDraftEmpty(reverted));
}

// ── 3. Coverage decides what the storefront accepts ──────────────────────────

console.log("3. Coverage and serviceability");
{
  const gulshan = seedZone(GULSHAN);
  check("Banani is on the seeded network", checkArea(deliveryZones, "Banani").serviceable);

  let draft = emptyPlatformDraft();
  draft = commit(
    "removing Banani from Gulshan",
    saveZone(
      draft,
      deliveryZones,
      GULSHAN,
      { ...formOf(gulshan), areas: gulshan.areas.filter((a) => a !== "Banani") },
      NOW,
    ),
  );

  const network = serviceableZones(deliveryZones, draft);
  const banani = checkArea(network, "Banani");
  check("Banani is now off the network", !banani.serviceable);
  check("and it is refused for the right reason", banani.reason === "outsideNetwork");
  check("Gulshan 1 is still served", checkArea(network, "Gulshan 1").serviceable);
  check(
    "the picker's list loses exactly one entry",
    servedAreas(network).length === servedAreas(deliveryZones).length - 1,
  );
  check("the area count follows", networkReach(network).areas === networkReach(deliveryZones).areas - 1);
  check("the zone count does not", networkReach(network).openZones === deliveryZones.length);

  // The patch holds the areas and nothing else — the diff is a diff.
  check("only `areas` is patched", Object.keys(draft.zones[GULSHAN]!).join() === "areas");

  // Narrowing the cross-zone reach starts refusing restaurants that used to reach
  // in. Same-zone always reaches, which is what a zone *is*, so that must not move.
  let narrowed = emptyPlatformDraft();
  narrowed = commit(
    "narrowing Gulshan's reach",
    saveZone(narrowed, deliveryZones, GULSHAN, { ...formOf(gulshan), deliveryRadiusKm: 1 }, NOW),
  );
  const narrowNet = serviceableZones(deliveryZones, narrowed);

  const dhanmondiVendor = { location: { lat: 23.753, lng: 90.376, place: "Dhanmondi" } };
  const gulshanVendor = { location: { lat: 23.79, lng: 90.413, place: "Gulshan 1" } };

  check(
    "a Dhanmondi kitchen reached Gulshan on the seed",
    checkVendorDelivery(deliveryZones, dhanmondiVendor, "Gulshan 1").serviceable,
  );
  const tooFar = checkVendorDelivery(narrowNet, dhanmondiVendor, "Gulshan 1");
  check("and no longer does", !tooFar.serviceable);
  check("for the right reason", tooFar.reason === "tooFar");
  check(
    "a Gulshan kitchen still delivers in its own zone",
    checkVendorDelivery(narrowNet, gulshanVendor, "Gulshan 1").serviceable,
  );
  check(
    "a basket with no restaurant position is not refused",
    checkVendorDelivery(narrowNet, {}, "Gulshan 1").reason === "unknown",
  );
}

// ── 4. Closing a zone: marked, not deleted ───────────────────────────────────

console.log("4. Closing a zone");
{
  let draft = emptyPlatformDraft();
  draft = commit("closing Uttara", setZoneActive(draft, deliveryZones, UTTARA, false, NOW));

  const all = effectiveZones(deliveryZones, draft);
  const closed = all.find((z) => z.id === UTTARA);
  check("the closed zone is still in the fold", closed !== undefined);
  check("and carries a soft-delete marker", closed?.deletedAt === new Date(NOW).toISOString());
  check("the open zones exclude it", !serviceableZones(deliveryZones, draft).some((z) => z.id === UTTARA));
  check("the other zones are untouched", all.filter((z) => !z.deletedAt).length === deliveryZones.length - 1);

  const network = serviceableZones(deliveryZones, draft);
  const mirpur = checkArea(network, "Mirpur 10");
  check("an address in it is refused", !mirpur.serviceable && mirpur.reason === "outsideNetwork");
  check(
    "but the zone still resolves for pricing",
    zoneForArea(all, "Mirpur 10")?.id === UTTARA,
  );

  // Reopening removes the flag rather than writing `true`, so a zone nobody has
  // otherwise edited stops being a patch at all.
  const reopened = commit("reopening Uttara", setZoneActive(draft, deliveryZones, UTTARA, true, NOW + 1));
  check("reopening drops the patch", reopened.zones[UTTARA] === undefined);
  check("and the draft is empty again", isPlatformDraftEmpty(reopened));

  // A zone with a real edit keeps that edit when it is reopened.
  let edited = emptyPlatformDraft();
  edited = commit(
    "renaming Uttara",
    saveZone(edited, deliveryZones, UTTARA, { ...formOf(seedZone(UTTARA)), cashLimit: 4000 }, NOW),
  );
  edited = commit("closing it", setZoneActive(edited, deliveryZones, UTTARA, false, NOW + 1));
  edited = commit("reopening it", setZoneActive(edited, deliveryZones, UTTARA, true, NOW + 2));
  check("reopening keeps the other edits", edited.zones[UTTARA]?.cashLimit === 4000);
  check("and drops only the flag", edited.zones[UTTARA]?.active === undefined);
}

// ── 5. Fares and the cash ceiling reach the courier ──────────────────────────

console.log("5. Fares and the cash ceiling");
{
  const gulshan = seedZone(GULSHAN);
  let draft = emptyPlatformDraft();
  draft = commit(
    "doubling Gulshan's fares",
    saveZone(
      draft,
      deliveryZones,
      GULSHAN,
      { ...formOf(gulshan), baseFare: gulshan.baseFare * 2, perKm: gulshan.perKm * 2, cashLimit: 500 },
      NOW,
    ),
  );

  const zones = effectiveZones(deliveryZones, draft);
  const folded = zones.find((z) => z.id === GULSHAN)!;
  check("the fold reports the new base fare", folded.baseFare === gulshan.baseFare * 2);
  check("the fold reports the new cash ceiling", folded.cashLimit === 500);
  check("the seed row is untouched", seedZone(GULSHAN).baseFare === gulshan.baseFare);
  check("the fold restamps `updatedAt`", folded.updatedAt === new Date(NOW).toISOString());
  check("and does not soft-delete it", folded.deletedAt === null);

  // A real delivery, priced against the seed and then against the fold. This is
  // the read `stores/orders` makes when an order completes and the one
  // `useRiderRecords` makes for the wallet — the same function, one parameter apart.
  const orders: Order[] = buildDemoOrders(NOW);
  const delivered = orders.find(
    (o) =>
      o.fulfillment === "delivery" &&
      o.lifecycle.rider !== null &&
      zoneForArea(deliveryZones, o.address?.area)?.id === GULSHAN,
  );
  check("the demo set has a Gulshan delivery to price", delivered !== undefined);

  if (delivered) {
    const seedJob = jobForOrder(delivered, NOW);
    const foldJob = jobForOrder(delivered, NOW, zones);
    check("the seed prices the trip", seedJob !== null);
    check("the fold prices the trip", foldJob !== null);
    check(
      "and pays more after the fare rise",
      (foldJob?.payout.total ?? 0) > (seedJob?.payout.total ?? 0),
      `${seedJob?.payout.total} → ${foldJob?.payout.total}`,
    );

    const seedEarning = riderEarningForOrder(delivered, NOW);
    const foldEarning = riderEarningForOrder(delivered, NOW, zones);
    check(
      "the order's stamped payout follows",
      (foldEarning?.payout.total ?? 0) > (seedEarning?.payout.total ?? 0),
      `${seedEarning?.payout.total} → ${foldEarning?.payout.total}`,
    );
  }
}

// ── 6. The seam ──────────────────────────────────────────────────────────────

console.log("6. The service seam");
{
  const gulshan = seedZone(GULSHAN);
  let draft = emptyPlatformDraft();
  draft = commit("closing Uttara", setZoneActive(draft, deliveryZones, UTTARA, false, NOW));
  draft = commit(
    "renaming Gulshan",
    saveZone(draft, deliveryZones, GULSHAN, { ...formOf(gulshan), name: "Gulshan North" }, NOW + 1),
  );

  // `getDeliveryZones` is what the location picker, the rider profile and both
  // application forms call. It has to answer with the open network.
  const open = await getDeliveryZones(draft);
  check("the seam hands out the open zones", open.length === deliveryZones.length - 1);
  check("with the edits applied", open.find((z) => z.id === GULSHAN)?.name === "Gulshan North");
  check("and no closed zone", !open.some((z) => z.deletedAt));

  const defaulted = await getDeliveryZones();
  check(
    "and with no draft it is the seed",
    defaulted.length === deliveryZones.filter((z) => !z.deletedAt).length,
  );

  const serviceable = await getServiceableZones(draft);
  check("both open-network reads agree", serviceable.length === open.length);

  const settings = await getPlatformSettings(draft);
  check("the async fold includes the closed zone", settings.zones.length === deliveryZones.length);
  check("the sync fold agrees with it", platformSettingsOf(draft).zones.length === settings.zones.length);
  check("the fold is authored", settings.authored);
  check("and stamped", settings.updatedAt === new Date(NOW + 1).toISOString());

  const saved = await savePlatformSettings(draft);
  check("the write echoes the draft", saved.error === null && saved.data === draft);
}

// ── 7. The refusals ──────────────────────────────────────────────────────────

console.log("7. Refusals");
{
  // `0.19` typed as `19` is the mistake that would multiply every bill by twenty.
  check("a rate of 1900% is refused", regionErrors({ taxRate: 19, taxLabel: "VAT" }).taxRate === "errors.invalidRate");
  check("a negative rate is refused", regionErrors({ taxRate: -0.1, taxLabel: "VAT" }).taxRate === "errors.invalidRate");
  check("the ceiling is inclusive", regionErrors({ taxRate: MAX_TAX_RATE, taxLabel: "VAT" }).taxRate === undefined);
  check("an empty label is refused", regionErrors({ taxRate: 0.05, taxLabel: "  " }).taxLabel === "errors.required");
  check("a missing rate is refused", regionErrors({ taxRate: Number.NaN, taxLabel: "VAT" }).taxRate === "errors.required");
  check("an unknown country is refused", saveRegion(emptyPlatformDraft(), "ZZ", { taxRate: 0.1, taxLabel: "VAT" }, NOW).errors.region === "errors.notFound");

  const gulshan = seedZone(GULSHAN);
  const bad = (patch: Partial<ZoneInput>) => zoneErrors({ ...formOf(gulshan), ...patch });
  check("a zone covering nowhere is refused", bad({ areas: [] }).areas === "errors.pickOneArea");
  check("blank areas do not count", bad({ areas: ["  ", ""] }).areas === "errors.pickOneArea");
  check("a nameless zone is refused", bad({ name: " " }).name === "errors.required");
  check("a zero reach is refused", bad({ deliveryRadiusKm: 0 }).deliveryRadiusKm === "errors.invalidRadius");
  check("an absurd reach is refused", bad({ deliveryRadiusKm: 500 }).deliveryRadiusKm === "errors.invalidRadius");
  check("a negative fare is refused", bad({ baseFare: -1 }).baseFare === "errors.negative");
  check("a negative per-km is refused", bad({ perKm: -1 }).perKm === "errors.negative");
  check("a negative cash ceiling is refused", bad({ cashLimit: -1 }).cashLimit === "errors.negative");
  check("a peak that pays less is refused", bad({ peakMultiplier: 0.5 }).peakMultiplier === "errors.invalidMultiplier");
  check("an absurd peak is refused", bad({ peakMultiplier: MAX_PEAK_MULTIPLIER + 1 }).peakMultiplier === "errors.invalidMultiplier");
  check("hour 24 is refused", bad({ peakHours: [24] }).peakHours === "errors.invalidHour");
  check("a fractional hour is refused", bad({ peakHours: [12.5] }).peakHours === "errors.invalidHour");
  check("the seed's own values pass", Object.keys(bad({})).length === 0, JSON.stringify(bad({})));
  check("an unknown zone is refused", saveZone(emptyPlatformDraft(), deliveryZones, "dzn_nope", formOf(gulshan), NOW).errors.zone === "errors.notFound");

  // The network cannot switch itself off.
  let draft = emptyPlatformDraft();
  draft = commit("closing Uttara", setZoneActive(draft, deliveryZones, UTTARA, false, NOW));
  draft = commit("closing Dhanmondi", setZoneActive(draft, deliveryZones, DHANMONDI, false, NOW + 1));
  check("two zones are closed", serviceableZones(deliveryZones, draft).length === 1);
  check(
    "the last open zone cannot be closed",
    setZoneActive(draft, deliveryZones, GULSHAN, false, NOW + 2).errors.active === "errors.lastZone",
  );

  // Nor can the platform stop trading everywhere, nor close its own fallback.
  let regions = emptyPlatformDraft();
  check(
    "the fallback country cannot be closed",
    setRegionActive(regions, defaultCountry, false, NOW).errors.active === "errors.lastRegion",
  );
  for (const code of Object.keys(countries).filter((c) => c !== defaultCountry && c !== "GB")) {
    regions = commit(`closing ${code}`, setRegionActive(regions, code, false, NOW));
  }
  check("two countries are still trading", effectiveRegions(regions).filter((r) => r.active).length === 2);
  regions = commit("closing GB", setRegionActive(regions, "GB", false, NOW + 1));
  check("one country is left", effectiveRegions(regions).filter((r) => r.active).length === 1);
  check(
    "the last trading country cannot be closed",
    setRegionActive(regions, defaultCountry, false, NOW + 2).errors.active === "errors.lastRegion",
  );

  // The fallback has to be somewhere the platform actually trades.
  check(
    "a country not traded in cannot be the fallback",
    setDefaultCountry(regions, "GB", NOW).errors.region === "errors.notFound",
  );
  const moved = commit("moving the fallback to Germany", setDefaultCountry(emptyPlatformDraft(), "DE", NOW));
  check("the fallback moves", effectiveDefaultCountry(moved) === "DE");
  check("and an unnamed country is priced by it", resolveTax(null, taxFor(moved, effectiveDefaultCountry(moved))).rate === countries.DE.taxRate);
  const back = commit("moving it back", setDefaultCountry(moved, defaultCountry, NOW + 1));
  check("choosing the config's own default records nothing", back.defaultCountry === null);
}

// ── 8. Permissions ───────────────────────────────────────────────────────────

console.log("8. Permissions");
{
  check(
    "the settings route wants `settings.manage`",
    permissionForAdminPath("/admin/settings") === "settings.manage",
  );
  check(
    "and is not swallowed by the live board",
    permissionForAdminPath("/admin") === "orders.view",
  );

  // The seeded accounts, not hand-rolled ones: the seed is what a reviewer signs
  // in as, and `usr_admin`'s `["*"]` is the wildcard `lib/rbac` exists to honour.
  const account = (role: User["role"]) => {
    const found = users.find((u) => u.role === role);
    if (!found) throw new Error(`no seeded ${role}`);
    return found;
  };

  check(
    "a super-admin may configure the platform",
    permissionsFor(account("super-admin")).includes("settings.manage"),
  );
  check(
    "a moderator may not",
    !permissionsFor(account("moderator")).includes("settings.manage"),
  );
  check(
    "a customer may not",
    !permissionsFor(account("customer")).includes("settings.manage"),
  );
  check("a signed-out visitor may not", !permissionsFor(null).includes("settings.manage"));
}

// ── 9. The audit trail ───────────────────────────────────────────────────────

console.log("9. The audit trail");
{
  for (const kind of ["region", "delivery-zone", "platform"] as const) {
    check(`the filter knows \`${kind}\``, AUDIT_ENTITIES.includes(kind));
  }
}

// ── 10. Message coverage, all three locales ──────────────────────────────────

console.log("10. Message coverage");
{
  type Bag = Record<string, unknown>;

  function catalog(locale: Locale): Bag {
    return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Bag;
  }

  function lookup(bag: Bag, path: string): unknown {
    return path.split(".").reduce<unknown>((node, key) => {
      if (node && typeof node === "object") return (node as Bag)[key];
      return undefined;
    }, bag);
  }

  /** Every leaf key under a namespace, dotted. */
  function leaves(node: unknown, prefix = ""): string[] {
    if (typeof node === "string") return [prefix];
    if (!node || typeof node !== "object") return [];
    return Object.entries(node as Bag).flatMap(([key, value]) =>
      leaves(value, prefix ? `${prefix}.${key}` : key),
    );
  }

  const catalogs = Object.fromEntries(locales.map((l) => [l, catalog(l)])) as Record<Locale, Bag>;
  const reference = leaves(lookup(catalogs.en, "platformSettings")).sort();

  check("the namespace exists", reference.length > 0);

  for (const locale of locales) {
    const own = leaves(lookup(catalogs[locale], "platformSettings")).sort();
    const missing = reference.filter((k) => !own.includes(k));
    const extra = own.filter((k) => !reference.includes(k));
    check(`\`platformSettings\` is complete in ${locale}`, missing.length === 0, missing.join(", "));
    check(`and has nothing spare in ${locale}`, extra.length === 0, extra.join(", "));
  }

  // Every refusal the domain can produce has to be sayable in all three locales,
  // or a validator would render its own key at a customer-facing operator.
  const ERRORS: readonly PlatformSettingsError[] = [
    "errors.required",
    "errors.negative",
    "errors.invalidRate",
    "errors.invalidMultiplier",
    "errors.invalidRadius",
    "errors.invalidHour",
    "errors.pickOneArea",
    "errors.lastRegion",
    "errors.lastZone",
    "errors.notFound",
  ];
  for (const locale of locales) {
    const missing = ERRORS.filter(
      (key) => typeof lookup(catalogs[locale], `platformSettings.${key}`) !== "string",
    );
    check(`every refusal is sayable in ${locale}`, missing.length === 0, missing.join(", "));
  }

  // The nav entry and the three new audit entity labels.
  for (const locale of locales) {
    const paths = [
      "admin.navSettings",
      "audit.entity.region",
      "audit.entity.delivery-zone",
      "audit.entity.platform",
    ];
    const missing = paths.filter((p) => typeof lookup(catalogs[locale], p) !== "string");
    check(`the nav and audit labels exist in ${locale}`, missing.length === 0, missing.join(", "));
  }
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} assertions passed`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("Phase 19 (G30) flow: all green");
