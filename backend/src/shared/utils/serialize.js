/**
 * serialize.js — the API boundary, where database types become JSON types.
 *
 * Two conversions, both forced by decisions taken elsewhere:
 *
 *  - **`Decimal` → `number`.** Money is `Decimal(14,2)` in the schema and a plain
 *    `number` in `frontend/types/*`. `main.prisma` §5 is explicit that the
 *    conversion happens *at the boundary and nowhere else*: arithmetic stays in
 *    `Decimal`, and a `Number(...)` earlier in the call path is the rounding bug
 *    that convention exists to prevent. `decimal.js`'s own `toJSON` returns a
 *    *string*, which would quietly change every money field's type on the wire,
 *    so leaving it to `JSON.stringify` is not an option.
 *  - **`BigInt` → `number`.** `JSON.stringify` throws on a BigInt rather than
 *    choosing for us. Counts and ids that exceed 2^53 would lose precision as
 *    numbers, so those become strings and everything else becomes a number.
 *
 * Enum translation is *not* here — it needs to know which field is which enum,
 * so it lives in `enums.js` and runs before this.
 */
import { Prisma } from "@foodora/database";

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && (value.constructor === Object || Object.getPrototypeOf(value) === null);

/**
 * Recursively convert database values to JSON-safe ones.
 *
 * Dates are left alone: `JSON.stringify` renders them as ISO-8601, which is what
 * `types/common.ts::BaseEntity` expects, and converting them here would mean
 * doing it twice.
 */
export function toJsonSafe(value) {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = toJsonSafe(item);
    return out;
  }
  return value;
}

/**
 * `Decimal` from a number or string, for the write path.
 *
 * Takes a string where it can: `new Decimal(0.1 + 0.2)` inherits the float error
 * it was reached with, and money arriving from JSON has already been through a
 * float once. That is unavoidable at the boundary; compounding it is not.
 */
export function toDecimal(value) {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(typeof value === "number" ? value.toString() : value);
}
