import type {
  AppliedCoupon,
  Coupon,
  CouponClaim,
  CouponContext,
  CouponEvaluation,
  CouponStatus,
  CouponVendorRef,
  HeldCoupon,
} from "@/frontend/types";
import { roundMoney } from "./checkout";

/**
 * coupons.ts — the coupon rules engine (Phase C21). Pure: nothing here reads the
 * clock, touches a store or hits a service; a `nowMs` and a basket go in, a
 * verdict comes out.
 *
 * There is exactly one evaluator, and every surface asks it the same question:
 * the wallet ("is this ticket still good?"), the checkout picker ("which of my
 * coupons apply to *this* basket, and what would each save?"), the applied-code
 * field, and the seam that records the redemption. Because they share this
 * function they cannot disagree — a coupon the picker offers is a coupon the
 * seam will accept.
 *
 * Status is **derived, never stored** (the C15 / C16 convention): a coupon reads
 * expired because the window closed, and spent because the redemptions reached
 * the limit. Nothing sweeps a table to make that true.
 */

/** Canonical form of a code: trimmed, upper-cased, inner whitespace removed. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Redemptions left under the per-customer usage limit. */
export function remainingUses(coupon: Coupon, claim: CouponClaim): number {
  return Math.max(0, coupon.usageLimit - claim.redemptions.length);
}

/** Whole days before the coupon expires; 0 once it has. */
export function daysLeft(coupon: Coupon, nowMs: number): number {
  const ms = Date.parse(coupon.endsAt) - nowMs;
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Expiring inside `days` (and not already gone) — drives the wallet's nudge. */
export function isExpiringSoon(coupon: Coupon, nowMs: number, days = 3): boolean {
  const left = daysLeft(coupon, nowMs);
  return left > 0 && left <= days;
}

/**
 * Where a coupon stands right now. `claim` is optional: without one (the
 * merchant's view of a coupon they issued) only the window matters, since usage
 * is counted per customer.
 *
 * Spent-out is checked before the window, because "you have used this" explains
 * a greyed-out ticket better than "it also expired last night".
 */
export function couponStatus(
  coupon: Coupon,
  claim: CouponClaim | null,
  nowMs: number,
): CouponStatus {
  if (claim && remainingUses(coupon, claim) === 0) return "used";
  if (nowMs < Date.parse(coupon.startsAt)) return "scheduled";
  if (nowMs >= Date.parse(coupon.endsAt)) return "expired";
  return "active";
}

/**
 * Resolve a rule + claim into the shape the wallet renders. `vendors` is passed
 * in already joined — this file never touches the catalogue.
 */
export function toHeldCoupon(
  coupon: Coupon,
  claim: CouponClaim,
  nowMs: number,
  vendors: CouponVendorRef[] = [],
): HeldCoupon {
  return {
    coupon,
    claim,
    status: couponStatus(coupon, claim, nowMs),
    remaining: remainingUses(coupon, claim),
    daysLeft: daysLeft(coupon, nowMs),
    vendors,
  };
}

/** Cap a value at `max` when one is set. */
function capped(value: number, max: number | null): number {
  return max === null ? value : Math.min(value, max);
}

/** Total items in the basket — BOGO needs a second one to give away. */
export function basketItemCount(ctx: CouponContext): number {
  return ctx.lines.reduce((n, line) => n + line.quantity, 0);
}

/** The unit price BOGO gives away: the cheapest item in the basket. */
function cheapestUnitPrice(ctx: CouponContext): number {
  return ctx.lines.reduce(
    (min, line) => (line.unitPrice < min ? line.unitPrice : min),
    Infinity,
  );
}

/**
 * What a coupon is worth against this basket, ignoring eligibility — the money
 * half of the engine, split out so `evaluateCoupon` reads as rules only.
 *
 * `discount` never exceeds the subtotal (a ৳150 coupon on a ৳100 basket takes
 * ৳100, not ৳150 and a negative total). Cashback is deliberately *not* a
 * discount: it is credited to the wallet after the order, so it leaves the
 * total alone and shows as a reward instead.
 */
export function couponSavings(
  coupon: Coupon,
  ctx: CouponContext,
): Pick<CouponEvaluation, "discount" | "freeDelivery" | "deliveryWaived" | "cashback"> {
  const { currency, subtotal, deliveryFee, fulfillment } = ctx;
  const none = { discount: 0, freeDelivery: false, deliveryWaived: 0, cashback: 0 };

  switch (coupon.kind) {
    case "percentage": {
      const raw = capped((subtotal * coupon.value) / 100, coupon.maxDiscount);
      return { ...none, discount: roundMoney(Math.min(raw, subtotal), currency) };
    }
    case "fixed":
      return { ...none, discount: roundMoney(Math.min(coupon.value, subtotal), currency) };
    case "free-delivery": {
      // Pickup has no fee to waive, and neither does a basket already over the
      // vendor's free-delivery threshold.
      const waived = fulfillment === "pickup" ? 0 : deliveryFee;
      return { ...none, freeDelivery: waived > 0, deliveryWaived: roundMoney(waived, currency) };
    }
    case "bogo": {
      if (basketItemCount(ctx) < 2) return none;
      const free = cheapestUnitPrice(ctx);
      if (!Number.isFinite(free)) return none;
      return { ...none, discount: roundMoney(Math.min(free, subtotal), currency) };
    }
    case "cashback": {
      const raw = capped((subtotal * coupon.value) / 100, coupon.maxDiscount);
      return { ...none, cashback: roundMoney(raw, currency) };
    }
  }
}

/** A refusal, carrying the i18n key that explains it. */
function refuse(reasonKey: string): CouponEvaluation {
  return {
    eligible: false,
    reasonKey,
    discount: 0,
    freeDelivery: false,
    deliveryWaived: 0,
    cashback: 0,
    totalSaving: 0,
  };
}

/**
 * Can this coupon be spent on this basket, and for how much?
 *
 * The refusals are ordered the way a person would explain them: what is wrong
 * with the *coupon* first (spent, not started, expired, wrong currency), then
 * what is wrong with the *basket* (wrong vendor, wrong dishes, too small, not
 * your first order), then the kind-specific conditions. The first failure wins,
 * so the customer is told the one thing they could change.
 */
export function evaluateCoupon(
  coupon: Coupon,
  claim: CouponClaim | null,
  ctx: CouponContext,
): CouponEvaluation {
  const status = couponStatus(coupon, claim, ctx.nowMs);
  if (status === "used") return refuse("used");
  if (status === "scheduled") return refuse("notStarted");
  if (status === "expired") return refuse("expired");

  if (coupon.currency !== ctx.currency) return refuse("currency");

  if (coupon.vendorIds.length > 0 && !coupon.vendorIds.includes(ctx.vendorId)) {
    return refuse("vendorOnly");
  }
  if (
    coupon.categorySlugs.length > 0 &&
    !coupon.categorySlugs.some((slug) => ctx.categorySlugs.includes(slug))
  ) {
    return refuse("categoryOnly");
  }
  if (coupon.firstOrderOnly && !ctx.isFirstOrder) return refuse("firstOrderOnly");
  if (ctx.subtotal < coupon.minOrder) return refuse("minOrder");

  if (coupon.kind === "free-delivery" && ctx.fulfillment === "pickup") {
    return refuse("deliveryOnly");
  }
  if (coupon.kind === "bogo" && basketItemCount(ctx) < 2) return refuse("needsTwoItems");

  const savings = couponSavings(coupon, ctx);
  const totalSaving = savings.discount + savings.deliveryWaived + savings.cashback;
  // A coupon that would take nothing off is refused rather than applied: a
  // free-delivery code on a basket already over the free-delivery threshold is
  // better explained than silently applied for zero.
  if (totalSaving <= 0) return refuse("noSaving");

  return { eligible: true, reasonKey: null, ...savings, totalSaving };
}

/** One held coupon evaluated against a basket. */
export interface CouponOption {
  held: HeldCoupon;
  evaluation: CouponEvaluation;
}

/**
 * Evaluate a whole wallet against one basket: what applies goes first, ordered
 * by what it saves; what does not follows, each carrying its reason.
 */
export function evaluateWallet(
  held: HeldCoupon[],
  ctx: CouponContext,
): CouponOption[] {
  return held
    .map((h) => ({ held: h, evaluation: evaluateCoupon(h.coupon, h.claim, ctx) }))
    .sort((a, b) => {
      if (a.evaluation.eligible !== b.evaluation.eligible) {
        return a.evaluation.eligible ? -1 : 1;
      }
      if (a.evaluation.eligible) return b.evaluation.totalSaving - a.evaluation.totalSaving;
      // Among the unusable, show the ones that are merely out of reach (a bigger
      // basket would do it) above the ones that are gone for good.
      return statusRank(a.held.status) - statusRank(b.held.status);
    });
}

function statusRank(status: CouponStatus): number {
  return status === "active" ? 0 : status === "scheduled" ? 1 : status === "used" ? 2 : 3;
}

/** The coupon worth the most on this basket, or null when none applies. */
export function bestCoupon(options: CouponOption[]): CouponOption | null {
  const usable = options.filter((o) => o.evaluation.eligible);
  return usable.length > 0 ? usable[0] : null;
}

/**
 * Wallet ordering: usable tickets first (soonest to expire at the top, because
 * that is the one to spend), then scheduled, then spent, then expired.
 */
export function sortHeld(held: HeldCoupon[]): HeldCoupon[] {
  return [...held].sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return Date.parse(a.coupon.endsAt) - Date.parse(b.coupon.endsAt);
  });
}

/** Re-price an applied coupon after the basket changes (or drop it if it no longer applies). */
export function revalidate(
  applied: AppliedCoupon | null,
  claim: CouponClaim | null,
  ctx: CouponContext,
): AppliedCoupon | null {
  if (!applied) return null;
  const evaluation = evaluateCoupon(applied.coupon, claim, ctx);
  return { coupon: applied.coupon, evaluation };
}
