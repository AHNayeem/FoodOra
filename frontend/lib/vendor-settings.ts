import type {
  DayHours,
  GeoPoint,
  Vendor,
  VendorApplication,
  VendorBranch,
  VendorContact,
  VendorDeliverySettings,
  VendorLocationPatch,
  VendorProfilePatch,
  VendorSettings,
  VendorSettingsDraft,
  Weekday,
  WeeklyHours,
} from "@/types";
import { emailError, phoneError, textError } from "./onboarding";

/**
 * vendor-settings.ts — what a restaurant may change about itself, and whether it
 * may (Phase 10, G18).
 *
 * Pure: no clock read here (callers pass `now`), no storage, no `next-intl`, no
 * store import — the same contract `lib/menu` and `lib/settlement` hold to. Every
 * mutation is `(draft, input) → { draft, errors }`, so `stores/vendor-settings`
 * commits and the forms cannot accept a value the fold would mangle.
 *
 * The one idea worth stating is the **fold**. A restaurant's settings are a diff
 * over the catalog listing, and `effectiveVendor` is the only function that applies
 * it. Everything downstream — the dashboard shell's topbar, the settings form's own
 * initial values, the analytics header — reads the fold rather than the draft, so
 * there is exactly one answer to "what is this restaurant called" and no surface
 * has to know whether the name it is showing came from the seed or from Tuesday's
 * edit. That is the arrangement `lib/menu.buildMenuBoard` established and the
 * reason neither phase needed a second entity.
 *
 * Validation reuses `lib/onboarding`'s field checks rather than restating them.
 * A phone number is not a different kind of phone number because it is being
 * edited on a settings page instead of an application form, and two copies of the
 * rule is how one of them ends up laxer than the other.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Everything this module can refuse, as i18n keys.
 *
 * Keys rather than prose, matching `MenuError` and `OnboardingError`: the domain
 * decides *that* something is wrong, the catalogue decides how to say it, and a
 * refusal is therefore translatable and testable at once.
 */
export type SettingsError =
  | "errors.required"
  | "errors.tooShort"
  | "errors.invalidEmail"
  | "errors.invalidPhone"
  | "errors.pickOne"
  | "errors.pickOneDay"
  | "errors.invalidRange"
  | "errors.invalidHours"
  | "errors.negative"
  | "errors.notFound";

/** Weekdays in the order a rota is read, Monday first. */
export const WEEK: readonly Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** Drop the nulls, so an empty object means "nothing wrong". */
function compact(
  errors: Record<string, SettingsError | null>,
): Record<string, SettingsError> {
  return Object.entries(errors).reduce<Record<string, SettingsError>>(
    (acc, [field, error]) => {
      if (error) acc[field] = error;
      return acc;
    },
    {},
  );
}

/** Re-key `lib/onboarding`'s string results into this module's union. */
function asSettingsError(message: string | null): SettingsError | null {
  return message as SettingsError | null;
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** An untouched draft. Never null, so callers need no guard. */
export function emptySettingsDraft(vendorId: string): VendorSettingsDraft {
  return {
    vendorId,
    profile: {},
    location: {},
    contact: null,
    hours: null,
    delivery: null,
    updatedAt: null,
  };
}

/** Has this restaurant changed anything at all? */
export function isDraftEmpty(draft: VendorSettingsDraft): boolean {
  return (
    Object.keys(draft.profile).length === 0 &&
    Object.keys(draft.location).length === 0 &&
    draft.contact === null &&
    draft.hours === null &&
    draft.delivery === null
  );
}

/**
 * Every trading day closed. `WeeklyHours` has no "closed" flag — a null `open` is
 * closed — so this is the shape a week starts from before anything is set.
 */
export function closedWeek(): WeeklyHours {
  return WEEK.reduce((week, day) => {
    week[day] = { open: null, close: null };
    return week;
  }, {} as WeeklyHours);
}

// ---------------------------------------------------------------------------
// The fold — the only reader
// ---------------------------------------------------------------------------

/**
 * The listing with this restaurant's edits applied.
 *
 * Returns the *same object* when the draft is empty, which matters more than it
 * looks: the dashboard shell folds on every render, and a fresh object each time
 * would make `useDashboard()`'s value a new reference and re-render every page
 * under it on a timer tick.
 *
 * `etaMinutes` is copied out of the delivery settings rather than patched
 * separately, because the storefront reads the window off the listing and the
 * settings form edits it — one number, written once, in the place the customer's
 * card reads it from.
 */
export function effectiveVendor(vendor: Vendor, draft: VendorSettingsDraft): Vendor {
  if (isDraftEmpty(draft)) return vendor;
  const location: GeoPoint = { ...vendor.location, ...draft.location };
  const delivery = draft.delivery;
  return {
    ...vendor,
    ...draft.profile,
    location,
    ...(draft.hours ? { hours: draft.hours } : {}),
    ...(delivery
      ? {
          deliveryFee: delivery.deliveryFee,
          minOrder: delivery.minOrder,
          freeDeliveryOver: delivery.freeDeliveryOver,
          etaMinutes: delivery.etaMinutes,
        }
      : {}),
  };
}

/**
 * What the restaurant's delivery settings currently are.
 *
 * Resolved in three steps, and the order is the argument. The draft wins because
 * it is what the restaurant last said. The **application** comes next, because
 * `offersDelivery` / `offersPickup` exist nowhere on `Vendor` and the applicant
 * already answered them at onboarding — reading them from there is recovering a
 * fact, where defaulting them to `true` would be inventing one. The listing is
 * last and supplies the four numbers it does carry.
 */
export function effectiveDelivery(
  vendor: Vendor,
  application: VendorApplication | null,
  draft: VendorSettingsDraft,
): VendorDeliverySettings {
  if (draft.delivery) return draft.delivery;
  const applied = application?.delivery;
  return {
    offersDelivery: applied?.offersDelivery ?? true,
    offersPickup: applied?.offersPickup ?? true,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
    etaMinutes: vendor.etaMinutes,
  };
}

/**
 * How the restaurant answers the phone.
 *
 * `Vendor` has neither field, so the application is the only place either has ever
 * been recorded. A minted listing whose application is somehow absent yields empty
 * strings rather than a plausible-looking placeholder — a fabricated support number
 * on a restaurant's own settings page is the kind of decoration this prototype is
 * meant not to have, and the form will ask for it.
 */
export function effectiveContact(
  application: VendorApplication | null,
  draft: VendorSettingsDraft,
): VendorContact {
  if (draft.contact) return draft.contact;
  return {
    phone: application?.restaurant.phone ?? "",
    email: application?.restaurant.email ?? "",
  };
}

/**
 * Everything the settings screen renders, resolved once.
 *
 * `branches` is read straight off the application and is deliberately not part of
 * the draft: `VendorApplication.branches` is their only home, edited through
 * `stores/onboarding.editVendor` so the change lands in the same audit log a
 * reviewer reads. A copy here would be a second answer to "how many outlets does
 * this restaurant have" — the exact duplication Phases 6–7 avoided by not minting
 * a listing per branch.
 */
export function effectiveSettings(
  vendor: Vendor,
  application: VendorApplication | null,
  draft: VendorSettingsDraft,
): VendorSettings {
  return {
    vendor: effectiveVendor(vendor, draft),
    contact: effectiveContact(application, draft),
    hours: draft.hours ?? vendor.hours,
    delivery: effectiveDelivery(vendor, application, draft),
    branches: application?.branches ?? [],
    authored: !isDraftEmpty(draft),
    updatedAt: draft.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The public face of the restaurant. */
export function profileErrors(
  patch: VendorProfilePatch & VendorLocationPatch,
): Record<string, SettingsError> {
  return compact({
    name: asSettingsError(textError(patch.name ?? "")),
    tagline: asSettingsError(textError(patch.tagline ?? "", 4)),
    description: asSettingsError(textError(patch.description ?? "", 20)),
    cuisineIds: patch.cuisineIds && patch.cuisineIds.length > 0 ? null : "errors.pickOne",
    address: asSettingsError(textError(patch.address ?? "", 6)),
    city: asSettingsError(textError(patch.city ?? "")),
  });
}

export function contactErrors(contact: VendorContact): Record<string, SettingsError> {
  return compact({
    phone: asSettingsError(phoneError(contact.phone)),
    email: asSettingsError(emailError(contact.email)),
  });
}

/** "HH:mm" → minutes since midnight, or null if unparsable. */
function minutesOf(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Is this day a trading day — both ends set? */
export function isOpenDay(day: DayHours): boolean {
  return Boolean(day.open && day.close);
}

/**
 * One day's hours, keyed by weekday, plus a `week` key when the whole rota is
 * unusable.
 *
 * An overnight service — open 18:00, close 02:00 — is **allowed**, and that is why
 * this checks parsability rather than `open < close`. A late-night kitchen closing
 * after midnight is the normal case for half this catalog, and refusing it would be
 * a validator that only understood daytime restaurants. What is refused is a day
 * with one end filled in, because a listing that opens and never closes is what
 * makes the storefront's "open now" badge wrong all night.
 */
export function hoursErrors(hours: WeeklyHours): Record<string, SettingsError> {
  const errors: Record<string, SettingsError | null> = {};
  for (const day of WEEK) {
    const entry = hours[day];
    const open = minutesOf(entry.open);
    const close = minutesOf(entry.close);
    const halfFilled = Boolean(entry.open) !== Boolean(entry.close);
    const unparsable = (entry.open && open === null) || (entry.close && close === null);
    errors[day] = halfFilled || unparsable ? "errors.invalidHours" : null;
    if (open !== null && close !== null && open === close) {
      // Identical times are the one impossible pair: it is neither a day nor a
      // night, and the storefront cannot decide whether the shop is always open
      // or never.
      errors[day] = "errors.invalidHours";
    }
  }
  // A restaurant closed all week could never take an order, so the rota as a
  // whole is refused — the same rule the onboarding form's `hours` step applies.
  errors.week = WEEK.some((day) => isOpenDay(hours[day])) ? null : "errors.pickOneDay";
  return compact(errors);
}

/**
 * How the restaurant fulfils orders.
 *
 * Three rules, all of them things a customer would otherwise hit. Neither
 * delivery nor pickup is a restaurant nobody can order from. A reversed or
 * zero-floor ETA window is a promise the tracker cannot render. A negative fee or
 * minimum would flow straight into `computeTotals` and price an order wrong.
 */
export function deliveryErrors(
  delivery: VendorDeliverySettings,
): Record<string, SettingsError> {
  const [low, high] = delivery.etaMinutes;
  return compact({
    mode: delivery.offersDelivery || delivery.offersPickup ? null : "errors.pickOne",
    deliveryFee: delivery.deliveryFee < 0 ? "errors.negative" : null,
    minOrder: delivery.minOrder < 0 ? "errors.negative" : null,
    freeDeliveryOver:
      delivery.freeDeliveryOver != null && delivery.freeDeliveryOver < 0
        ? "errors.negative"
        : null,
    etaMinutes: low > 0 && high > low ? null : "errors.invalidRange",
  });
}

/** One additional outlet. `hours` is optional — a branch may keep the main rota. */
export function branchErrors(branch: {
  name: string;
  address: string;
  area: string;
  phone: string;
}): Record<string, SettingsError> {
  return compact({
    name: asSettingsError(textError(branch.name)),
    address: asSettingsError(textError(branch.address, 6)),
    area: asSettingsError(textError(branch.area)),
    phone: asSettingsError(phoneError(branch.phone)),
  });
}

// ---------------------------------------------------------------------------
// Mutations — every one returns the next draft, or the errors that stopped it
// ---------------------------------------------------------------------------

/** A saved-draft result. `errors` empty means `draft` is the committed one. */
export interface DraftResult {
  draft: VendorSettingsDraft;
  errors: Record<string, SettingsError>;
}

/** Stamp the save time in one place, so no mutation forgets to. */
function touched(draft: VendorSettingsDraft, now: number): VendorSettingsDraft {
  return { ...draft, updatedAt: new Date(now).toISOString() };
}

/**
 * Save the profile and the address together.
 *
 * One mutation rather than two because they are one form and one save button: a
 * partial commit would leave the restaurant renamed at an address it has not
 * moved to yet, and the fold would show that as the truth.
 */
export function saveProfile(
  draft: VendorSettingsDraft,
  input: VendorProfilePatch & VendorLocationPatch,
  now: number,
): DraftResult {
  const errors = profileErrors(input);
  if (Object.keys(errors).length) return { draft, errors };
  const { address, city, ...profile } = input;
  return {
    draft: touched(
      {
        ...draft,
        profile: {
          name: profile.name,
          tagline: profile.tagline,
          description: profile.description,
          logo: profile.logo ?? "",
          cover: profile.cover ?? "",
          cuisineIds: profile.cuisineIds ?? [],
          priceLevel: profile.priceLevel,
          promoLabel: profile.promoLabel?.trim() ? profile.promoLabel : null,
        },
        location: { address, city },
      },
      now,
    ),
    errors: {},
  };
}

export function saveContact(
  draft: VendorSettingsDraft,
  input: VendorContact,
  now: number,
): DraftResult {
  const errors = contactErrors(input);
  if (Object.keys(errors).length) return { draft, errors };
  return { draft: touched({ ...draft, contact: input }, now), errors: {} };
}

export function saveHours(
  draft: VendorSettingsDraft,
  hours: WeeklyHours,
  now: number,
): DraftResult {
  const errors = hoursErrors(hours);
  if (Object.keys(errors).length) return { draft, errors };
  return { draft: touched({ ...draft, hours }, now), errors: {} };
}

export function saveDelivery(
  draft: VendorSettingsDraft,
  delivery: VendorDeliverySettings,
  now: number,
): DraftResult {
  const errors = deliveryErrors(delivery);
  if (Object.keys(errors).length) return { draft, errors };
  return { draft: touched({ ...draft, delivery }, now), errors: {} };
}

// ---------------------------------------------------------------------------
// Branches — minted here, stored on the application
// ---------------------------------------------------------------------------

/**
 * A deterministic branch id.
 *
 * Derived from the vendor and the save instant, matching how `lib/menu` mints a
 * section and `lib/onboarding` mints an application number. Deterministic so a
 * replayed save — a double click, a restored store — produces the same id rather
 * than a duplicate outlet.
 */
export function branchId(vendorId: string, now: number): string {
  return `brn_${vendorId.replace(/^ven_/, "")}_${now.toString(36)}`;
}

export interface BranchInput {
  name: string;
  address: string;
  area: string;
  phone: string;
  hours: WeeklyHours | null;
}

/** Add an outlet to a list of them. Returns the whole list, ready to store. */
export function addBranch(
  branches: VendorBranch[],
  vendorId: string,
  input: BranchInput,
  now: number,
): { branches: VendorBranch[]; errors: Record<string, SettingsError> } {
  const errors = branchErrors(input);
  if (Object.keys(errors).length) return { branches, errors };
  return {
    branches: [...branches, { id: branchId(vendorId, now), ...input }],
    errors: {},
  };
}

/** Edit one outlet in place. */
export function editBranch(
  branches: VendorBranch[],
  id: string,
  input: BranchInput,
): { branches: VendorBranch[]; errors: Record<string, SettingsError> } {
  if (!branches.some((b) => b.id === id)) {
    return { branches, errors: { branch: "errors.notFound" } };
  }
  const errors = branchErrors(input);
  if (Object.keys(errors).length) return { branches, errors };
  return {
    branches: branches.map((b) => (b.id === id ? { ...b, ...input } : b)),
    errors: {},
  };
}

/** Remove one outlet. Absent is not an error — the caller's intent is satisfied. */
export function removeBranch(branches: VendorBranch[], id: string): VendorBranch[] {
  return branches.filter((b) => b.id !== id);
}
