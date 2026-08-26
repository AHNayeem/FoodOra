import type { CartLineRecord, CartOwner, CartVendorRecord } from '../models';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

/** A cart as stored: the vendor id, the lines, and nothing derived. */
export interface CartState {
  id: string;
  vendorId: string;
  lines: CartLineRecord[];
  updatedAt: Date;
}

/**
 * Storage for the cart.
 *
 * Two shapes in this port are not obvious, and both come from the schema rather than from
 * preference:
 *
 * **`findLive` returns the owner's single active cart, not a list.** `carts` is keyed
 * `@@unique([userId, vendorId])`, so the *table* permits one basket per vendor per user —
 * a reasonable design for a marketplace that lets you shop three restaurants at once.
 * The frontend is not that marketplace: `stores/cart.ts` holds one `vendor` and prompts
 * "start a new cart?" when you add from another. Rather than build a server capability the
 * client cannot express, this port enforces the client's rule — one live cart — and leaves
 * the schema free for the day the product changes its mind.
 *
 * **Lines are hard-deleted; carts are soft-deleted.** `cart_items` has no `deletedAt`
 * column and `carts` does, which is the schema saying that removing an item is not an
 * event anyone will ever need to reconstruct, while a discarded basket is. The soft delete
 * has a consequence the implementation has to handle: a tombstoned cart still occupies its
 * `(userId, vendorId)` slot, so returning to a vendor must *revive* that row rather than
 * insert a second one.
 */
export interface CartRepositoryPort {
  /** The owner's one active cart, or null. */
  findLive(owner: CartOwner): Promise<CartState | null>;

  /**
   * The cart for this owner and vendor, creating or reviving it as required, and
   * discarding any live cart for a different vendor.
   *
   * One method rather than four because the four are never useful apart: every one of
   * them is a step in "make this the basket", and splitting them would let a caller
   * revive a cart without discarding the old one — which is two live carts, the state
   * this port exists to prevent.
   */
  openCart(owner: CartOwner, vendorId: string, currency: string): Promise<CartState>;

  /**
   * Adds `quantity` to the line if it exists, inserts it otherwise.
   *
   * The increment happens in SQL rather than by reading and writing back, because two
   * taps on "add" in quick succession are two concurrent requests and read-modify-write
   * loses one of them.
   */
  addQuantity(cartId: string, line: CartLineRecord): Promise<void>;

  setQuantity(cartId: string, lineId: string, quantity: number): Promise<boolean>;
  removeLine(cartId: string, lineId: string): Promise<boolean>;
  /** Empties the cart and tombstones it — "no cart", which is what the store shows. */
  clear(cartId: string): Promise<void>;

  /** The vendor snapshot fields the cart carries. Read through `CatalogReaderPort`. */
  loadVendorSnapshot(vendorId: string): Promise<CartVendorRecord | null>;
}
