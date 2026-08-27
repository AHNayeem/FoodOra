/**
 * normalize.js — one spelling per identifier, decided before the database sees it.
 *
 * Every identifier in this module is looked up by equality, so "the same
 * identifier" has to be a settled question. Two of the three are settled here and
 * the third is settled by PostgreSQL:
 *
 *  - **Email** — `users.email` is `citext`, so the unique index and every `WHERE`
 *    are already case-insensitive. Trimming and lower-casing anyway is not
 *    redundant: the value is also written into `login_attempts.identifier` and
 *    `otp_challenges.destination`, which are plain `varchar`, and those two would
 *    otherwise hold three spellings of one address.
 *  - **Phone** — E.164, as `users.phone` requires. Kept deliberately narrow: it
 *    strips spacing and punctuation and applies the default dial code to a local
 *    number, and it does **not** attempt to parse the world's numbering plans. A
 *    real `libphonenumber` belongs here the day the platform takes numbers it
 *    cannot round-trip; guessing at it now would produce confidently wrong E.164.
 *  - **OTP destination** — whichever of the two the channel names.
 */

/** Trimmed and lower-cased. `citext` makes the database agree. */
export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

/**
 * `"+880 1712-345678"` → `"+8801712345678"`; `"01712345678"` → `"+8801712345678"`.
 *
 * @param {string} value
 * @param {string} dialCode The country's `+880`, applied to a number with no
 *   country prefix. A local number with no default is returned unchanged and
 *   fails validation, which is better than inventing a country for it.
 */
export function normalizePhone(value, dialCode = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;

  const local = digits.replace(/\D/g, "");
  if (!local) return "";
  if (!dialCode) return local;

  const prefix = dialCode.startsWith("+") ? dialCode : `+${dialCode}`;
  // A local number conventionally carries a trunk "0" that E.164 does not.
  return `${prefix}${local.replace(/^0+/, "")}`;
}

/** E.164: a plus, a non-zero leading digit, and up to fifteen digits in total. */
export const isE164 = (value) => /^\+[1-9]\d{6,14}$/.test(String(value ?? ""));

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? ""));

/** Normalise by channel — `sms` means a phone, `email` means an address. */
export function normalizeDestination(destination, channel, dialCode) {
  return channel === "email"
    ? normalizeEmail(destination)
    : normalizePhone(destination, dialCode);
}
