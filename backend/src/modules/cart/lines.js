/**
 * lines.js — cart-line identity and cart arithmetic, with nothing underneath.
 *
 * Module 6's counterpart to module 5's `availability.js` and `options.js`: the
 * decisions that need no database and no clock, so that `tests/cart-lines.test.js`
 * can state them as facts about functions. `service.js` owns everything that has
 * to read a row.
 *
 * ## The line id is the whole design
 *
 * `orders.prisma` states it on the column and `types/cart.ts::CartLine.id` is the
 * same value on the wire:
 *
 *     the composite cart-line id: food id + sorted option ids
 *
 * Two consequences, and both are the reason it is *composite* rather than minted:
 *
 *  - **identical configurations merge.** A second "large Margherita, extra basil"
 *    computes the same id and increments the line that is already there. That is
 *    `stores/cart.ts::mergeLine` on the client and an upsert on the server, and
 *    the two agree because they compute the same string;
 *  - **different configurations do not.** Burger + cheese and burger without are
 *    different ids and therefore different lines, which is what §8 of the brief
 *    asks for and what a kitchen ticket needs.
 *
 * **Sorted, and de-duplicated, and never the client's array order.** The client
 * sends `["fop_cheese", "fop_bacon"]` or `["fop_bacon", "fop_cheese"]` depending
 * on which checkbox was clicked first, and those are the same burger. Sorting is
 * what makes the id a function of the *selection* rather than of the interaction
 * that produced it — `lib/cart.ts::makeLineId` sorts for exactly this reason, and
 * a line id that depended on click order would stack a customer's basket with
 * duplicates that a merge was supposed to prevent.
 *
 * ## Why there is an overflow form
 *
 * `cart_items.id` is `VARCHAR(120)`. A minted food id is 31 characters and a
 * minted option id is 30, so the natural form fits a dish plus **two** modifiers
 * and overflows on the third — and "burger, cheese, bacon, jalapeño" is an
 * ordinary order, not an edge case. The prototype never hit this because its
 * fixture ids are words (`food_pizza-margherita|marg_large`).
 *
 * So past the column's width the option list collapses into a SHA-256 digest of
 * the same sorted ids. It keeps every property the natural form has — the same
 * selection computes the same id, a different selection computes a different one
 * — and loses only human readability, which is not a property the database
 * depends on. The alternatives were worse: refusing a third topping is a product
 * regression, and digesting *always* would discard the documented contract and
 * the only form the client can compute for itself.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@foodora/database";

/** `cart_items.id` is `VARCHAR(120)`. Nothing here may produce a longer string. */
export const LINE_ID_MAX_LENGTH = 120;

/**
 * The separator, and the digest marker.
 *
 * `~` rather than `#`: a line id travels in a URL path (`DELETE /items/:lineId`),
 * and `#` starts a fragment that never reaches the server. `~` and `|` are both
 * safe once encoded, and `~` is unreserved even unencoded.
 */
const JOIN = "|";
const DIGEST_MARKER = "|~";

const ZERO = new Prisma.Decimal(0);

/** A `Decimal` from a row's Decimal, a JSON number or a string. `availability.js::dec`. */
export function dec(value) {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(typeof value === "number" ? value.toString() : String(value));
}

/** The chosen option ids, de-duplicated and sorted — the canonical selection. */
export function canonicalOptionIds(optionIds = []) {
  return [...new Set(optionIds.filter((id) => typeof id === "string" && id.length > 0))].sort();
}

/**
 * The line id for a dish and a selection.
 *
 * Deterministic in the strongest sense the brief asks for: a function of the food
 * id and the *set* of option ids, never of their order, never of a client-supplied
 * key, and never of anything else in the request.
 */
export function makeLineId(foodId, optionIds = []) {
  const sorted = canonicalOptionIds(optionIds);
  const natural = [foodId, ...sorted].join(JOIN);
  if (natural.length <= LINE_ID_MAX_LENGTH) return natural;

  const digest = createHash("sha256").update(sorted.join(JOIN)).digest("hex").slice(0, 32);
  return `${foodId}${DIGEST_MARKER}${digest}`;
}

/** True when this id took the digest branch — reported by validation, never stored. */
export const isDigestedLineId = (lineId) => String(lineId).includes(DIGEST_MARKER);

/**
 * A line's unit price: the dish's price plus every chosen option's delta.
 *
 * `lib/cart.ts::lineUnitPrice`, in `Decimal` rather than float. The frontend adds
 * `number`s and is right to — it renders a total nobody is charged. This number
 * is written to `cart_items.unitPrice` and read again at checkout, so `0.1 + 0.2`
 * has to be `0.3` here in a way it is not there.
 */
export function lineUnitPrice(basePrice, priceDeltas = []) {
  return priceDeltas.reduce((sum, delta) => sum.plus(dec(delta)), dec(basePrice));
}

/** One line's money: `unitPrice × quantity`. */
export const lineTotal = (unitPrice, quantity) => dec(unitPrice).times(quantity);

/**
 * What a basket costs before anything checkout decides.
 *
 * `subtotal` is `Σ unitPrice × quantity` and `count` is `Σ quantity`, which is
 * `lib/cart.ts::cartSubtotal` and `cartCount` exactly. **Nothing else** — no
 * delivery fee, no tax, no coupon, no tip and no total. Those are module 7's, and
 * `deliveryFeeFor` living in `lib/cart.ts` is not a licence to compute one here:
 * a fee this module returned would be a second pricing engine that checkout would
 * then have to agree with. See M6 §"What this module deliberately does not price".
 */
export function cartTotals(lines = []) {
  let subtotal = ZERO;
  let count = 0;
  for (const line of lines) {
    subtotal = subtotal.plus(lineTotal(line.unitPrice, line.quantity));
    count += line.quantity;
  }
  return { subtotal, count, lineCount: lines.length };
}

export default {
  LINE_ID_MAX_LENGTH,
  canonicalOptionIds,
  cartTotals,
  dec,
  isDigestedLineId,
  lineTotal,
  lineUnitPrice,
  makeLineId,
};
