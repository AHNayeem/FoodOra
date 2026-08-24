import type { GeoPoint, ISODate, WeeklyHours } from "./common";
import type { Vendor } from "./catalog";
import type { VendorBranch } from "./onboarding";

/**
 * vendor-settings.ts — what a restaurant may change about itself (Phase 10, G18).
 *
 * **There is no second restaurant model here.** The listing a customer sees is a
 * `Vendor`, its week is a `WeeklyHours`, and an extra outlet is a `VendorBranch` —
 * all three shapes already existed. What this file adds is the same two things
 * `types/menu.ts` had to add for the menu builder, and for the same reasons:
 *
 *  - **A draft.** The catalog is a read-only seed (and, behind `LIVE.catalog`, a
 *    server-owned table), so an edit cannot be written into it. `VendorSettingsDraft`
 *    is the *diff* — a patch over the listing's own fields — and
 *    `lib/vendor-settings.effectiveVendor` folds it back. That fold is the only
 *    reader, so there is no second listing to keep in step.
 *  - **The fields the catalog genuinely does not have.** `Vendor` carries no phone
 *    number and no separate pickup/delivery switch, both of which the spec asks a
 *    restaurant to be able to set. They are recorded here, seeded from the
 *    onboarding application — which is where the restaurant already told the
 *    platform its number — rather than invented.
 *
 * Two boundaries are deliberate and stated rather than discovered:
 *
 *  - **Branches stay on the application.** `VendorApplication.branches` is already
 *    their only home (Phases 6–7 put them there rather than minting a second
 *    listing a customer could order from and nobody could fulfil). Settings edits
 *    them through `stores/onboarding.editVendor`, so there is one record and one
 *    audit log — not a copy here that could disagree.
 *  - **Platform delivery zones are not touched.** `config/regions.ts` and
 *    `lib/mock/delivery-zones.ts` are the platform's geography (G30, which the v2
 *    spec assigns to no phase). A restaurant sets *its own* fee, minimum, free-over
 *    threshold and ETA window; which zones exist is not its decision.
 */

/**
 * The listing fields a restaurant may edit.
 *
 * A subset of `Vendor`, and the omissions are the argument. `id`, `slug` and
 * `ownerId` are identity. `rating`, `reviewCount`, `isFeatured` and `isTrending`
 * are what customers and the platform said — a settings page that could rewrite
 * its own rating would make every rating on the platform worthless (spec §5.4).
 * `commissionRate` is a negotiated term, not a preference. `isOpen` is the
 * storefront switch that already lives in `stores/merchant`.
 */
export type VendorProfilePatch = Partial<
  Pick<
    Vendor,
    | "name"
    | "tagline"
    | "description"
    | "logo"
    | "cover"
    | "cuisineIds"
    | "priceLevel"
    | "promoLabel"
  >
>;

/** The address fields a restaurant may correct. Coordinates are not editable. */
export type VendorLocationPatch = Partial<Pick<GeoPoint, "address" | "city">>;

/**
 * How the restaurant answers the phone.
 *
 * Not on `Vendor`, so it is a record here rather than a field the catalog would
 * have to grow. Seeded from `VendorApplication.restaurant`, because the applicant
 * already gave both.
 */
export interface VendorContact {
  phone: string;
  email: string;
}

/**
 * How the restaurant wants to fulfil orders.
 *
 * The same shape as `VendorDeliveryDraft` minus `zoneIds`, which is the platform's
 * to decide (see the header). Kept as its own interface rather than reusing the
 * onboarding draft so that dropping `zoneIds` is a visible decision and not an
 * omission somebody has to notice.
 */
export interface VendorDeliverySettings {
  offersDelivery: boolean;
  offersPickup: boolean;
  deliveryFee: number;
  minOrder: number;
  /** Order value above which delivery is free; null for never. */
  freeDeliveryOver: number | null;
  /** Preparation + travel estimate window, minutes. */
  etaMinutes: [number, number];
}

/**
 * Everything one restaurant has changed about itself.
 *
 * Keyed by vendor in `stores/vendor-settings` rather than held as one global
 * draft, matching `MenuDraft`: a settings edit is only ever applied to the
 * restaurant it belongs to, and a collision across two listings would be silent.
 *
 * Every member is nullable or partial on purpose. `null` means "the restaurant has
 * not touched this", which is a different fact from "the restaurant set it to the
 * same value the seed had" — only the first can pick up a change to the seed.
 */
export interface VendorSettingsDraft {
  vendorId: string;
  profile: VendorProfilePatch;
  location: VendorLocationPatch;
  contact: VendorContact | null;
  hours: WeeklyHours | null;
  delivery: VendorDeliverySettings | null;
  /** When the restaurant last saved anything. Null while the draft is empty. */
  updatedAt: ISODate | null;
}

/**
 * The restaurant as it actually is — the fold, and the only thing surfaces read.
 *
 * Derived, never stored. `authored` says whether any of this came from the
 * restaurant rather than the seed, so a screen can label an edited value without
 * comparing fields itself.
 */
export interface VendorSettings {
  /** The listing with the draft applied. Same type the storefront renders. */
  vendor: Vendor;
  contact: VendorContact;
  hours: WeeklyHours;
  delivery: VendorDeliverySettings;
  /** Read from the onboarding application, which is their only home. */
  branches: VendorBranch[];
  authored: boolean;
  updatedAt: ISODate | null;
}
