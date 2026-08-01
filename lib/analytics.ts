import type {
  BestSeller,
  HourlyPoint,
  Order,
  RevenuePoint,
  Vendor,
  VendorStats,
} from "@/types";
import { isFailure } from "./order-machine";

/**
 * analytics.ts — pure derivations for the vendor dashboard (Phase C10).
 *
 * A real backend would compute these with SQL aggregates over the orders table;
 * here the same shapes are folded out of the in-memory order set. Kept pure
 * (all clock values are passed in as `now`) so they are trivially testable and
 * reused by the overview cards, charts and lists without any state coupling.
 */

const DAY = 86_400_000;

/** getDay() (0 = Sunday) → the short key the UI translates via `days.*`. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Which orders count toward revenue and item sales.
 *
 * "Not cancelled" was sufficient when `cancelled` was the only bad ending. With
 * rejection, failed delivery, return and refund now modelled separately, the
 * rule has to be stated properly — otherwise a rejected order still counts as
 * takings, which is the sort of quiet error a dashboard is judged on.
 */
function isRevenue(order: Order): boolean {
  return !isFailure(order.status);
}

/** Midnight (local) of the day containing `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Signed growth of `current` over `previous` as a fraction (capped for display). */
function deltaFraction(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

/** Headline KPIs: today's revenue/orders/AOV, deltas vs yesterday, live pending. */
export function vendorStats(orders: Order[], vendor: Vendor, now: number): VendorStats {
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY;

  let revenueToday = 0;
  let ordersToday = 0;
  let revenueYesterday = 0;
  let ordersYesterday = 0;
  let pendingOrders = 0;

  for (const order of orders) {
    const placed = Date.parse(order.placedAt);
    // "Pending" is anything the restaurant still owes work on — through
    // packing, not just preparing, and including orders on the pass with no
    // courier yet.
    if (
      order.status === "placed" ||
      order.status === "confirmed" ||
      order.status === "preparing" ||
      order.status === "packing" ||
      order.status === "ready"
    ) {
      pendingOrders++;
    }
    if (!isRevenue(order)) continue;
    if (placed >= todayStart && placed <= now) {
      revenueToday += order.pricing.total;
      ordersToday++;
    } else if (placed >= yesterdayStart && placed < todayStart) {
      revenueYesterday += order.pricing.total;
      ordersYesterday++;
    }
  }

  return {
    currency: vendor.currency,
    revenueToday,
    ordersToday,
    avgOrderValue: ordersToday > 0 ? revenueToday / ordersToday : 0,
    rating: vendor.rating,
    reviewCount: vendor.reviewCount,
    pendingOrders,
    revenueDelta: deltaFraction(revenueToday, revenueYesterday),
    ordersDelta: deltaFraction(ordersToday, ordersYesterday),
  };
}

/** Daily revenue/order counts for the trend chart, oldest → newest. */
export function revenueSeries(orders: Order[], now: number, days = 7): RevenuePoint[] {
  const todayStart = startOfDay(now);
  const buckets: RevenuePoint[] = [];

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = todayStart - d * DAY;
    const date = new Date(dayStart);
    buckets.push({
      date: date.toISOString(),
      dayKey: DAY_KEYS[date.getDay()],
      revenue: 0,
      orders: 0,
    });
  }

  const firstStart = todayStart - (days - 1) * DAY;
  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const placed = Date.parse(order.placedAt);
    if (placed < firstStart || placed > now) continue;
    const index = Math.floor((startOfDay(placed) - firstStart) / DAY);
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.revenue += order.pricing.total;
    bucket.orders++;
  }

  return buckets;
}

/** Orders per hour across the window, restricted to typical service hours. */
export function peakHours(orders: Order[], fromHour = 9, toHour = 23): HourlyPoint[] {
  const counts = new Map<number, number>();
  for (let h = fromHour; h <= toHour; h++) counts.set(h, 0);

  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const hour = new Date(order.placedAt).getHours();
    if (hour < fromHour || hour > toHour) continue;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  return [...counts.entries()].map(([hour, orders]) => ({ hour, orders }));
}

/** Top-selling items by units, aggregated across the window. */
export function bestSellers(orders: Order[], limit = 5): BestSeller[] {
  const map = new Map<string, BestSeller>();

  for (const order of orders) {
    if (!isRevenue(order)) continue;
    for (const line of order.lines) {
      const entry = map.get(line.foodId) ?? {
        foodId: line.foodId,
        name: line.name,
        image: line.image,
        unitsSold: 0,
        revenue: 0,
      };
      entry.unitsSold += line.quantity;
      entry.revenue += line.unitPrice * line.quantity;
      map.set(line.foodId, entry);
    }
  }

  return [...map.values()]
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);
}
