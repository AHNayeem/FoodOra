/**
 * Shape rules for the three code spaces, as pure predicates.
 *
 * They are here rather than in a Zod schema at the edge because these codes are also
 * written by the reference-data script and by later modules, and a rule that only the
 * GraphQL layer enforces is a rule with a back door. The Zod schemas call these.
 *
 * Deliberately **shape only** — no list of the 249 real ISO countries. An allowlist
 * would be a second source of truth for which markets exist, competing with the table
 * that is supposed to be the first, and it would need a deploy every time ISO revises
 * anything. "Two uppercase letters" is what can be checked without lying about
 * authority; whether `XX` is a country is the operator's business.
 */

const ALPHA_2 = /^[A-Z]{2}$/;
const ALPHA_3 = /^[A-Z]{3}$/;
/** BCP-47 as far as the platform uses it: `en`, `bn`, `pt-BR`, `zh-Hant`. */
const BCP_47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const DIAL_CODE = /^\+[1-9]\d{0,3}$/;
/** IANA zone, e.g. `Asia/Dhaka`, `America/Argentina/Buenos_Aires`, `UTC`. */
const IANA_ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

export function isCountryCode(value: string): boolean {
  return ALPHA_2.test(value);
}

export function isCurrencyCode(value: string): boolean {
  return ALPHA_3.test(value);
}

export function isLocaleCode(value: string): boolean {
  return value.length <= 8 && BCP_47.test(value);
}

export function isDialCode(value: string): boolean {
  return DIAL_CODE.test(value);
}

export function isTimezone(value: string): boolean {
  return value.length <= 64 && IANA_ZONE.test(value);
}

/**
 * Codes are stored uppercase and compared uppercase, so `"bd"` from a query string
 * and `"BD"` from a token resolve to the same country.
 *
 * Locales are the exception and stay as written: BCP-47 is case-insensitive by spec
 * but conventionally cased (`pt-BR`, not `PT-BR`), and `Intl.NumberFormat` accepts
 * either — uppercasing them would only make the values in the database uglier than
 * the values in the frontend's config.
 */
export function normaliseCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normaliseCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normaliseLocaleCode(value: string): string {
  return value.trim();
}
