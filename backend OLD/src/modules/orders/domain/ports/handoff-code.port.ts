export const HANDOFF_CODE = Symbol('HANDOFF_CODE');

/**
 * The delivery hand-off code: issued at placement, shown to the customer, quoted by the
 * rider at the door.
 *
 * ## Why this is a port and not two lines of `node:crypto`
 *
 * Because `domain/` may not import a native module and still be `domain/` — the same
 * reason `PasswordHasherPort` exists — and because a test of the placement path should
 * not have to guess what four digits were generated.
 *
 * ## Why it is not the auth module's OTP
 *
 * They look identical and are not the same thing. An auth OTP proves *who you are*: it is
 * peppered, single-use, rate-limited, and lives for ten minutes. This proves *that the
 * right food reached the right door*: it lives as long as the delivery, it is quoted
 * aloud on a doorstep, and the threat model is a courier marking an order delivered
 * without handing it over — not an attacker guessing their way into an account. Reusing
 * `SECRET_GENERATOR` would have coupled the orders module to the auth module for a
 * primitive, and would have implied a shared policy the two do not share.
 *
 * ## What is stored where
 *
 * The plaintext is returned once, in the placement response, and cached in Redis for
 * `CHECKOUT_OTP_TTL_HOURS`. Postgres gets `sha256` and nothing else — the standing rule
 * from Unit 0, applied here: a stolen `orders` table must not be a list of live codes.
 * `frontend/lib/delivery.ts::otpFor` derived the code from the order id, which meant
 * anyone who knew an order number knew its code; that file predicted its own replacement.
 */
export interface HandoffCodePort {
  /** A zero-padded numeric code — `"0482"`, never `"482"`. */
  issue(digits: number): string;

  /** SHA-256, hex. What goes in `orders.otpHash`. */
  hash(code: string): string;

  /** Constant-time comparison, for the rider's verify call in a later unit. */
  matches(a: string, b: string): boolean;
}
