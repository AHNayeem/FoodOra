import type {
  CartLine,
  CartSelectedOption,
  CartVendor,
  FoodItem,
} from "@/types";

/**
 * cart.ts — pure cart math, kept out of the store so it is trivially testable
 * and reused by the drawer, checkout (C8) and any future server recompute.
 */

/**
 * Narrow a full {@link Vendor} to the snapshot the cart persists. Keeping this
 * in one place means every surface that can add to the cart (menu, search
 * results, offers) writes an identical vendor shape.
 */
export function toCartVendor(vendor: {
  id: string;
  slug: string;
  name: string;
  currency: string;
  location: { countryCode: string };
  deliveryFee: number;
  minOrder: number;
  freeDeliveryOver: number | null;
}): CartVendor {
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };
}

/** Stable line id: identical food + option selections collapse into one line. */
export function makeLineId(foodId: string, optionIds: string[]): string {
  return [foodId, ...[...optionIds].sort()].join("|");
}

/** Unit price = base price plus every selected option's delta. */
export function lineUnitPrice(
  basePrice: number,
  options: CartSelectedOption[],
): number {
  return basePrice + options.reduce((sum, o) => sum + o.priceDelta, 0);
}

/** Build a cart line from a food item and the chosen options. */
export function buildCartLine(
  item: FoodItem,
  options: CartSelectedOption[],
  quantity: number,
): CartLine {
  return {
    id: makeLineId(item.id, options.map((o) => o.optionId)),
    foodId: item.id,
    name: item.name,
    image: item.image,
    basePrice: item.price,
    unitPrice: lineUnitPrice(item.price, options),
    quantity,
    options,
  };
}

/** Total number of units across all lines (drives the header badge). */
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** Sum of line totals before delivery. */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

/** Delivery fee after applying the vendor's free-delivery threshold. */
export function deliveryFeeFor(vendor: CartVendor, subtotal: number): number {
  if (vendor.freeDeliveryOver != null && subtotal >= vendor.freeDeliveryOver) {
    return 0;
  }
  return vendor.deliveryFee;
}

/** Amount still needed to unlock free delivery, or 0 if unlocked/unavailable. */
export function amountToFreeDelivery(vendor: CartVendor, subtotal: number): number {
  if (vendor.freeDeliveryOver == null) return 0;
  return Math.max(0, vendor.freeDeliveryOver - subtotal);
}

/** Amount still needed to meet the minimum order, or 0 if met. */
export function amountToMinOrder(vendor: CartVendor, subtotal: number): number {
  return Math.max(0, vendor.minOrder - subtotal);
}
