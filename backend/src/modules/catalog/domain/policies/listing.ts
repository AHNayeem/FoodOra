import type { VendorSort } from '../../../../shared/enums';
import type { VendorRecord } from '../models';

/**
 * The two predicates and one comparator that turn a candidate set into a page.
 *
 * ## Why any of this is in the application layer rather than in SQL
 *
 * Three of the six list operations cannot be expressed in the query, and the reason
 * is the brand/branch split `catalog.prisma` chose deliberately:
 *
 * - **`openNow`** is `isOpenNow()` — seven weekday rows, a timezone, a kill switch, a
 *   pause and a dated closure list. That is not a `WHERE` clause.
 * - **`sort: "delivery-time"`** orders by `etaMinMinutes`, which lives on
 *   `vendor_branches`. Prisma cannot `orderBy` a to-many relation's column, and
 *   neither can SQL without a lateral join the ORM will not write.
 * - **`sort: "distance"`** orders by a value that does not exist until the caller's
 *   origin is known.
 *
 * So the repository narrows in SQL what SQL can narrow — type, cuisine, name/tagline
 * search, status, tombstones — and hands back a **capped candidate set** that this
 * file finishes. The cap is the honest part: above it, a page is computed from a
 * subset and `total` is a floor rather than a count. The default is far above the
 * size of any real city's active vendor list, and the fix when a market outgrows it
 * is a materialised listing projection (denormalised ETA, fee and a PostGIS point),
 * not more application-layer sorting.
 */

/**
 * The defaults behind `CATALOG_CANDIDATE_LIMIT` and `CATALOG_RAIL_LIMIT`.
 *
 * The values in force at runtime come from `catalogConfig`, because the right number
 * depends on the size of the deployment's catalogue rather than on this algorithm. They
 * stay here as the defaults so the policy still states its own assumptions and a test
 * has a number to reach for without standing up a `ConfigService`.
 */
export const DEFAULT_CANDIDATE_LIMIT = 500;
export const DEFAULT_RAIL_LIMIT = 50;

/**
 * `trendingVendors(limit: 100000)` is a request for the whole table dressed as a rail.
 * The `PageInput` path is capped by `toSkipTake`; the rails take a bare `Int`, so they
 * are capped here.
 */
export function clampRailLimit(limit: number, max: number = DEFAULT_RAIL_LIMIT): number {
  return Math.min(max, Math.max(1, Math.trunc(limit)));
}

/** `openNow` — the one filter the database cannot answer. */
export function matchesOpenNow(vendor: VendorRecord, openNow: boolean | undefined): boolean {
  return openNow !== true || vendor.isOpen;
}

/**
 * Ordering, matching `services/catalog.ts` exactly — including its tie-breaks, since
 * a list that reshuffles between renders looks like a bug to whoever is scrolling it.
 *
 * `id` is the final tie-break on every branch. Without it two vendors with the same
 * rating come back in whatever order Postgres felt like, which changes between
 * identical requests and makes page 2 drop a row that page 1 already showed.
 */
export function compareVendors(sort: VendorSort | undefined): (a: VendorRecord, b: VendorRecord) => number {
  switch (sort) {
    case 'rating':
      return (a, b) => b.rating - a.rating || a.id.localeCompare(b.id);

    case 'delivery-time':
      return (a, b) => a.etaMinutes[0] - b.etaMinutes[0] || a.id.localeCompare(b.id);

    case 'distance':
      return (a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id);

    default:
      // "recommended": featured first, then rating.
      return (a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) ||
        b.rating - a.rating ||
        a.id.localeCompare(b.id);
  }
}
