import {
  countries,
  defaultCountry,
  type CountryCode,
} from "@/config/regions";
import type { PosDiscount, PosPricing, PosTicketLine } from "@/types";
import { roundMoney } from "./checkout";

/**
 * pos.ts — pure POS ticket math (Phase C11), kept out of the terminal UI so it
 * is trivially testable and shared by the ticket panel, the charge dialog and
 * the `completeSale` service. Nothing here reads or mutates state; totals are
 * always derived from the lines + a couple of knobs. Mirrors `lib/checkout`.
 */

/** Order types offered on the terminal, in display order. */
export const POS_ORDER_TYPES = ["dine-in", "takeaway", "delivery"] as const;

/** Quick percent-off presets on the discount control. */
export const POS_QUICK_DISCOUNTS = [5, 10, 15, 20] as const;

/** Total units across a ticket (drives the count badge). */
export function ticketCount(lines: PosTicketLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** Sum of line totals before discount and tax. */
export function ticketSubtotal(lines: PosTicketLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

/** Resolve a discount to an absolute amount, clamped to [0, subtotal]. */
export function discountAmount(
  discount: PosDiscount | null,
  subtotal: number,
): number {
  if (!discount) return 0;
  if (discount.type === "percent") {
    const pct = Math.min(100, Math.max(0, discount.value));
    return (subtotal * pct) / 100;
  }
  return Math.min(subtotal, Math.max(0, discount.value));
}

export interface PosTotalsInput {
  lines: PosTicketLine[];
  discount: PosDiscount | null;
  currency: string;
  /** Vendor country — drives the tax rate/label. */
  countryCode: string;
}

/**
 * Full price breakdown for a ticket. Tax is charged on the post-discount
 * subtotal using the vendor country's rate; every amount is rounded to the
 * currency's precision so no phantom decimals ever surface at the counter.
 */
export function computePosTotals({
  lines,
  discount,
  currency,
  countryCode,
}: PosTotalsInput): PosPricing {
  const subtotal = ticketSubtotal(lines);
  const country = countries[countryCode as CountryCode] ?? countries[defaultCountry];

  const discountVal = roundMoney(discountAmount(discount, subtotal), currency);
  const taxable = Math.max(0, subtotal - discountVal);
  const tax = roundMoney(taxable * country.taxRate, currency);
  const total = roundMoney(taxable + tax, currency);

  return {
    currency,
    subtotal: roundMoney(subtotal, currency),
    discount: discountVal,
    tax,
    taxLabel: country.taxLabel,
    taxRate: country.taxRate,
    total,
  };
}

/** Change owed to the customer for a cash tender (never negative). */
export function changeDue(total: number, tendered: number): number {
  return Math.max(0, tendered - total);
}

/**
 * Suggested cash tender buttons: the exact amount plus a few sensible
 * round-ups above it, deduped and ascending. Zero-decimal currencies (BDT)
 * round to notes; others round up to the next whole unit.
 */
export function cashTenderPresets(total: number, currency: string): number[] {
  if (total <= 0) return [];
  const zeroDecimal = roundMoney(1.5, currency) === 2; // BDT-style: no fractions
  const step = zeroDecimal ? 100 : 5;
  const exact = roundMoney(total, currency);

  const presets = new Set<number>([exact]);
  for (let mult = 1; presets.size < 4 && mult <= 8; mult++) {
    const candidate = Math.ceil(total / (step * mult)) * (step * mult);
    if (candidate > exact) presets.add(candidate);
  }

  return [...presets].sort((a, b) => a - b);
}

/** Human-facing sale reference, e.g. "POS-8F3A21". Deterministic from a clock ms. */
export function saleNumberFrom(ms: number): string {
  return `POS-${ms.toString(36).toUpperCase().slice(-6)}`;
}
