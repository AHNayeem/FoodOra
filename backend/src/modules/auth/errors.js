/**
 * errors.js — the closed set of *refusals* the auth module may return.
 *
 * Not exceptions. `shared/errors/envelope.js` draws the line and this file is on
 * the far side of it: a wrong password, a spent code and a locked credential are
 * **answers**, so they leave as HTTP 200 with `{ success: false, error: { key } }`
 * and the client's form renders the key. The exceptions the module can still
 * throw — no token, rate limited, the database is down — go through `AppError`
 * as everywhere else.
 *
 * Every key below is checked against two lists on the frontend, and it has to be
 * in both or the screen shows "something went wrong" instead:
 *
 *  - `messages/{en,bn,ar}.json` under `auth.errors.*`, which is what renders;
 *  - `RENDERABLE` in `lib/graphql/result.ts`, which is the whitelist that decides
 *    whether the key is rendered at all.
 *
 * Nothing here was invented. Adding a key means adding it to three locale files
 * and to `RENDERABLE` in the same change — which is exactly the friction that
 * stops the API growing a vocabulary the app cannot speak.
 */

export const AUTH_ERRORS = Object.freeze({
  // -- credentials -----------------------------------------------------------
  /**
   * The catch-all for sign-in. Deliberately the *same* answer for "no such
   * account", "soft-deleted account" and "wrong password": three different
   * answers would let anyone with a login form enumerate the user table.
   */
  invalidCredentials: "errors.invalidCredentials",
  /** Distinct from the above only where the account is already known to the caller. */
  wrongPassword: "errors.wrongPassword",
  /** The account exists but has no password — it was created through OTP or social. */
  noPassword: "errors.noPassword",
  emailTaken: "errors.emailTaken",
  phoneTaken: "errors.phoneTaken",
  phoneMissing: "errors.phoneMissing",
  accountNotFound: "errors.accountNotFound",
  /** Too many consecutive failures; `credentials.lockedUntil` is in the future. */
  accountLocked: "errors.accountLocked",
  /**
   * `UserStatus.SUSPENDED` **and** `UserStatus.BANNED`.
   *
   * One key for two states because there is no `errors.accountBanned` in the
   * locale files, and a key nothing can render is worse than a key that is
   * slightly coarse. The distinction is preserved where it matters — in
   * `users.status`, `users.blockReason` and the moderation log — and reaches a
   * person through the admin desk rather than through the sign-in form.
   */
  accountSuspended: "errors.accountSuspended",

  // -- one-time codes --------------------------------------------------------
  invalidOtp: "errors.invalidOtp",
  otpExpired: "errors.otpExpired",
  otpAttemptsExhausted: "errors.otpAttemptsExhausted",
  /** No challenge in flight for this destination and purpose. */
  otpNotRequested: "errors.otpNotRequested",
  /** Resend asked for inside the cooldown. */
  otpTooSoon: "errors.otpTooSoon",

  // -- password reset --------------------------------------------------------
  /** Unknown, spent or expired — one answer, for the enumeration reason above. */
  resetTokenInvalid: "errors.resetTokenInvalid",
  samePassword: "errors.samePassword",

  // -- input -----------------------------------------------------------------
  passwordShort: "errors.passwordShort",
  phoneInvalid: "errors.phoneInvalid",
  emailInvalid: "errors.emailInvalid",
});

/**
 * The short reason recorded on a `LoginAttempt` row.
 *
 * `login_attempts.reason` is `VarChar(60)` and the schema comment says it holds
 * "the i18n key under `errors.*`", so the stored value is the key with its
 * prefix dropped — `"invalidCredentials"`, not `"errors.invalidCredentials"` —
 * which fits the column and reads the same in a dashboard.
 */
export const attemptReason = (key) => (key ? String(key).replace(/^errors\./, "").slice(0, 60) : null);
