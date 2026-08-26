/**
 * regions.ts — multi-currency / multi-country / tax configuration.
 *
 * The platform is global: currency, country and tax rules are all data, never
 * hardcoded in components. This is the **baseline** — the published table every
 * device starts from (see spec: Countries / Currencies / Tax).
 *
 * Phase 19 (G30) made it editable without making it mutable. An operator's change
 * to a country's tax rate or label, or to whether the platform trades there at
 * all, is a *diff* held in `stores/platform-settings` and folded back over this
 * table by `lib/platform-settings.effectiveRegions`. So:
 *
 *  - **This file is still the single source of truth for anything nobody has
 *    edited.** A patch records only the fields an operator actually set, which is
 *    why editing a rate here still reaches every device.
 *  - **Nothing reads `taxRate`/`taxLabel` off this table directly any more.** The
 *    five pricing functions (`lib/checkout`, `pos`, `qr`, `catering`,
 *    `subscriptions`) take their terms through
 *    `lib/platform-settings.resolveTax`, which falls back to this table when the
 *    caller has no opinion — the deterministic seeds and the server-rendered
 *    marketing pages, both of which should show the published rate.
 *  - **Currency definitions are deliberately not editable.** `symbol`, `locale`
 *    and `fractionDigits` are facts about ISO 4217 and `Intl`, not policy; see
 *    the header of `types/platform-settings.ts`.
 */

export interface Currency {
  code: string; // ISO 4217
  symbol: string;
  /** Intl locale used to format amounts in this currency. */
  locale: string;
  /** Fraction digits to display (0 for JPY-like, 2 for most). */
  fractionDigits: number;
}

export const currencies = {
  USD: { code: "USD", symbol: "$", locale: "en-US", fractionDigits: 2 },
  BDT: { code: "BDT", symbol: "৳", locale: "bn-BD", fractionDigits: 0 },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE", fractionDigits: 2 },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB", fractionDigits: 2 },
  AED: { code: "AED", symbol: "د.إ", locale: "ar-AE", fractionDigits: 2 },
} as const satisfies Record<string, Currency>;

export type CurrencyCode = keyof typeof currencies;

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: CurrencyCode;
  timezone: string;
  /** Default consumption tax / VAT rate applied to orders (0–1). */
  taxRate: number;
  taxLabel: string;
  dialCode: string;
}

export const countries = {
  US: { code: "US", name: "United States", currency: "USD", timezone: "America/New_York", taxRate: 0.0875, taxLabel: "Sales Tax", dialCode: "+1" },
  BD: { code: "BD", name: "Bangladesh", currency: "BDT", timezone: "Asia/Dhaka", taxRate: 0.05, taxLabel: "VAT", dialCode: "+880" },
  GB: { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London", taxRate: 0.2, taxLabel: "VAT", dialCode: "+44" },
  AE: { code: "AE", name: "United Arab Emirates", currency: "AED", timezone: "Asia/Dubai", taxRate: 0.05, taxLabel: "VAT", dialCode: "+971" },
  DE: { code: "DE", name: "Germany", currency: "EUR", timezone: "Europe/Berlin", taxRate: 0.19, taxLabel: "VAT", dialCode: "+49" },
} as const satisfies Record<string, Country>;

export type CountryCode = keyof typeof countries;

export const defaultCountry: CountryCode = "BD";
export const defaultCurrency: CurrencyCode = "BDT";
