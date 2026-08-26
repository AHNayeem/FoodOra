import { cartCount, type CartLineRecord, money } from '../../../cart/domain';
import type { FulfillmentType } from '../../../../shared/enums';
import { CouponRefusal, type CouponRefusalKey } from '../checkout-errors';
import type { CouponOutcome, CouponRecord } from '../models';

/**
 * What a coupon is worth against a basket — the server's copy of
 * `frontend/lib/coupons.ts::evaluateCoupon` + `couponSavings`.
 *
 * ## Why the server evaluates coupons at all
 *
 * Because a discount is money, and the client may not state money. Phase C21 built a
 * genuinely good coupon engine and put it in the browser, where it decides what a code is
 * worth and hands the answer to `computeTotals`. That is fine for showing a customer what
 * they would save. It cannot be what the order is priced from: a coupon's rule
 * (percentage, ceiling, minimum, window, vendor scope, usage limit) is stored data, and
 * anything derived from stored data has exactly one trustworthy source.
 *
 * So the rules are re-implemented here, deliberately as a *mirror* rather than as an
 * improvement. Same refusal order, same ceilings, same rounding, same treatment of
 * cashback. Where the two disagree the frontend is wrong by definition, but a difference
 * the customer can see — a discount that shrinks when they press the button — is a bug
 * even when the server is right, so `verify:checkout` asserts the two agree on a table of
 * baskets rather than trusting that they do.
 *
 * ## What is here that the frontend cannot enforce
 *
 * `totalLimit` / `totalRedeemed` — the platform-wide cap. The browser has no way to know
 * how many other customers have spent a code, so the mock has no cap at all. This is the
 * one rule that only exists server-side, and it is the one that stops a leaked code from
 * costing an unbounded amount of money.
 *
 * ## The refusal order, which is not arbitrary
 *
 * What is wrong with the *coupon* first (spent, capped, not started, expired, wrong
 * currency), then what is wrong with the *basket* (wrong vendor, wrong dishes, not your
 * first order, too small), then the kind-specific conditions. The first failure wins, so
 * the customer is told the one thing they could change — which is why `minOrder` comes
 * after `vendorOnly`: "add ৳200 more" is useless advice for a code that will never apply
 * at this restaurant.
 */

export interface CouponContext {
  vendorId: string;
  currency: string;
  subtotal: number;
  /** The fee *before* any waiver — what a free-delivery coupon would save. */
  deliveryFee: number;
  fulfillment: FulfillmentType;
  lines: readonly CartLineRecord[];
  /** Browse-category slugs the basket's dishes belong to. */
  categorySlugs: readonly string[];
  /** True when this account has never placed an order. */
  isFirstOrder: boolean;
  /** How many times *this* customer has already redeemed this coupon. */
  timesRedeemed: number;
  now: Date;
}

export type CouponEvaluation =
  | { eligible: true; outcome: CouponOutcome }
  | { eligible: false; reason: CouponRefusalKey };

/** Ceiling on a computed saving. `null` means uncapped. */
function capped(value: number, max: number | null): number {
  return max === null ? value : Math.min(value, max);
}

/** The unit price BOGO gives away: the cheapest item in the basket. */
function cheapestUnitPrice(lines: readonly CartLineRecord[]): number {
  return lines.reduce((min, line) => (line.unitPrice < min ? line.unitPrice : min), Infinity);
}

/**
 * The money half, ignoring eligibility.
 *
 * Split out for the same reason the frontend splits it: it lets the rules above read as
 * rules, and it makes the arithmetic testable on its own.
 */
export function couponSavings(
  coupon: CouponRecord,
  context: CouponContext,
): Omit<CouponOutcome, 'coupon'> {
  const { subtotal, deliveryFee, fulfillment, lines } = context;
  const none = { discount: 0, freeDelivery: false, deliveryWaived: 0, cashback: 0 };

  switch (coupon.kind) {
    case 'percentage': {
      const raw = capped((subtotal * coupon.value) / 100, coupon.maxDiscount);
      return { ...none, discount: money(Math.min(raw, subtotal)) };
    }
    case 'fixed':
      return { ...none, discount: money(Math.min(coupon.value, subtotal)) };
    case 'free-delivery': {
      // Pickup has no fee to waive, and neither does a basket already over the vendor's
      // free-delivery threshold — `deliveryFee` arrives already resolved against it.
      const waived = fulfillment === 'pickup' ? 0 : deliveryFee;
      return { ...none, freeDelivery: waived > 0, deliveryWaived: money(waived) };
    }
    case 'bogo': {
      if (cartCount(lines) < 2) return none;
      const free = cheapestUnitPrice(lines);
      if (!Number.isFinite(free)) return none;
      return { ...none, discount: money(Math.min(free, subtotal)) };
    }
    case 'cashback': {
      const raw = capped((subtotal * coupon.value) / 100, coupon.maxDiscount);
      return { ...none, cashback: money(raw) };
    }
  }
}

export function evaluateCoupon(
  coupon: CouponRecord,
  context: CouponContext,
): CouponEvaluation {
  const nowMs = context.now.getTime();

  if (context.timesRedeemed >= coupon.usageLimit) {
    return { eligible: false, reason: CouponRefusal.used };
  }
  // Server-only, and the reason this file cannot be "just use the frontend's engine".
  if (coupon.totalLimit !== null && coupon.totalRedeemed >= coupon.totalLimit) {
    return { eligible: false, reason: CouponRefusal.exhausted };
  }
  if (nowMs < coupon.startsAt.getTime()) {
    return { eligible: false, reason: CouponRefusal.notStarted };
  }
  if (nowMs > coupon.endsAt.getTime()) {
    return { eligible: false, reason: CouponRefusal.expired };
  }

  if (coupon.currency !== context.currency) {
    return { eligible: false, reason: CouponRefusal.currency };
  }
  if (coupon.vendorIds.length > 0 && !coupon.vendorIds.includes(context.vendorId)) {
    return { eligible: false, reason: CouponRefusal.vendorOnly };
  }
  if (
    coupon.categorySlugs.length > 0 &&
    !coupon.categorySlugs.some((slug) => context.categorySlugs.includes(slug))
  ) {
    return { eligible: false, reason: CouponRefusal.categoryOnly };
  }
  if (coupon.firstOrderOnly && !context.isFirstOrder) {
    return { eligible: false, reason: CouponRefusal.firstOrderOnly };
  }
  if (context.subtotal < coupon.minOrder) {
    return { eligible: false, reason: CouponRefusal.minOrder };
  }

  if (coupon.kind === 'free-delivery' && context.fulfillment === 'pickup') {
    return { eligible: false, reason: CouponRefusal.deliveryOnly };
  }
  if (coupon.kind === 'bogo' && cartCount(context.lines) < 2) {
    return { eligible: false, reason: CouponRefusal.needsTwoItems };
  }

  const savings = couponSavings(coupon, context);
  const totalSaving = savings.discount + savings.deliveryWaived + savings.cashback;

  // A coupon worth nothing is refused rather than applied: a free-delivery code on a
  // basket that already qualifies for free delivery is better explained than silently
  // recorded against an order it did not discount.
  if (totalSaving <= 0) return { eligible: false, reason: CouponRefusal.noSaving };

  return { eligible: true, outcome: { coupon, ...savings } };
}

/** Codes are stored canonicalised. `frontend/lib/coupons.ts::normaliseCode`. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}
