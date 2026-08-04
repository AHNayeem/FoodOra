import type { CartOwner, CartVendorRecord } from '../models';
import type { CartState } from './cart.repository.port';

export const CART_CHECKOUT = Symbol('CART_CHECKOUT');

/**
 * What checkout is allowed to do to a basket: read it, price its vendor, consume it.
 *
 * The same narrowing the catalog published as `CATALOG_READER` in Unit 2, and for the
 * same reason. Checkout genuinely needs cart data — it cannot price an order without
 * the lines — and the two dishonest ways to get it are for the orders module to query
 * `cart_items` itself (two owners for one table, and the day the cart's line-id
 * encoding changes the orders module silently breaks) or to import `CartService`
 * (which the dependency rule forbids: a module may reach another module's `domain/`
 * and nothing else).
 *
 * So the cart publishes an interface it is prepared to keep. Three methods, no writes
 * beyond `clear`, and deliberately no `addItem`: checkout consumes a basket, it does
 * not build one.
 *
 * `clear` is here because placing an order and emptying the basket are one act. If the
 * order were written and the cart survived, the customer would return to the same
 * basket they had just paid for and quite reasonably order it again — so the two writes
 * belong in one transaction, and that means checkout has to be able to make the second
 * one.
 */
export interface CartCheckoutPort {
  /** The owner's one live basket, or null. */
  findLive(owner: CartOwner): Promise<CartState | null>;

  /**
   * Move a guest's basket onto an account, and return the account's basket.
   *
   * This is the `mergeGuestCart` Unit 2 recorded as a known gap and said belonged with
   * checkout. It belongs here because checkout is the moment identity first exists: the
   * customer filled a basket anonymously, signed in to pay, and their `guestKey` cart
   * would otherwise be invisible to an operation that requires an account — an empty
   * basket at the exact moment they tried to buy it.
   *
   * The policy on a collision is that **the account's own basket wins**. If the signed-in
   * customer already has a live cart, the guest one is left where it is, untouched. The
   * alternative is the vendor-conflict prompt with nobody in front of it to answer: two
   * baskets from two restaurants cannot merge, and silently discarding the identified
   * customer's in favour of a browser key's would be the wrong one to lose.
   *
   * Returns null when neither exists.
   */
  adoptGuestCart(userId: string, guestKey: string): Promise<CartState | null>;

  /** The vendor snapshot — the fee, the minimum and the free-delivery threshold. */
  loadVendorSnapshot(vendorId: string): Promise<CartVendorRecord | null>;

  /** Empty the basket and tombstone it. Called in the same transaction as the order. */
  clear(cartId: string): Promise<void>;
}
