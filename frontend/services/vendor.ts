import type {
  BestSeller,
  HourlyPoint,
  Order,
  RevenuePoint,
  Vendor,
  VendorStats,
} from "@/frontend/types";
import { buildVendorOrders, vendorById, vendors } from "@/frontend/lib/mock";
import {
  bestSellers,
  peakHours,
  revenueSeries,
  vendorStats,
} from "@/frontend/lib/analytics";
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
 * Resolve the vendor a signed-in account manages. Returns the account's owned
 * vendor, or — so any staff demo account can preview the dashboard — falls back
 * to the flagship demo vendor. Null only if there are no vendors at all.
 */
export async function getDashboardVendor(userId: string): Promise<Vendor | null> {
  const owned = vendors.find((v) => v.ownerId === userId && !v.deletedAt);
  if (owned) return mockDelay(owned, 200);
  const flagship =
    vendors.find((v) => v.ownerId != null && !v.deletedAt) ?? vendors[0] ?? null;
  return mockDelay(flagship, 200);
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
