import type { CartLineRecord, CartOptionRecord, CartVendorRecord } from '../models';

/**
 * Cart arithmetic — the server's copy of `frontend/lib/cart.ts`.
 *
 * ## Why the server computes this at all
 *
 * Because the client's numbers cannot be trusted, and not for the usual paranoid reason.
 * The realistic failure is not a hostile customer editing a price in a request; it is a
 * menu that changed between the page render and the click. Phase C built the line from
 * the `FoodItem` the page was rendered with, which is correct right up until a merchant
 * repriced a dish two minutes ago — at which point the basket holds yesterday's price and
 * nothing in the system disagrees with it. Rebuilding the line from the stored row makes
 * that impossible, and makes the *snapshot* meaningful: `cart_items.basePrice` is the
 * price as it really was when the item went in, which is what a later dispute is about.
 *
 * ## Why money is a JS number here
 *
 * `Decimal(14,2)` in Postgres, `Decimal` in the Prisma client, `number` in these records —
 * the conversion happens in the repository. That is a deliberate narrowing rather than an
 * oversight: `frontend/types/cart.ts` types every money field as `number`, so the wire
 * form is a double whatever this layer does, and a `Decimal` that the GraphQL layer would
 * serialise to a double anyway buys nothing but the illusion of exactness. What it does
 * cost is a rounding discipline, so every computed money value here goes through
 * `money()`. Sub-cent drift from summing doubles is real (`0.1 + 0.2`), it just cannot
 * survive a round to two places at each step.
 *
 * When the ledger arrives — where a fraction of a poisha genuinely matters and the sum has
 * to reconcile against a payment provider's — that arithmetic belongs in `Decimal`, in the
 * payments module, on integer minor units. A cart total is not a ledger entry.
 */

/** Two decimal places, which is every currency this platform serves. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Unit price = base price plus every selected option's delta. */
export function lineUnitPrice(basePrice: number, options: readonly CartOptionRecord[]): number {
  return money(options.reduce((sum, option) => sum + option.priceDelta, basePrice));
}

/** Sum of line totals, before delivery. */
export function cartSubtotal(lines: readonly CartLineRecord[]): number {
  return money(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
}

/** Total units across all lines — the header badge. */
export function cartCount(lines: readonly CartLineRecord[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

/**
 * Delivery fee after the vendor's free-delivery threshold.
 *
 * `>=` not `>`: "free delivery over ৳800" has meant "at ৳800" since Phase C, and a
 * customer who hits the threshold exactly and is charged anyway files a support ticket.
 */
export function deliveryFeeFor(vendor: CartVendorRecord, subtotal: number): number {
  if (vendor.freeDeliveryOver !== null && subtotal >= vendor.freeDeliveryOver) return 0;
  return money(vendor.deliveryFee);
}
