import type { DietaryTag, VendorSort, VendorType, Weekday } from '../../../shared/enums';

/**
 * The catalog read models — and the whole point of the module.
 *
 * Each one is `frontend/types/catalog.ts` translated into TypeScript the backend
 * can compile, field for field, in the same order. That is not tidiness: V1's
 * governing constraint is that `services/catalog.ts` swaps its *body* and keeps
 * its signature, so anything these types get wrong becomes a component change,
 * and a component change is the one cost the whole exercise exists to avoid.
 *
 * Two fields are computed rather than stored, and `catalog.prisma` says so in its
 * header: `distanceKm` needs an origin the database does not have, and `isOpen`
 * needs the branch's own clock. Both are produced by `domain/policies/`.
 */

/** `Vendor`/`Cuisine`/… all extend `BaseEntity` — this is it. */
export interface CatalogEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CuisineRecord extends CatalogEntity {
  slug: string;
  name: string;
  emoji: string;
  image: string;
}

export interface CategoryRecord extends CatalogEntity {
  slug: string;
  name: string;
  emoji: string;
  image: string;
  sort: number;
  /** Projected from `category_keywords`, heaviest first — the frontend reads a flat array. */
  keywords: string[];
}

/** One opening window. Null/null is "closed that day", matching `DayHours`. */
export interface DayHoursRecord {
  open: string | null;
  close: string | null;
}

/** `WeeklyHours = Record<Weekday, DayHours>`, as seven named fields. */
export type WeeklyHoursRecord = Record<Weekday, DayHoursRecord>;

export interface GeoPointRecord {
  lat: number;
  lng: number;
  address: string;
  city: string;
  countryCode: string;
}

/**
 * The flat storefront the frontend renders — a `Vendor` row joined to its primary
 * `VendorBranch`.
 *
 * `catalog.prisma` split brand from location so a multi-branch merchant needs no
 * second migration; this is the other half of that bargain, where the pair is
 * folded back into the single object Phase C already renders.
 */
export interface VendorRecord extends CatalogEntity {
  slug: string;
  type: VendorType;
  ownerId: string | null;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  cover: string;
  cuisineIds: string[];
  dietary: DietaryTag[];
  priceLevel: number;
  rating: number;
  reviewCount: number;
  location: GeoPointRecord;
  /** Straight-line km from the query's origin. 0 when no origin was given. */
  distanceKm: number;
  etaMinutes: [number, number];
  deliveryFee: number;
  minOrder: number;
  freeDeliveryOver: number | null;
  hours: WeeklyHoursRecord;
  isOpen: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  promoLabel: string | null;
  currency: string;
}

export interface MenuSectionRecord extends CatalogEntity {
  vendorId: string;
  name: string;
  sort: number;
}

export interface FoodOptionRecord {
  id: string;
  name: string;
  priceDelta: number;
}

/** A variant group (`Size`) or an add-on group (`Add-ons`) — the shape is the same. */
export interface FoodOptionGroupRecord {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: FoodOptionRecord[];
}

export interface FoodItemRecord extends CatalogEntity {
  slug: string;
  vendorId: string;
  sectionId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  dietary: DietaryTag[];
  spicyLevel: number;
  calories: number | null;
  rating: number;
  reviewCount: number;
  isPopular: boolean;
  isAvailable: boolean;
  optionGroups: FoodOptionGroupRecord[];
}

/** `services/catalog.ts::MenuSectionWithItems`. */
export interface MenuSectionWithItemsRecord extends MenuSectionRecord {
  items: FoodItemRecord[];
}

/** Where "how far away" is measured from. */
export interface GeoOrigin {
  lat: number;
  lng: number;
}

/**
 * `frontend/services/catalog.ts::VendorQuery`, plus the `origin` the frontend
 * passes as a constant and a real user will eventually pass from their device.
 */
export interface VendorQuery {
  type?: VendorType;
  cuisineId?: string;
  search?: string;
  openNow?: boolean;
  sort?: VendorSort;
  origin?: GeoOrigin;
}
