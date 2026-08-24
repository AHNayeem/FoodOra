import type {
  AnalyticsRange,
  AnalyticsRangeKey,
  BestSeller,
  HourlyPoint,
  Order,
  RevenuePoint,
  Vendor,
  VendorAnalytics,
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

// ---------------------------------------------------------------------------
// Reporting windows (Phase 10, G23)
// ---------------------------------------------------------------------------

/** How many days each preset looks back over, counting today. */
const PRESET_DAYS: Record<Exclude<AnalyticsRangeKey, "custom">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Widest window the range control will resolve, in days — two years. */
const MAX_RANGE_DAYS = 730;

/** Whole days from `from` to `to` inclusive, at least 1. */
function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(1, Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY) + 1);
}

/**
 * Turn a preset (or a pair of dates) into the window every figure is computed
 * over.
 *
 * The single place a preset means anything. A component that turned "30d" into
 * dates itself would disagree with the CSV export's header row by a day whenever
 * one of them read the clock either side of midnight, and the export would then be
 * quietly describing a different month from the chart above it.
 *
 * Both ends are snapped to day boundaries — `from` to midnight, `to` to the last
 * millisecond of its day — because a restaurant asking for "last 7 days" means
 * seven whole trading days, not 168 hours ending at 14:23. A custom range with the
 * dates the wrong way round is swapped rather than refused: the intent is
 * unambiguous and refusing it would be pedantry at a date picker.
 */
export function resolveRange(
  key: AnalyticsRangeKey,
  now: number,
  custom?: { from: string; to: string },
): AnalyticsRange {
  if (key === "custom") {
    const a = Date.parse(custom?.from ?? "");
    const b = Date.parse(custom?.to ?? "");
    // An unparsable or missing pair falls back to the default preset rather than
    // producing `NaN` bounds that would silently match no orders at all.
    if (Number.isNaN(a) || Number.isNaN(b)) return resolveRange("7d", now);
    const lo = startOfDay(Math.min(a, b));
    const hi = endOfDay(Math.max(a, b));
    const clamped = Math.min(daysBetween(lo, hi), MAX_RANGE_DAYS);
    return {
      key: "custom",
      from: new Date(startOfDay(endOfDay(hi) - (clamped - 1) * DAY)).toISOString(),
      to: new Date(hi).toISOString(),
      days: clamped,
    };
  }

  const days = PRESET_DAYS[key];
  const to = endOfDay(now);
  const from = startOfDay(now) - (days - 1) * DAY;
  return {
    key,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    days,
  };
}

/** Last millisecond (local) of the day containing `ms`. */
function endOfDay(ms: number): number {
  return startOfDay(ms) + DAY - 1;
}

/** The default window a restaurant lands on. A week is what a rota is planned in. */
export const DEFAULT_RANGE_KEY: AnalyticsRangeKey = "7d";

/** Presets the range control offers, in the order it reads them. */
export const RANGE_KEYS: readonly AnalyticsRangeKey[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "custom",
];

/**
 * Orders placed inside a window.
 *
 * **Placed**, not completed or settled — and every figure in a report uses this
 * one predicate. It is what makes revenue, the commission beneath it and the
 * cancellation count describe the *same set of orders*: bucketing takings by
 * placement and commission by settlement date would produce two windows whose
 * numbers cannot be reconciled by anyone reading the page, and the difference
 * would be largest exactly at a period boundary, which is when somebody is most
 * likely to be checking.
 */
export function ordersInRange(
  orders: Order[],
  range: Pick<AnalyticsRange, "from" | "to">,
): Order[] {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  return orders.filter((order) => {
    const placed = Date.parse(order.placedAt);
    return placed >= from && placed <= to;
  });
}

/**
 * How wide one bucket in the trend chart should be, in days.
 *
 * Daily up to a fortnight, then weekly. The rule is about legibility rather than
 * arithmetic: a bar chart with ninety bars on a phone in a kitchen is a smear, and
 * a restaurant reading a quarter is asking which *weeks* were good.
 */
export function bucketDaysFor(rangeDays: number): number {
  return rangeDays <= 14 ? 1 : 7;
}

/**
 * Revenue and order counts bucketed across an arbitrary window, oldest first.
 *
 * The generalisation of `revenueSeries`, which stays as it is: it answers "the
 * last N days" for the overview and has a caller that wants exactly that. This
 * one answers "this window, at a sensible resolution" and is what the range
 * control drives.
 */
export function revenueBuckets(
  orders: Order[],
  range: Pick<AnalyticsRange, "from" | "to"> & { days: number },
): RevenuePoint[] {
  const span = bucketDaysFor(range.days);
  const first = startOfDay(Date.parse(range.from));
  const last = startOfDay(Date.parse(range.to));
  const count = Math.max(1, Math.ceil((last - first) / DAY / span) + 1);

  const buckets: RevenuePoint[] = [];
  for (let i = 0; i < count; i++) {
    const startMs = first + i * span * DAY;
    const date = new Date(startMs);
    buckets.push({
      date: date.toISOString(),
      dayKey: DAY_KEYS[date.getDay()],
      // Only set when it is not one day, so the overview's seven daily points
      // stay byte-identical to what they were before this phase.
      ...(span === 1 ? {} : { spanDays: span }),
      revenue: 0,
      orders: 0,
    });
  }

  for (const order of ordersInRange(orders, range)) {
    if (!isRevenue(order)) continue;
    const index = Math.floor((startOfDay(Date.parse(order.placedAt)) - first) / DAY / span);
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.revenue += order.pricing.total;
    bucket.orders++;
  }

  return buckets;
}

/**
 * Everything the analytics page shows, over one window (G23).
 *
 * Pure, and it invents nothing. The spec's binding constraint for this phase is
 * that analytics read actual shared order data, and the two figures a plausible
 * implementation would get wrong are commission and net revenue: both are read off
 * the `OrderFinancials.commission` record the `completed` transition stamped
 * (Phase 2), never recomputed from a rate. Multiplying revenue by 15% would look
 * right and would disagree with `/dashboard/earnings` for every vendor on a
 * negotiated rate — the flagship's is 0.18 — which is §5.4's fake value wearing a
 * chart.
 *
 * Commission is therefore reported over a **subset**: only completed orders carry
 * a record, so `settledGross`/`settledCount` are carried alongside it and the
 * screen shows them together. Presenting commission against total revenue would
 * imply the platform had taken a cut of orders it has not settled yet.
 */
export function analyticsFor(
  orders: Order[],
  {
    range,
    currency,
    topLimit = 8,
  }: { range: AnalyticsRange; currency: string; topLimit?: number },
): VendorAnalytics {
  const windowed = ordersInRange(orders, range);

  let revenue = 0;
  let orderCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let settledGross = 0;
  let settledCount = 0;
  let commissionAmount = 0;
  let netRevenue = 0;

  for (const order of windowed) {
    if (order.status === "completed") completedCount++;
    if (isFailure(order.status)) cancelledCount++;
    if (isRevenue(order)) {
      revenue += order.pricing.total;
      orderCount++;
    }
    const commission = order.lifecycle.financials?.commission;
    if (commission) {
      settledCount++;
      settledGross += commission.grossAmount;
      commissionAmount += commission.commissionAmount;
      netRevenue += commission.vendorNetAmount;
    }
  }

  return {
    currency,
    range,
    revenue,
    orderCount,
    avgOrderValue: orderCount > 0 ? revenue / orderCount : 0,
    completedCount,
    cancelledCount,
    settledGross,
    settledCount,
    commissionAmount,
    netRevenue,
    series: revenueBuckets(orders, range),
    peak: peakHours(windowed),
    topProducts: bestSellers(windowed, topLimit),
  };
}
