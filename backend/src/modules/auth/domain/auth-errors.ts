/**
 * Every refusal this module can produce, as an i18n key.
 *
 * They are **relative to the frontend's namespace**, which is why they read
 * `errors.invalidCredentials` rather than `auth.errors.invalidCredentials`: the
 * sign-in screen already calls `t("errors.invalidCredentials")` inside its `auth`
 * namespace, and the settings screen calls `t("errors.wrongPassword")` inside
 * `settings`. Keeping the server's keys namespace-relative is what lets
 * `services/auth.ts` keep returning exactly what it returns today.
 *
 * The three keys the prototype already ships — `invalidCredentials`,
 * `emailTaken`, `invalidOtp` — are marked. The rest need adding to
 * `frontend/messages/{en,bn,ar}.json` at cutover; see the E2 write-up.
 */
export const AuthError = {
  /** Ships in Phase C. Also the answer for "no such account" — see below. */
  invalidCredentials: 'errors.invalidCredentials',
  /** Ships in Phase C. */
  emailTaken: 'errors.emailTaken',
  /** Ships in Phase C. */
  invalidOtp: 'errors.invalidOtp',

  phoneTaken: 'errors.phoneTaken',
  /** Carries `unlockInSeconds` so the UI can count down instead of guessing. */
  accountLocked: 'errors.accountLocked',
  accountSuspended: 'errors.accountSuspended',
  accountNotFound: 'errors.accountNotFound',
  /** The code was right; the challenge had already expired. */
  otpExpired: 'errors.otpExpired',
  /** Too many wrong codes against one challenge. Request a new one. */
  otpAttemptsExhausted: 'errors.otpAttemptsExhausted',
  /** Asked for a new code too soon. Carries `retryAfterSeconds`. */
  otpTooSoon: 'errors.otpTooSoon',
  /** No live challenge for this destination and purpose. */
  otpNotRequested: 'errors.otpNotRequested',
  /** The account has no password — it was created through phone OTP. */
  noPassword: 'errors.noPassword',
  /** Reset link already used, expired, or superseded by a sign-in. */
  resetTokenInvalid: 'errors.resetTokenInvalid',
  /** `settings.errors.wrongPassword` — reused verbatim by `changePassword`. */
  wrongPassword: 'errors.wrongPassword',
  /** `settings.errors.samePassword`. */
  samePassword: 'errors.samePassword',
  sessionNotFound: 'errors.sessionNotFound',
  /** A refresh cookie that is absent, unknown, expired or revoked. */
  refreshInvalid: 'errors.refreshInvalid',
  /** A refresh token presented twice. The whole session is gone. */
  refreshReuse: 'errors.refreshReuse',
  /** Requesting a phone code without a phone number on the account. */
  phoneMissing: 'errors.phoneMissing',
} as const;

export type AuthErrorKey = (typeof AuthError)[keyof typeof AuthError];

/**
 * Sign-in failures collapse to one key on purpose.
 *
 * "No account with that email" and "wrong password for that email" are different
 * facts, and telling them apart is an account-enumeration oracle: it turns a leaked
 * address list into a *verified* address list. So both answer
 * `errors.invalidCredentials`, and the timing is equalised too — a miss still pays
 * for one Argon2 verification against a dummy hash (D6 §Sign-in methods).
 *
 * `accountLocked` is the one exception, and it is a considered one: it only ever
 * follows five correct-format attempts, by which point the attacker already knows
 * the address is worth attacking, and withholding it would leave a real user
 * staring at "wrong password" for a password they typed correctly.
 */
export const ENUMERATION_SAFE_LOGIN_ERROR = AuthError.invalidCredentials;
