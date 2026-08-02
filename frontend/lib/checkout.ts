import {
  countries,
  currencies,
  defaultCountry,
  type CountryCode,
  type CurrencyCode,
} from "@/frontend/config/regions";
import type { AppliedCoupon, CartLine, CartVendor, OrderPricing } from "@/frontend/types";
import { cartSubtotal, deliveryFeeFor } from "./cart";

/**
 * checkout.ts — pure order-total math (tax, tip, coupon, grand total), kept out
 * of the UI so it is trivially testable and shared by the checkout summary, the
 * `placeOrder` service and any future server-side recompute. Nothing here reads
 * or mutates state; totals are always derived from the cart + a few knobs.
 *
 * Phase C21 replaced the hard-coded promo table this file used to own: a
 * discount now arrives as an `AppliedCoupon` already priced and validated by
 * `lib/coupons` through `services/coupons`, so there is one coupon engine rather
 * than a checkout-only copy of one.
 */

/** Tip presets offered in the summary (fraction of subtotal). */
export const TIP_PRESETS = [0, 0.05, 0.1, 0.15] as const;

/** Round to the currency's display precision so totals never show phantom decimals. */
export function roundMoney(value: number, currency: string): number {
  const digits = currencies[currency as CurrencyCode]?.fractionDigits ?? 2;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface TotalsInput {
  vendor: CartVendor;
  lines: CartLine[];
  /** Tip as a fraction of subtotal (see TIP_PRESETS). */
  tipPercent: number;
  /** An applied coupon, already priced by the coupon engine (C21), or null. */
  coupon: AppliedCoupon | null;
  /** Pickup waives the delivery fee. */
  fulfillment: "delivery" | "pickup";
}

/**
 * Compute the full price breakdown for an order. Tax is charged on the
 * post-discount subtotal using the vendor country's rate; the tip is charged on
 * the raw subtotal. All amounts are rounded to the currency's precision.
 *
 * A coupon can move two lines: money off the subtotal (`discount`) and a waived
 * delivery fee. Cashback deliberately moves neither — it is credited to the
 * wallet once the order is placed, so it never flatters the total.
 */
export function computeTotals({
  vendor,
  lines,
  tipPercent,
  coupon,
  fulfillment,
}: TotalsInput): OrderPricing {
  const currency = vendor.currency;
  const subtotal = cartSubtotal(lines);

  const countryCode = (vendor.countryCode as CountryCode) ?? defaultCountry;
  const country = countries[countryCode] ?? countries[defaultCountry];

  const discount = coupon
    ? roundMoney(Math.min(coupon.evaluation.discount, subtotal), currency)
    : 0;
  const deliveryFee =
    fulfillment === "pickup" || coupon?.evaluation.freeDelivery
      ? 0
      : deliveryFeeFor(vendor, subtotal);
  const taxable = Math.max(0, subtotal - discount);
  const tax = roundMoney(taxable * country.taxRate, currency);
  const tip = roundMoney(subtotal * tipPercent, currency);
  const total = roundMoney(taxable + deliveryFee + tax + tip, currency);

  return {
    currency,
    subtotal,
    deliveryFee,
    discount,
    tax,
    taxLabel: country.taxLabel,
    taxRate: country.taxRate,
    tip,
    total,
    couponCode: coupon?.coupon.code ?? null,
  };
}
