/**
 * coupon.ts — coupons as a **redeemable account entity** (Phase C21).
 *
 * The distinction from `Offer` (Phase C20) is deliberate and is the whole point
 * of this phase: an offer is a *campaign the platform advertises*, a coupon is a
 * *ticket a customer holds*. The rule (percentage / fixed / free delivery /
 * BOGO / cashback, plus eligibility and a validity window) lives on `Coupon`;
 * everything personal — when it was claimed, how many times it has been spent,
 * on which orders — lives on `CouponClaim`, one row per customer per coupon,
 * exactly as a `coupons` + `coupon_claims` pair of tables would.
 *
 * Campaign coupons are *minted from* the offer catalogue (every offer carrying a
 * `code` is claimable), so a code advertised on `/offers` and the coupon in the
 * wallet can never disagree about its own terms. Granted coupons — the welcome
 * gift, a referral reward, an apology credit — have no campaign behind them and
 * are issued directly.
 *
 * Nothing here stores state that the clock can derive: there is no `isExpired`
 * and no `isUsed` column. `CouponStatus` is computed in `lib/coupons.ts` from
 * the window, the usage limit and the redemptions, the same way a paused
 * subscription (C15) expires itself and a reservation (C16) reads as completed.
 */
import type { BaseEntity, ISODate } from "./common";
import type { FulfillmentType } from "./order";

/** How the discount is calculated. Mirrors `OfferKind` — offers mint coupons. */
export type CouponKind =
  | "percentage"
  | "fixed"
  | "free-delivery"
  | "bogo"
  | "cashback";

/** What the coupon may be spent on. */
export type CouponScope = "platform" | "vendor" | "category";

/** Where the coupon came from — drives the wallet's "issued by" line. */
export type CouponSource =
  | "campaign"
  | "welcome"
  | "referral"
  | "loyalty"
  | "apology"
  | "birthday"
  | "vendor";

export interface Coupon extends BaseEntity {
  /** The redeemable key, always stored canonicalised (upper-case, no spaces). */
  code: string;
  title: string;
  /** One-line explanation shown on the ticket. */
  description: string;
  kind: CouponKind;
  /**
   * Percentage points for `percentage`/`cashback`, currency units for `fixed`.
   * Ignored by `free-delivery` and `bogo`.
   */
  value: number;
  /** Ceiling on the discount (or cashback), in currency units. */
  maxDiscount: number | null;
  /** Basket value the coupon unlocks at, in currency units. */
  minOrder: number;
  /** Currency the monetary fields are expressed in. */
  currency: string;
  scope: CouponScope;
  /** Vendors the coupon is limited to (empty = any vendor). */
  vendorIds: string[];
  /** Browse-category slugs the coupon is limited to (empty = any dish). */
  categorySlugs: string[];
  startsAt: ISODate;
  endsAt: ISODate;
  /** How many times **one** customer may redeem it. */
  usageLimit: number;
  /** Restricted to a customer who has never ordered before. */
  firstOrderOnly: boolean;
  source: CouponSource;
  /**
   * Whether typing the code adds it to a wallet. Granted coupons (a referral
   * reward, an apology credit) are issued, not claimable, so their code cannot
   * be passed around.
   */
  claimable: boolean;
  /** The small print, shown in the ticket's expandable terms. */
  terms: string[];
  /** The C20 campaign this was minted from (FK), or null when granted. */
  offerId: string | null;
}

/** One spend of a coupon, recorded against the order it paid for. */
export interface CouponRedemption {
  orderId: string;
  orderNumber: string;
  /** Money taken off this order (0 for cashback, which pays afterwards). */
  discount: number;
  /** Delivery fee waived by the coupon, if any. */
  deliveryWaived: number;
  /** Wallet credit earned (cashback coupons only). */
  cashback: number;
  currency: string;
  redeemedAt: ISODate;
}

/**
 * The customer's side of the relationship: the fact that they hold the coupon,
 * plus what they have spent it on. This is the only coupon data the prototype
 * persists per browser — the rule itself always comes from the catalogue.
 */
export interface CouponClaim {
  couponId: string;
  claimedAt: ISODate;
  /** Typed in, or issued to the account. */
  via: "code" | "granted";
  redemptions: CouponRedemption[];
}

/** Derived from the window, the usage limit and the redemptions — never stored. */
export type CouponStatus = "active" | "scheduled" | "used" | "expired";

/** A vendor a coupon is limited to, resolved for display (FK → name + link). */
export interface CouponVendorRef {
  id: string;
  slug: string;
  name: string;
}

/** A held coupon resolved for display: the rule, the claim and what follows. */
export interface HeldCoupon {
  coupon: Coupon;
  claim: CouponClaim;
  status: CouponStatus;
  /** Redemptions left under `usageLimit` (0 once spent out). */
  remaining: number;
  /** Whole days before it expires; 0 once it has. */
  daysLeft: number;
  /** Vendors it is limited to; empty when it works anywhere. */
  vendors: CouponVendorRef[];
}

/** A basket line, reduced to what the eligibility engine actually needs. */
export interface CouponBasketLine {
  foodId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

/** Everything needed to price a coupon against a basket at a given instant. */
export interface CouponContext {
  nowMs: number;
  currency: string;
  subtotal: number;
  /** The fee before the coupon — a free-delivery coupon needs something to waive. */
  deliveryFee: number;
  fulfillment: FulfillmentType;
  vendorId: string;
  /** Browse categories the basket resolves to (for category-scoped coupons). */
  categorySlugs: string[];
  lines: CouponBasketLine[];
  /** True when the customer has never placed an order.  */
  isFirstOrder: boolean;
}

/** The verdict on one coupon against one basket. */
export interface CouponEvaluation {
  eligible: boolean;
  /** i18n key under `coupons.reason.*` when refused; null when eligible. */
  reasonKey: string | null;
  /** Money off the subtotal. */
  discount: number;
  /** Whether the delivery fee is waived. */
  freeDelivery: boolean;
  /** Fee that waiving actually saves — 0 on pickup or when already free. */
  deliveryWaived: number;
  /** Wallet credit paid after the order (cashback coupons). */
  cashback: number;
  /** discount + deliveryWaived + cashback — what the customer is comparing. */
  totalSaving: number;
}

/** A coupon carried through checkout: the applied ticket and its verdict. */
export interface AppliedCoupon {
  coupon: Coupon;
  evaluation: CouponEvaluation;
}

/** A vendor's own coupon plus how it has performed (merchant dashboard). */
export interface VendorCouponRow {
  coupon: Coupon;
  status: CouponStatus;
  daysLeft: number;
  /** Redemptions across all customers. */
  redemptions: number;
  /** Money discounted across those redemptions. */
  discountGiven: number;
  /** Basket value those redemptions brought in. */
  revenue: number;
}
