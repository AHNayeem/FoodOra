/**
 * The human-facing order reference — `FO-000123`.
 *
 * ## Why a sequence and not a timestamp
 *
 * `frontend/services/orders.ts` derives it from `Date.now()` in base 36, which is fine for
 * a prototype with one browser and no database. It has two problems the moment orders are
 * real: two customers ordering in the same millisecond get the same reference, and
 * `orders.orderNumber` is `@unique`, so the second one fails an insert for a reason that
 * has nothing to do with anything the customer did.
 *
 * `number_sequences` exists for exactly this: one row, `UPDATE … SET current = current + 1
 * RETURNING current` in the same transaction as the order. Postgres serialises the row
 * lock, so concurrency is the database's problem rather than a retry loop's.
 *
 * ## Why it is not a bare counter
 *
 * `FO-` because a customer reads this over the phone to a restaurant, and a bare number is
 * ambiguous with the table number, the phone extension and the price. Six digits,
 * zero-padded, because a reference of a stable width is easier to read back and to search
 * for; the padding stops at a million orders and simply grows after that rather than
 * wrapping or truncating.
 *
 * Base 36 was considered — it keeps the reference short — and rejected: `FO-8F3A21`
 * contains characters a customer will mishear (`8`/`B`, `A`/`8`) and the prototype's own
 * `otpFor` avoids exactly that problem for the hand-off code. Digits only, for a value
 * that gets spoken.
 */

/** The `number_sequences.scope` row orders draw from. */
export const ORDER_NUMBER_SCOPE = 'order';

const PREFIX = 'FO-';
const MIN_DIGITS = 6;

export function formatOrderNumber(sequence: bigint | number): string {
  return `${PREFIX}${sequence.toString().padStart(MIN_DIGITS, '0')}`;
}
