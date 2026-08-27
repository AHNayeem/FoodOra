/**
 * tokens.js — the opaque credentials: refresh tokens, reset tokens, OTP codes.
 *
 * **The refresh token is not a JWT**, and that is a decision the schema makes for
 * us: `refresh_tokens.tokenHash` is `Char(64)`, a SHA-256 in hex, and the model's
 * comment says "only the SHA-256 of the token is stored". A JWT would be a
 * self-validating bearer credential whose database row was advisory; an opaque
 * random string is only ever as valid as the row it hashes to, which is what
 * makes revocation and reuse detection mean something.
 *
 * It also settles STEP 6's "a refresh token must not be accepted as a bearer
 * access token" by construction rather than by a check: `jwtVerify` cannot parse
 * 43 characters of base64url. `plugins/auth.js` keeps its `tokenType` guard
 * anyway — it costs nothing and it is the thing that would catch a future module
 * minting a refresh *JWT* with `signRefreshToken`.
 *
 * SHA-256 rather than Argon2 for these three: they are 256 bits of `randomBytes`
 * with no structure to guess, so a slow hash defends against nothing and would
 * put ~50ms of Argon2 on the refresh path of every page load. The *password* is
 * a human's choice and gets Argon2id (`password.js`); these are not.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 256 bits, base64url — 43 characters, no padding, URL- and cookie-safe. */
export function mintToken() {
  return randomBytes(32).toString("base64url");
}

/** The 64 hex characters `Char(64)` is sized for. */
export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/**
 * A numeric one-time code.
 *
 * `randomInt` and not `Math.random()`: this is a credential, and the six digits
 * of a `Math.random()` code are predictable from a handful of observations.
 * Leading zeros are kept — "042915" is a valid code and dropping to "42915"
 * would quietly shrink the space by a tenth.
 */
export function mintOtpCode(digits = 6) {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

/**
 * Compare two hex digests without leaking where they first differ.
 *
 * The lookups in `repository.js` are by `tokenHash` and never reach here, but the
 * OTP check compares a computed digest against a stored one in application code,
 * and a `===` on that is a (small, real) timing oracle on the code.
 */
export function digestsEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
