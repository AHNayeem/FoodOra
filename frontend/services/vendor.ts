import type { Order, Vendor } from "@/types";
import { buildVendorOrders, vendorById, vendors } from "@/lib/mock";
import { mockDelay } from "./http";

/**
 * vendor.ts — read API for the vendor dashboard (Phase C10).
 *
 * The prototype has no backend, so the "orders for my restaurant" data set is
 * synthesised at call time (`buildVendorOrders(now)`). Every function is async
 * with a backend-ready signature; Phase E swaps the mock build for real queries
 * here and the dashboard components stay unchanged.
 *
 * This module does not aggregate. It used to, and the numbers it produced were
 * the ones no surface could use — see {@link VendorDashboard} and G41. The money
 * and the charts come from `services/finance`, over the merged order book.
 */

/**
 * Resolve the vendor a signed-in account manages.
 *
 * **No fallback (spec §5.3, G09).** This used to return the flagship demo
 * restaurant whenever the account owned nothing, which meant any management login
 * landed on somebody else's dashboard and could accept their orders, edit their
 * menu and read their revenue. Nothing about that was visible on screen — the
 * dashboard simply showed *a* restaurant — which is why the audit classed it as one
 * of the prototype's worst untruths rather than a convenience. An account that owns
 * no restaurant now gets `null`, and `DashboardShell` says so.
 *
 * `admitted` is the listings this device minted by approving an application
 * (Phase 6). Injected rather than looked up, exactly as `dispatchRider` takes the
 * unavailable set: this module cannot read a store, and a resolver that consults
 * one would be a second source of "my restaurant". Phase E drops the parameter and
 * queries both from one table.
 */
export async function getDashboardVendor(
  userId: string,
  admitted: Vendor[] = [],
): Promise<Vendor | null> {
  const mine = [...admitted, ...vendors].find(
    (v) => v.ownerId === userId && !v.deletedAt,
  );
  return mockDelay(mine ?? null, 200);
}

/**
 * One listing by id — what the admin's restaurant page links to (Phase 6).
 *
 * Needed because an application stores the listing's *id*, and a storefront link
 * needs its slug. Deriving the slug from the restaurant's name would be wrong for
 * every vendor whose slug is not a plain slugification of it ("Sugar & Spoon" is
 * `sugar-and-spoon`), and a broken link on a review screen is worse than none.
 */
export async function getVendorListing(
  vendorId: string,
  admitted: Vendor[] = [],
): Promise<Vendor | null> {
  const minted = admitted.find((v) => v.id === vendorId && !v.deletedAt);
  return mockDelay(minted ?? vendorById.get(vendorId) ?? null, 150);
}

/**
 * The restaurant's history, as this seam can answer it.
 *
 * **One field, and it is the orders (Phase 18, G41).** There were three, and two
 * of them were read paths nobody used or nobody should have:
 *
 *  - `stats` was `vendorStats` over the synthesised week *only*. The overview
 *    discarded it and recomputed the same function over the synthesised week
 *    plus the live store, because a KPI card that ignores the orders this device
 *    actually took is wrong. So the service was computing a set of numbers whose
 *    only property was that they were the ones not to show.
 *  - `recentOrders` was `allOrders.slice(0, 6)` — the same array, pre-cut, so a
 *    caller could take a different six from the same source and disagree with
 *    itself. The cut belongs to whoever is rendering the list.
 *
 * The chart series went the same way in Phase 10, for the same reason: they were
 * derived here from the synthesised week and read by a page that had a live book.
 * What is left is the one thing this seam knows and the caller cannot get
 * elsewhere — the generated history, which exists so a fresh device has a week of
 * trading behind it instead of an empty dashboard.
 */
export interface VendorDashboard {
  vendor: Vendor;
  /**
   * The synthesised window, newest first. The overview merges it with the live
   * order store and derives everything — the KPI cards, the recent list — from
   * the merge, so both describe the same set of orders.
   */
  orders: Order[];
}

export async function getVendorDashboard(
  vendorId: string,
): Promise<VendorDashboard | null> {
  const vendor = vendorById.get(vendorId);
  if (!vendor) return mockDelay(null, 200);

  return mockDelay({ vendor, orders: buildVendorOrders(vendorId, Date.now()) }, 400);
}
