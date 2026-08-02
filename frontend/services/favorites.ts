import type { FoodItem, Vendor } from "@/frontend/types";
import { foodById, vendorById } from "@/frontend/lib/mock";
import { mockDelay } from "./http";

/**
 * favorites.ts — resolves the customer's saved ids into displayable entities
 * (Phase C23). The client stores ids only; this is the join.
 *
 * Ids that no longer resolve — a delisted vendor, a dish pulled from a menu —
 * are dropped rather than rendered as holes, and counted in `stale` so the UI
 * can explain the difference between "you saved 6" and "5 are still available".
 * A real endpoint would do the same with a LEFT JOIN and a soft-delete filter.
 */

/** What the client holds: saved ids, newest first. */
export interface FavoriteIds {
  vendorIds: string[];
  foodIds: string[];
}

/** A saved dish always travels with the vendor that cooks it. */
export interface FavoriteDish {
  food: FoodItem;
  vendor: Vendor;
}

export interface FavoritesBoard {
  vendors: Vendor[];
  dishes: FavoriteDish[];
  /** Saved ids that no longer resolve to a live entity. */
  stale: number;
}

function liveVendor(id: string | undefined): Vendor | null {
  if (!id) return null;
  const vendor = vendorById.get(id);
  return vendor && !vendor.deletedAt ? vendor : null;
}

export async function getFavorites({
  vendorIds,
  foodIds,
}: FavoriteIds): Promise<FavoritesBoard> {
  const vendors = vendorIds
    .map((id) => liveVendor(id))
    .filter((v): v is Vendor => v !== null);

  const dishes = foodIds
    .map((id) => {
      const food = foodById.get(id);
      if (!food || food.deletedAt) return null;
      // A dish without its vendor is unusable — no price context, nowhere to
      // order it from — so treat the pair as the unit of resolution.
      const vendor = liveVendor(food.vendorId);
      return vendor ? { food, vendor } : null;
    })
    .filter((d): d is FavoriteDish => d !== null);

  const stale = vendorIds.length - vendors.length + (foodIds.length - dishes.length);

  return mockDelay({ vendors, dishes, stale }, 200);
}
