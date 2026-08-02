import {
  countries,
  defaultCountry,
  type CountryCode,
} from "@/frontend/config/regions";
import type {
  CartLine,
  DineInRound,
  DineInRoundStatus,
  QrPricing,
  ServiceRequest,
  ServiceRequestKind,
} from "@/frontend/types";
import { cartSubtotal } from "./cart";
import { roundMoney } from "./checkout";

/**
 * qr.ts — pure QR Menu math and time-derived state (Phase C12).
 *
 * Nothing here reads state or the clock: callers pass `now` in, exactly as
 * `lib/tracking.ts` does for order tracking, so a round's kitchen status stays
 * a deterministic function of elapsed time and the seed never needs a backend.
 */

/** Query key carrying the table id on a scanned link — `/m/pizza?t=tbl_…`. */
export const QR_TABLE_PARAM = "t";

/** Fallback service charge when a venue has no configured rate. */
export const DEFAULT_SERVICE_CHARGE_RATE = 0.05;

/** A sent round is picked up by the kitchen after this long. */
export const ROUND_PREPARING_AFTER_MS = 90_000;

/** …and lands on the table after this long. */
export const ROUND_SERVED_AFTER_MS = 9 * 60_000;

/** A service request is acknowledged by the floor after this long. */
export const REQUEST_ACK_AFTER_MS = 45_000;

/** Service actions a guest can raise, in display order. */
export const SERVICE_REQUEST_KINDS: readonly ServiceRequestKind[] = [
  "waiter",
  "water",
  "cutlery",
  "bill",
];

/** The path a QR code encodes. Table codes carry the table; venue codes don't. */
export function qrMenuPath(vendorSlug: string, tableId?: string | null): string {
  const base = `/m/${vendorSlug}`;
  return tableId ? `${base}?${QR_TABLE_PARAM}=${encodeURIComponent(tableId)}` : base;
}

/** Absolute URL to encode, given the host the studio is being viewed on. */
export function qrMenuUrl(
  origin: string,
  vendorSlug: string,
  tableId?: string | null,
): string {
  return `${origin.replace(/\/$/, "")}${qrMenuPath(vendorSlug, tableId)}`;
}

export interface QrTotalsInput {
  lines: CartLine[];
  currency: string;
  /** Vendor country — drives the tax rate/label. */
  countryCode: string;
  serviceChargeRate: number;
}

/**
 * Dine-in bill breakdown. No delivery fee (the guest is sitting in the room);
 * the venue's service charge is added to the subtotal and tax is charged on
 * the two together, which is how a restaurant bill actually reads. Every
 * amount is rounded to the currency's precision.
 */
export function computeQrTotals({
  lines,
  currency,
  countryCode,
  serviceChargeRate,
}: QrTotalsInput): QrPricing {
  const country = countries[countryCode as CountryCode] ?? countries[defaultCountry];
  const rate = Math.max(0, serviceChargeRate);

  const subtotal = roundMoney(cartSubtotal(lines), currency);
  const serviceCharge = roundMoney(subtotal * rate, currency);
  const tax = roundMoney((subtotal + serviceCharge) * country.taxRate, currency);

  return {
    currency,
    subtotal,
    serviceCharge,
    serviceChargeRate: rate,
    tax,
    taxLabel: country.taxLabel,
    taxRate: country.taxRate,
    total: roundMoney(subtotal + serviceCharge + tax, currency),
  };
}

/** Every line the table has actually ordered, across all sent rounds. */
export function roundsLines(rounds: DineInRound[]): CartLine[] {
  return rounds.flatMap((r) => r.lines);
}

/** Kitchen progress for a round, derived from how long ago it was sent. */
export function roundStatus(round: DineInRound, now: number): DineInRoundStatus {
  const elapsed = now - new Date(round.sentAt).getTime();
  if (elapsed >= ROUND_SERVED_AFTER_MS) return "served";
  if (elapsed >= ROUND_PREPARING_AFTER_MS) return "preparing";
  return "sent";
}

/** Has the floor picked up this request yet? Derived, like round status. */
export function isRequestAcknowledged(
  request: ServiceRequest,
  now: number,
): boolean {
  return now - new Date(request.requestedAt).getTime() >= REQUEST_ACK_AFTER_MS;
}

/**
 * Identity of a sitting. When a guest scans a different table (or a different
 * venue) the session store resets rather than carrying the old bill over.
 */
export function sessionKey(vendorId: string, tableId: string | null): string {
  return `${vendorId}:${tableId ?? "counter"}`;
}

/** Filename stem for a downloaded code, e.g. "bella-napoli-t3-qr". */
export function qrFileSlug(vendorSlug: string, label: string): string {
  const suffix = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${vendorSlug}-${suffix || "menu"}-qr`;
}
