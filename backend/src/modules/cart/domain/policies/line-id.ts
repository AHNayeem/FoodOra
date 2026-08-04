/**
 * The composite cart-line id — and the difference between the one on the wire and the one
 * in the primary key.
 *
 * ## Why the id is derived rather than minted
 *
 * A cart line is not an entity with a lifetime; it is a *configuration*. Adding a large
 * Margherita twice has to produce one line of quantity two, not two lines of quantity one,
 * and the cheapest way to guarantee that is to make the identity of a line be the thing
 * that defines it: the dish plus the exact set of options chosen. Then "merge if it already
 * exists" is a primary-key upsert, and the merge cannot be forgotten.
 *
 * ## Why the algorithm must not change
 *
 * `frontend/lib/cart.ts::makeLineId` is this function, and has been since Phase C:
 *
 * ```ts
 * return [foodId, ...[...optionIds].sort()].join("|");
 * ```
 *
 * Both sides compute it independently — the client so its optimistic update merges into the
 * right line, the server because it will not accept an id from a client. If the two
 * implementations disagree by one character, both sides still "work": the local cart shows
 * one line of two and the server holds two lines of one, and nobody notices until the
 * totals differ at checkout. So this is a *shared* algorithm with two copies, and the sort
 * is the load-bearing part — the same options chosen in a different order are the same line.
 *
 * ## Why storage prefixes it with the cart id
 *
 * Because `cart_items.id` is a **global** primary key and the composite line id is only
 * unique *within* a basket. Two customers who both order a large Margherita compute the
 * same `food_pizza-margherita|marg_large`, so an upsert keyed on that id alone finds the
 * *other person's* row and increments it: one basket silently grows, the other stays empty.
 * `verify:cart:live` caught precisely this, and no in-memory fake could have — a `Map` per
 * owner has the scoping the database does not.
 *
 * So the stored key is `<cartId>#<lineId>` while the wire keeps the bare line id, which is
 * what `types/cart.ts::CartLine.id` has always been.
 *
 * ## TEMPORARY — scheduled for replacement
 *
 * **The prefix is a workaround for a schema defect, not the intended design.** It is
 * correct and it is verified, but it pays for a wrong primary key with a string
 * convention, and a string convention is only as good as every future writer's memory
 * of it. Three things it costs, in order of how much they will hurt:
 *
 * 1. **The database does not enforce the scoping** — only this module does. A raw SQL
 *    fix-up, a bulk import or a second service writing `cart_items` reintroduces the
 *    collision with no constraint to stop it.
 * 2. **The column budget is spent on the key.** 120 characters minus a 40-character
 *    cart id and a separator leaves ~79 for the configuration, so `lineIdFits` can
 *    refuse a basket that the intended schema would accept.
 * 3. **Two representations of one id** must be converted at every boundary
 *    (`storedLineId` in, `toWireLineId` out). Forget one and the symptom is a line that
 *    cannot be updated or removed, because the key does not match anything.
 *
 * The replacement is a composite `@@id([cartId, id])` on `cart_items`, with
 * `cart_item_options` carrying `cartId` so its foreign key can follow. It is a migration
 * with a data backfill, it must land while these tables are already being changed, and
 * it is registered — with the SQL, the code that changes, and the trigger condition — in
 * `docs/backend/deferred-schema-changes.md` (DSC-1). Do not delete this note without
 * closing that entry.
 */

/** The width of `cart_items.id`. */
export const MAX_LINE_ID_LENGTH = 120;

/** `#` cannot appear in an id, so the split is unambiguous. */
const SEPARATOR = '#';

export function makeLineId(foodId: string, optionIds: readonly string[]): string {
  return [foodId, ...[...optionIds].sort()].join('|');
}

/** The primary key: scoped to the cart, so two baskets cannot collide. */
export function storedLineId(cartId: string, lineId: string): string {
  return `${cartId}${SEPARATOR}${lineId}`;
}

/** Back to what the frontend calls a line id. */
export function toWireLineId(cartId: string, storedId: string): string {
  const prefix = `${cartId}${SEPARATOR}`;
  return storedId.startsWith(prefix) ? storedId.slice(prefix.length) : storedId;
}

/**
 * Whether the *stored* key fits the column.
 *
 * Checked rather than truncated: truncating two long configurations to the same 120
 * characters would merge two different dinners into one line, which is worse than the
 * refusal it would be hiding. The budget is the column minus the cart id and the
 * separator — roughly ninety characters, which is a dish plus a generous handful of
 * add-ons, and the refusal names the cause when it is not enough.
 */
export function lineIdFits(cartId: string, lineId: string): boolean {
  return storedLineId(cartId, lineId).length <= MAX_LINE_ID_LENGTH;
}
