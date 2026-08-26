import type {
  CateringAddOn,
  CateringPricing,
  EventType,
  QuoteAddOnLine,
  ServiceStyle,
  TaxTerms,
} from "@/types";
import { roundMoney } from "./checkout";
import { resolveTax } from "./platform-settings";

/**
 * catering.ts — pure catering-quote math + the event/style vocabularies, kept
 * out of the UI so the estimate is trivially testable and shared by the quote
 * builder's live summary and the `requestQuote` service. Nothing here reads or
 * mutates state; the estimate is always derived from the package price, guest
 * count and chosen add-ons.
 */

/** Platform service fee charged on catering events (fraction of the subtotal). */
export const SERVICE_FEE_RATE = 0.1;

/** The event types, in display order (spec: Wedding/Corporate/…/Outdoor). */
export const EVENT_TYPES = [
  "wedding",
  "corporate",
  "birthday",
  "conference",
  "outdoor",
] as const satisfies readonly EventType[];

/** Emoji used on the event-type chips (label text comes from i18n). */
export const EVENT_TYPE_EMOJI: Record<EventType, string> = {
  wedding: "💍",
  corporate: "🏢",
  birthday: "🎉",
  conference: "🎤",
  outdoor: "⛺",
};

/** The serving styles a caterer/package can use. */
export const SERVICE_STYLES = [
  "buffet",
  "plated",
  "family-style",
  "food-stations",
  "drop-off",
] as const satisfies readonly ServiceStyle[];

export function isEventType(value: string | undefined): value is EventType {
  return !!value && (EVENT_TYPES as readonly string[]).includes(value);
}

/** Resolve an add-on's amount for a given guest count (per-guest vs flat fee). */
export function addOnAmount(addOn: CateringAddOn, guests: number): number {
  return addOn.unit === "per-guest" ? addOn.price * guests : addOn.price;
}

/** Build a quote line for a chosen add-on, capturing its computed amount. */
export function toAddOnLine(addOn: CateringAddOn, guests: number): QuoteAddOnLine {
  return {
    id: addOn.id,
    name: addOn.name,
    unit: addOn.unit,
    price: addOn.price,
    amount: roundMoney(addOnAmount(addOn, guests), addOn.currency),
  };
}

export interface EstimateInput {
  pricePerGuest: number;
  guests: number;
  /** Resolved add-on lines (see `toAddOnLine`). */
  addOns: QuoteAddOnLine[];
  currency: string;
  countryCode: string;
  /**
   * The platform's tax terms for this country (Phase 19, G30). Injected rather
   * than looked up so an operator's change to the rate reaches the bill; absent,
   * `config/regions.ts` answers exactly as before. See
   * `lib/platform-settings.resolveTax`.
   */
  tax?: TaxTerms | null;
}

/**
 * Compute the indicative event estimate. The package subtotal is per-guest ×
 * guests; add-ons are summed; a platform service fee is charged on the two, and
 * tax is applied on top at the event country's rate. All amounts are rounded to
 * the currency's precision.
 */
export function estimateQuote({
  pricePerGuest,
  guests,
  addOns,
  currency,
  countryCode,
  tax: taxTerms,
}: EstimateInput): CateringPricing {
  const { rate: taxRate, label: taxLabel } = resolveTax(countryCode, taxTerms);

  const packageSubtotal = roundMoney(pricePerGuest * guests, currency);
  const addOnsTotal = roundMoney(
    addOns.reduce((sum, a) => sum + a.amount, 0),
    currency,
  );
  const serviceFee = roundMoney((packageSubtotal + addOnsTotal) * SERVICE_FEE_RATE, currency);
  const taxable = packageSubtotal + addOnsTotal + serviceFee;
  const tax = roundMoney(taxable * taxRate, currency);
  const total = roundMoney(taxable + tax, currency);

  return {
    currency,
    pricePerGuest,
    guests,
    packageSubtotal,
    addOnsTotal,
    serviceFee,
    serviceFeeRate: SERVICE_FEE_RATE,
    tax,
    taxLabel,
    taxRate,
    total,
  };
}
