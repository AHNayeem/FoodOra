import type {
  BaseEntity,
  DietaryTag,
  GeoPoint,
  VendorType,
  WeeklyHours,
} from "./common";

/**
 * catalog.ts — the discoverable food catalog: cuisines, categories, vendors
 * (restaurants/cafes/chefs), menus and food items. IDs are stable and every
 * cross-reference (vendor.cuisineIds, foodItem.vendorId, …) resolves against
 * another seed, exactly as foreign keys would.
 */

export interface Cuisine extends BaseEntity {
  slug: string;
  name: string;
  emoji: string;
  image: string;
}

/** Browse category shown on the home grid ("Pizza", "Burgers", …). */
export interface Category extends BaseEntity {
  slug: string;
  name: string;
  emoji: string;
  image: string;
  /** Ordering weight for the home category rail. */
  sort: number;
}

export interface Vendor extends BaseEntity {
  slug: string;
  type: VendorType;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  cover: string;
  cuisineIds: string[];
  dietary: DietaryTag[];
  priceLevel: 1 | 2 | 3 | 4; // $ – $$$$
  rating: number; // 0–5
  reviewCount: number;
  location: GeoPoint;
  /** Straight-line distance from the current mock user, km. */
  distanceKm: number;
  /** Delivery time estimate window, minutes. */
  etaMinutes: [number, number];
  deliveryFee: number; // in vendor currency
  minOrder: number;
  freeDeliveryOver: number | null;
  hours: WeeklyHours;
  isOpen: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  /** Optional active promo headline, e.g. "20% off over ৳500". */
  promoLabel: string | null;
  currency: string;
}

/** A section within a vendor's menu ("Starters", "Mains"). */
export interface MenuSection extends BaseEntity {
  vendorId: string;
  name: string;
  sort: number;
}

export interface FoodItem extends BaseEntity {
  slug: string;
  vendorId: string;
  sectionId: string;
  name: string;
  description: string;
  image: string;
  price: number; // in vendor currency
  /** Original price when discounted (for strike-through). */
  compareAtPrice: number | null;
  dietary: DietaryTag[];
  spicyLevel: 0 | 1 | 2 | 3;
  calories: number | null;
  rating: number;
  reviewCount: number;
  isPopular: boolean;
  isAvailable: boolean;
  /** Configurable option groups (size, add-ons) — shape only for the prototype. */
  optionGroups: FoodOptionGroup[];
}

export interface FoodOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: FoodOption[];
}

export interface FoodOption {
  id: string;
  name: string;
  priceDelta: number;
}
