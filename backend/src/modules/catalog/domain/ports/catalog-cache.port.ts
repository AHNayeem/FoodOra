import type {
  CategoryRecord,
  CuisineRecord,
  FoodItemRecord,
  MenuSectionWithItemsRecord,
} from '../models';

export const CATALOG_CACHE = Symbol('CATALOG_CACHE');

/**
 * What the catalog caches, and — more usefully — what it refuses to.
 *
 * The rule this port encodes is that **a read is cacheable when its response is a
 * function of stored rows alone**. Two of the catalog's reads are not, and the
 * distinction is not a matter of degree:
 *
 * ### Cached
 *
 * - **The browse rails** (`catalog:rails`). Cuisines and categories: a few kilobytes,
 *   read on every home-page and search render, changed when an operator edits a tile.
 *   One entry rather than one per lookup, so it cannot go half-updated.
 * - **A vendor's menu** (`catalog:menu:<vendorId>`). The single most expensive query in
 *   the module — a four-level join across sections, dishes, option groups and options —
 *   run on every restaurant page view and every QR scan, against data a merchant edits
 *   a few times a week. Nothing in it is derived: a dish's price, description and option
 *   groups are stored facts. This is the entry that earns the most.
 * - **A dish by slug** (`catalog:food:<slug>`). Same shape, same argument, smaller.
 *
 * ### Not cached, and why not
 *
 * - **Vendor listings.** The response is a function of filters, a sort, a page *and the
 *   caller's coordinates*, so a correct key is the cross-product of all four. Worse,
 *   `isOpen` changes on the minute, which means the entries hit most often are exactly
 *   the ones most likely to be wrong — a listing that says a kitchen is taking orders
 *   twenty minutes after it closed. Caching listings needs a materialised projection
 *   invalidated by writes, which is a later unit's work, not a TTL.
 * - **Vendor detail** (`vendor(slug:)`), for the same reason in miniature. It carries
 *   `isOpen` and `distanceKm`, and a `VendorRecord` does not retain the inputs
 *   (`acceptingOrders`, `pausedUntil`, the closure list) needed to recompute `isOpen`
 *   after a cache read. Caching it would mean either serving a stale kill switch — the
 *   one field a restaurant flips *because* it needs to be obeyed immediately — or
 *   widening the record so the cached copy can be repaired. The second is defensible and
 *   is the natural next step; it is not free, and it is not Unit 2's job.
 *
 * ### On invalidation
 *
 * There is still no writer: Unit 2 is the cart, and menu editing belongs to the merchant
 * unit. So `invalidateVendor` exists and nothing calls it yet. It is declared anyway,
 * because the alternative is that whoever builds menu editing discovers this cache from
 * a bug report about a price that would not change — and because a TTL on a cache with
 * no invalidation *is* the freshness policy, which is why the menu TTL defaults to
 * minutes rather than the rails' quarter of an hour.
 */
export interface CatalogSnapshot {
  cuisines: readonly CuisineRecord[];
  categories: readonly CategoryRecord[];
}

export interface CatalogCachePort {
  read(): Promise<CatalogSnapshot | null>;
  write(snapshot: CatalogSnapshot): Promise<void>;
  invalidate(): Promise<void>;

  readMenu(vendorId: string): Promise<MenuSectionWithItemsRecord[] | null>;
  writeMenu(vendorId: string, sections: readonly MenuSectionWithItemsRecord[]): Promise<void>;

  readFood(slug: string): Promise<FoodItemRecord | null>;
  writeFood(slug: string, food: FoodItemRecord): Promise<void>;

  /**
   * Drops one vendor's menu, and the dish entries belonging to it.
   *
   * The slugs are a parameter rather than something this method looks up, because a
   * dish entry is keyed by slug and Redis holds no reverse index from vendor to dish.
   * The alternative is a `SCAN` over `catalog:food:*` on every menu edit, which is
   * fine until the catalogue is large and then is a production incident.
   */
  invalidateVendor(vendorId: string, foodSlugs?: readonly string[]): Promise<void>;
}
