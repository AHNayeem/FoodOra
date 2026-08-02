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
