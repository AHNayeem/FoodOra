/**
 * offer.ts — promotions surfaced on `/offers` (spec: Offers, Coupons, Flash
 * Deals, Happy Hour). Modelled as a real promotions table would be: a discount
 * *rule* (`kind` + `value`) plus eligibility (`scope`, `vendorIds`, `minOrder`)
 * and a validity window, so the eventual pricing engine can evaluate it without
 * reshaping anything.
 */
import type { BaseEntity } from "./common";

/** How the discount is calculated. */
export type OfferKind =
  | "percentage"
  | "fixed"
  | "free-delivery"
  | "bogo"
  | "cashback";

/** What the offer applies to. */
export type OfferScope = "platform" | "vendor" | "category";

/** How the offer is surfaced on the deals page. */
export type OfferPlacement = "flash" | "featured" | "coupon" | "standard";

export interface Offer extends BaseEntity {
  slug: string;
  title: string;
  /** One-line pitch shown on the card. */
  description: string;
  kind: OfferKind;
  /**
   * Percentage points for `percentage`/`cashback`, currency units for `fixed`.
   * Ignored for `free-delivery` and `bogo`.
   */
  value: number;
  /** Ceiling on the discount for percentage offers, in currency units. */
  maxDiscount: number | null;
  /** Basket value the offer unlocks at, in currency units. */
  minOrder: number;
  /** Currency the monetary fields are expressed in. */
  currency: string;
  scope: OfferScope;
  /** Vendors the offer is limited to (empty for platform-wide offers). */
  vendorIds: string[];
  /** Category slugs the offer is limited to. */
  categorySlugs: string[];
  /** Promo code to enter at checkout; null when applied automatically. */
  code: string | null;
  placement: OfferPlacement;
  image: string;
  /** Short badge, e.g. "40% off" — pre-computed so cards need no math. */
  badge: string;
  /** ISO window the offer is valid for. */
  startsAt: string;
  endsAt: string;
  /** Redemptions used vs the cap, for the scarcity meter on flash deals. */
  claimed: number;
  claimLimit: number | null;
  /** The small print, shown in the card's expandable terms. */
  terms: string[];
  /** New customers only. */
  firstOrderOnly: boolean;
}
