import {
  currencies,
  defaultCurrency,
  type CurrencyCode,
} from "@/frontend/config/regions";

/**
 * format.ts — locale/region-aware presentation helpers.
 *
 * All monetary values in the app are plain numbers in the entity's currency.
 * These helpers turn them into display strings using the region config, so no
 * component ever hardcodes a currency symbol or "$" — satisfying the global
 * multi-currency requirement.
 */

/** Format an amount in the given currency, e.g. 1200 -> "$1,200.00" / "৳1,200". */
export function formatPrice(
  value: number,
  currency: CurrencyCode = defaultCurrency,
): string {
  const c = currencies[currency];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: c.fractionDigits,
    maximumFractionDigits: c.fractionDigits,
  }).format(value);
}

/** Compact number, e.g. 12500 -> "12.5K". Used for review counts, followers. */
export function formatCompact(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** One-decimal rating, e.g. 4 -> "4.0". */
export function formatRating(value: number): string {
  return value.toFixed(1);
}

/** Distance in km, e.g. 1.4 -> "1.4 km", 0.3 -> "300 m". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Relative delivery estimate, e.g. {20,35} -> "20–35 min". */
export function formatEta(minLow: number, minHigh: number): string {
  return `${minLow}–${minHigh} min`;
}
