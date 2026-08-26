/**
 * The cart read models.
 *
 * Every one of these is `frontend/types/cart.ts` translated field for field, for the
 * same reason the catalog's models were: Unit 2's governing constraint is that
 * `stores/cart.ts` gains a server mirror and `types/cart.ts` does not change a
 * character. A field renamed here is a component change there.
 *
 * The one addition is `CartRecord` itself. The frontend has no `Cart` type — its cart is
 * two fields on a Zustand store, `{ vendor, lines }` — so this is the shape that store
 * projects onto, plus the three totals `lib/cart.ts` already derives. They are returned
 * rather than left to the client because a server that will not say what it thinks the
 * basket costs cannot be checked against the client that does, and "the totals matched"
 * is the only cheap proof that the two pricing implementations agree.
 */

/** `CartVendor` — the snapshot captured when the first item is added. */
export interface CartVendorRecord {
  id: string;
  slug: string;
  name: string;
  currency: string;
  countryCode: string;
  deliveryFee: number;
  minOrder: number;
  freeDeliveryOver: number | null;
}

/** `CartSelectedOption`. */
export interface CartOptionRecord {
  groupId: string;
  optionId: string;
  name: string;
  priceDelta: number;
}

/** `CartLine`. */
export interface CartLineRecord {
  /** The composite line id — see `policies/line-id.ts`. */
  id: string;
  foodId: string;
  name: string;
  image: string;
  basePrice: number;
  /** `basePrice` + Σ option deltas, computed here and never accepted from a client. */
  unitPrice: number;
  quantity: number;
  options: CartOptionRecord[];
}

export interface CartRecord {
  id: string;
  vendor: CartVendorRecord;
  lines: CartLineRecord[];
  /** Σ `unitPrice × quantity`. */
  subtotal: number;
  /** The vendor's fee after its free-delivery threshold. Not a checkout total. */
  deliveryFee: number;
  /** Total units across all lines — what the header badge shows. */
  count: number;
  updatedAt: Date;
}

/**
 * Who the cart belongs to.
 *
 * A union rather than two nullable fields, because "both" and "neither" are not states
 * the cart has. `guestKey` is an opaque high-entropy string the browser generates and
 * keeps beside the persisted cart; it is what lets an anonymous visitor's basket reach
 * the server at all, and therefore what keeps the cart slice independent of the auth
 * slice — the two flags are separate on purpose (`config/backend.ts`).
 *
 * The trust model is worth stating plainly: possession of the key *is* the claim to the
 * cart, exactly as with any anonymous session cookie. That is acceptable for a basket
 * and would not be for an order, which is why `Order.userId` is not nullable in the same
 * way and why checkout will require a real actor.
 */
export type CartOwner = { userId: string; guestKey?: string } | { userId?: undefined; guestKey: string };

/** What the client may say about a line. Prices are conspicuously absent. */
export interface CartLineRequest {
  foodId: string;
  /** Chosen variant and add-on ids, in any order. */
  optionIds: string[];
  quantity: number;
}
