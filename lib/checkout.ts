import {
  countries,
  currencies,
  defaultCountry,
  type CountryCode,
  type CurrencyCode,
} from "@/config/regions";
import type { CartLine, CartVendor, OrderPricing } from "@/types";
import { cartSubtotal, deliveryFeeFor } from "./cart";

/**
 * checkout.ts — pure order-total math (tax, tip, promo, grand total), kept out
 * of the UI so it is trivially testable and shared by the checkout summary, the
 * `placeOrder` service and any future server-side recompute. Nothing here reads
 * or mutates state; totals are always derived from the cart + a few knobs.
 */

/** Simulated promo catalogue. In production this is a validated voucher table. */
export interface Promo {
  code: string;
  /** Fraction off the subtotal, 0–1. */
  percentOff: number;
  /** Minimum subtotal required to apply. */
  minSubtotal: number;
  labelKey: string;
}

export const PROMOS: Promo[] = [
  { code: "FOODORA10", percentOff: 0.1, minSubtotal: 0, labelKey: "promoWelcome" },
  { code: "SAVE20", percentOff: 0.2, minSubtotal: 800, labelKey: "promoBig" },
];

/** Tip presets offered in the summary (fraction of subtotal). */
export const TIP_PRESETS = [0, 0.05, 0.1, 0.15] as const;

/** Round to the currency's display precision so totals never show phantom decimals. */
export function roundMoney(value: number, currency: string): number {
  const digits = currencies[currency as CurrencyCode]?.fractionDigits ?? 2;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Look up a promo by (case-insensitive) code. */
export function findPromo(code: string): Promo | undefined {
  const norm = code.trim().toUpperCase();
  return PROMOS.find((p) => p.code === norm);
}

export interface PromoResult {
  promo: Promo | null;
  /** i18n key describing why an entered code was rejected, else null. */
  errorKey: string | null;
}

/** Validate an entered promo code against the current subtotal. */
export function evaluatePromo(code: string, subtotal: number): PromoResult {
  if (!code.trim()) return { promo: null, errorKey: null };
  const promo = findPromo(code);
  if (!promo) return { promo: null, errorKey: "promoInvalid" };
  if (subtotal < promo.minSubtotal) return { promo: null, errorKey: "promoMinNotMet" };
  return { promo, errorKey: null };
}

export interface TotalsInput {
  vendor: CartVendor;
  lines: CartLine[];
  /** Tip as a fraction of subtotal (see TIP_PRESETS). */
  tipPercent: number;
  /** An applied promo, or null. */
  promo: Promo | null;
  /** Pickup waives the delivery fee. */
  fulfillment: "delivery" | "pickup";
}

/**
 * Compute the full price breakdown for an order. Tax is charged on the
 * post-discount subtotal using the vendor country's rate; the tip is charged on
 * the raw subtotal. All amounts are rounded to the currency's precision.
 */
export function computeTotals({
  vendor,
  lines,
  tipPercent,
  promo,
  fulfillment,
}: TotalsInput): OrderPricing {
  const currency = vendor.currency;
  const subtotal = cartSubtotal(lines);

  const countryCode = (vendor.countryCode as CountryCode) ?? defaultCountry;
  const country = countries[countryCode] ?? countries[defaultCountry];

  const discount =
    promo != null ? roundMoney(subtotal * promo.percentOff, currency) : 0;
  const deliveryFee =
    fulfillment === "pickup" ? 0 : deliveryFeeFor(vendor, subtotal);
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
  };
}
