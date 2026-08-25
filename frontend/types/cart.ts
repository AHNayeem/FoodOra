/**
 * cart.ts — client-side cart shapes.
 *
 * The cart lives in a Zustand store (not the mock seed) because it is per-user
 * session state. The shapes still mirror the eventual `Cart` / `CartItem`
 * Prisma models so Phase E can persist them server-side with no redesign.
 */

/** Vendor snapshot captured when the first item is added (a cart is single-vendor). */
export interface CartVendor {
  id: string;
  slug: string;
  name: string;
  currency: string;
  /** Country of the vendor — drives the tax rate at checkout. */
  countryCode?: string;
  /**
   * Where the restaurant is (Phase 17, G37) — what a delivery-zone check needs.
   *
   * Optional because a basket or an order persisted before this phase does not
   * carry it, and the honest answer for one of those is "cannot be checked"
   * rather than a guess: `lib/serviceability` returns `unknown` and no surface
   * blocks on it. `place` is the address label the zone match is made against,
   * not a tidy area name — a zone knows "Gulshan 1" and an address says "Gulshan
   * Ave, Gulshan 1", and matching the whole label is what makes both work.
   */
  location?: { lat: number; lng: number; place: string };
  deliveryFee: number;
  minOrder: number;
  freeDeliveryOver: number | null;
}

/** A chosen option within a line, snapshotted so the cart is self-contained. */
export interface CartSelectedOption {
  groupId: string;
  optionId: string;
  name: string;
  priceDelta: number;
}

export interface CartLine {
  /** Composite id: food id + sorted option ids, so identical configs merge. */
  id: string;
  foodId: string;
  name: string;
  image: string;
  basePrice: number;
  /** basePrice + sum of option deltas. */
  unitPrice: number;
  quantity: number;
  options: CartSelectedOption[];
}
