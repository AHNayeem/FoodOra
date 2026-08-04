import {
  cartSubtotal,
  type CartLineRecord,
  type CartVendorRecord,
  deliveryFeeFor,
  money,
} from '../../../cart/domain';
import type { FulfillmentType } from '../../../../shared/enums';
import type { CouponOutcome, OrderPricingRecord, TaxRuleRecord } from '../models';

/**
 * Order totals — the server's copy of `frontend/lib/checkout.ts::computeTotals`.
 *
 * ## Why this exists even though the client already computes it
 *
 * Because the client's total is a *display*, and this one is a *price*. The checkout
 * screen has to show a number the instant a tip preset is tapped, with no round trip,
 * so it will always compute its own; what it must never do is tell the server what to
 * charge. Every input to the arithmetic below is either read from a stored row (line
 * prices, the vendor's fee and threshold, the coupon's rule, the tax rate) or is a
 * choice with no monetary content (delivery or pickup, which tip fraction, which code).
 *
 * That is the whole of "prices, discounts, taxes, delivery fees and totals are never
 * trusted from the client": there is no parameter here that a client could set to change
 * what an order costs, because the only numbers it may send are a fraction and a code.
 *
 * ## The order of operations, and why each step is where it is
 *
 * ```
 *   subtotal   = Σ unitPrice × quantity                        (stored line snapshots)
 *   discount   = min(coupon discount, subtotal)                 (never negative money)
 *   deliveryFee= 0 on pickup, or on a waiver, else the vendor's (threshold applied first)
 *   taxable    = subtotal − discount
 *   tax        = taxable × rate                                 (post-discount, pre-fee)
 *   tip        = subtotal × tipPercent                           (pre-discount)
 *   total      = taxable + deliveryFee + tax + tip
 * ```
 *
 * Three of those placements are decisions rather than arithmetic, and all three match
 * what Phase C shipped, because changing them would change what customers are charged:
 *
 * - **Tax is charged on the discounted subtotal, and not on the delivery fee.** A coupon
 *   reduces the taxable amount, which is how consumption tax works nearly everywhere:
 *   the tax follows the price actually paid. Whether delivery is taxable genuinely varies
 *   by jurisdiction — the schema's `tax_rules.appliesTo` anticipates that — and V1 resolves
 *   only the `order-subtotal` rule, which is the one the prototype has always applied.
 * - **The tip is a fraction of the *undiscounted* subtotal.** A courier's tip should not
 *   shrink because the customer had a voucher; the tip is about the delivery, not the bill.
 * - **Cashback is not subtracted.** It is credited to the wallet after the order, so it
 *   leaves the total alone. A coupon that flattered the total and then paid out separately
 *   would be counted twice.
 *
 * Every intermediate goes through `money()` — two decimal places — for the reason set out
 * in the cart's pricing policy: summing doubles drifts, and a round at each step is what
 * stops it surviving. When the ledger arrives, its arithmetic belongs in `Decimal` on
 * integer minor units. An order total is not a ledger entry.
 */

export interface PricingInput {
  vendor: CartVendorRecord;
  lines: readonly CartLineRecord[];
  fulfillment: FulfillmentType;
  /** Fraction of the subtotal, already validated against the configured ceiling. */
  tipPercent: number;
  /** The priced coupon, or null. Its `discount`/`freeDelivery` are the server's numbers. */
  coupon: CouponOutcome | null;
  /** The resolved tax rule for the vendor's jurisdiction. */
  tax: TaxRuleRecord;
}

export function computePricing(input: PricingInput): OrderPricingRecord {
  const { vendor, lines, fulfillment, tipPercent, coupon, tax } = input;
  const currency = vendor.currency;

  const subtotal = cartSubtotal(lines);

  // Clamped to the subtotal: a ৳500 voucher on a ৳300 basket takes ৳300, not ৳500 and a
  // negative total that the payment layer would have to reject much later.
  const discount = coupon ? money(Math.min(coupon.discount, subtotal)) : 0;

  const waived = coupon?.freeDelivery ?? false;
  const deliveryFee =
    fulfillment === 'pickup' || waived ? 0 : deliveryFeeFor(vendor, subtotal);

  const taxable = Math.max(0, money(subtotal - discount));
  const taxAmount = money(taxable * tax.rate);
  const tip = money(subtotal * tipPercent);
  const total = money(taxable + deliveryFee + taxAmount + tip);

  return {
    currency,
    subtotal,
    deliveryFee,
    discount,
    couponCode: coupon?.coupon.code ?? null,
    tax: taxAmount,
    taxLabel: tax.label,
    taxRate: tax.rate,
    tip,
    total,
  };
}

/**
 * How much more the basket needs to reach the vendor's minimum order.
 *
 * `frontend/lib/cart.ts::amountToMinOrder`, and the same shape of answer: zero when the
 * minimum is met, so a caller can treat it as a boolean without a second rule.
 */
export function amountToMinOrder(vendor: CartVendorRecord, subtotal: number): number {
  return subtotal >= vendor.minOrder ? 0 : money(vendor.minOrder - subtotal);
}

/**
 * Is the tip fraction acceptable?
 *
 * Rejected rather than clamped. A clamped tip charges a different amount than the screen
 * showed, silently, on the one line item the customer chose freely — so a request that
 * asks for something impossible is refused and the client re-prices.
 */
export function isValidTipPercent(tipPercent: number, maxPercent: number): boolean {
  return Number.isFinite(tipPercent) && tipPercent >= 0 && tipPercent <= maxPercent;
}
