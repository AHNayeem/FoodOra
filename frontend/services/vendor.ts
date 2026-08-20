import type {
  BestSeller,
  HourlyPoint,
  Order,
  RevenuePoint,
  Vendor,
  VendorStats,
} from "@/types";
import { buildVendorOrders, vendorById, vendors } from "@/lib/mock";
import {
  bestSellers,
  peakHours,
  revenueSeries,
  vendorStats,
} from "@/lib/analytics";
import { mockDelay } from "./http";

/**
 * vendor.ts — read API for the vendor dashboard (Phase C10).
 *
 * The prototype has no backend, so the "orders for my restaurant" data set is
 * synthesised at call time (`buildVendorOrders(now)`) and aggregated by the
 * pure helpers in `lib/analytics`. Every function is async with a
 * backend-ready signature; Phase E swaps the mock build for real queries here
 * and the dashboard components stay unchanged.
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

/** Everything the overview page renders, derived from one order snapshot. */
export interface VendorDashboard {
  vendor: Vendor;
  stats: VendorStats;
  revenue: RevenuePoint[];
  peak: HourlyPoint[];
  bestSellers: BestSeller[];
  recentOrders: Order[];
  /**
   * The whole synthesised window. The overview re-runs `vendorStats` over this
   * *plus* the live order store, so today's KPIs count orders that were actually
   * placed on this device rather than only the generated ones.
   */
  allOrders: Order[];
}

export async function getVendorDashboard(
  vendorId: string,
): Promise<VendorDashboard | null> {
  const vendor = vendorById.get(vendorId);
  if (!vendor) return mockDelay(null, 200);

  const now = Date.now();
  const orders = buildVendorOrders(vendorId, now);

  return mockDelay(
    {
      vendor,
      stats: vendorStats(orders, vendor, now),
      revenue: revenueSeries(orders, now),
      peak: peakHours(orders),
      bestSellers: bestSellers(orders, 5),
      recentOrders: orders.slice(0, 6),
      allOrders: orders,
    },
    400,
  );
}

/** The vendor's full order feed for the order-management board. */
export async function getVendorOrders(vendorId: string): Promise<Order[]> {
  return mockDelay(buildVendorOrders(vendorId, Date.now()), 400);
}
