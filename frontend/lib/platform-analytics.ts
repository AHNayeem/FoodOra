import type {
  AnalyticsRange,
  CustomerActivity,
  CustomerSpend,
  DeliveryPerformance,
  Order,
  OrderStatus,
  PlatformAnalytics,
  RiderPerformance,
  VendorPerformance,
} from "@/types";
import { analyticsFor, ordersInRange } from "./analytics";
import { customerIdFor, normalisePhone } from "./customers";
import { hasObservedTimeline } from "./order-lifecycle";
import { isFailure } from "./order-machine";
import { platformFinancials } from "./settlement";

/**
 * platform-analytics.ts — the platform's read of the shared order book
 * (Phase 16, G33).
 *
 * The restaurant's version of this already existed: `lib/analytics` projects one
 * vendor's book into revenue, orders, peak hours and top products over a window,
 * and `lib/settlement` owns every figure with money in it. This module is
 * deliberately **not** a second implementation of either. It calls both over the
 * platform's book and adds only the four things that have no per-restaurant
 * meaning — the vendor league table, the courier league table, customer activity
 * and delivery performance.
 *
 * That is the whole design, and it is what makes §5.4 hold: the platform's GMV is
 * the sum of numbers each restaurant can see on its own screen, the commission
 * under it is the money `/admin/payouts` will actually pay against, and there is
 * no rate multiplied by anything anywhere in this file. A plausible alternative —
 * "revenue × 15%" for the commission row — would look right, disagree with every
 * vendor on a negotiated rate, and be impossible to reconcile from the screen.
 *
 * Everything here is pure and takes `now` (or a resolved range) from its caller,
 * so it is testable and cannot read the clock twice in one render.
 *
 * Two windowing rules, stated once because they are what the numbers mean:
 *
 *  - **Orders are windowed by placement**, inherited from `ordersInRange`. Every
 *    figure on the page therefore describes the *same set of orders*. Bucketing
 *    takings by placement and commission by settlement date would produce two
 *    windows nobody could reconcile, and they would differ most at a period
 *    boundary, which is exactly when somebody is checking.
 *  - **Durations are measured only over observed timelines.** See
 *    `DeliveryPerformance`: the synthesised trailing week reconstructs its event
 *    times by even division, so averaging it would publish the seed's arithmetic
 *    as an operational KPI.
 */

const MINUTE = 60_000;

/** When the order first entered `status`, or null if it never did. */
function eventAt(order: Order, status: OrderStatus): number | null {
  const event = order.lifecycle.events.find((e) => e.status === status);
  if (!event) return null;
  const at = Date.parse(event.at);
  return Number.isNaN(at) ? null : at;
}

/** Mean of the samples in minutes, or null when nothing was measurable. */
function avgMinutes(totalMs: number, samples: number): number | null {
  return samples > 0 ? totalMs / samples / MINUTE : null;
}

/** A finished delivery, by either name. `delivered` has not closed its money yet. */
function isDelivered(status: OrderStatus): boolean {
  return status === "delivered" || status === "completed";
}

// ---------------------------------------------------------------------------
// Vendor performance
// ---------------------------------------------------------------------------

/**
 * One line per restaurant that traded in the window, best revenue first.
 *
 * Grouped by `order.vendor.id` off the order's own snapshot rather than joined
 * against the catalog, so a listing this device minted (Phase 6) appears here the
 * moment it sells something — it has no catalog row and would otherwise be
 * invisible on the platform's own report of itself.
 */
export function vendorPerformance(orders: Order[], limit?: number): VendorPerformance[] {
  const rows = new Map<string, VendorPerformance & { ratingTotal: number; placed: number }>();

  for (const order of orders) {
    const row =
      rows.get(order.vendor.id) ??
      {
        vendorId: order.vendor.id,
        name: order.vendor.name,
        orders: 0,
        revenue: 0,
        avgOrderValue: 0,
        completed: 0,
        cancelled: 0,
        cancelRate: 0,
        settled: 0,
        settledGross: 0,
        commission: 0,
        net: 0,
        rating: null,
        ratedOrders: 0,
        ratingTotal: 0,
        placed: 0,
      };

    row.placed += 1;
    if (isFailure(order.status)) row.cancelled += 1;
    else {
      row.orders += 1;
      row.revenue += order.pricing.total;
    }
    if (order.status === "completed") row.completed += 1;
    if (order.lifecycle.rating != null) {
      row.ratedOrders += 1;
      row.ratingTotal += order.lifecycle.rating;
    }

    // Money is read, never recomputed: this is the record the `completed`
    // transition stamped (Phase 2) and the one the payout run settles from.
    const commission = order.lifecycle.financials?.commission;
    if (commission) {
      row.settled += 1;
      row.settledGross += commission.grossAmount;
      row.commission += commission.commissionAmount;
      row.net += commission.vendorNetAmount;
    }

    rows.set(order.vendor.id, row);
  }

  const list = [...rows.values()]
    .map(({ ratingTotal, placed, ...row }) => ({
      ...row,
      avgOrderValue: row.orders > 0 ? row.revenue / row.orders : 0,
      cancelRate: placed > 0 ? row.cancelled / placed : 0,
      rating: row.ratedOrders > 0 ? ratingTotal / row.ratedOrders : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  return limit == null ? list : list.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Rider performance
// ---------------------------------------------------------------------------

/**
 * One line per courier who was given something in the window.
 *
 * Keyed off `lifecycle.rider` — the snapshot the assignment wrote — rather than
 * off the earning record, so a courier currently riding appears with work in
 * progress instead of only once the money closes. The earnings columns then read
 * `financials.riderEarning`, which is the same record `buildRiderSettlements`
 * pays from, so a courier's line here and their payout cannot disagree.
 *
 * This table is short on a fresh browser, and that is honest rather than a bug:
 * the synthesised trailing week carries a commission record but no courier,
 * because nobody rode it. Only the seeded working set and deliveries driven on
 * this device put a rider on the platform's book.
 */
export function riderPerformance(orders: Order[], limit?: number): RiderPerformance[] {
  const rows = new Map<string, RiderPerformance & { minutesTotal: number }>();

  for (const order of orders) {
    const rider = order.lifecycle.rider;
    if (!rider) continue;

    const row =
      rows.get(rider.id) ??
      {
        riderId: rider.id,
        name: rider.name,
        assigned: 0,
        deliveries: 0,
        settled: 0,
        earned: 0,
        tips: 0,
        cashCollected: 0,
        measured: 0,
        avgMinutes: null,
        onTime: 0,
        onTimeRate: null,
        minutesTotal: 0,
      };

    row.assigned += 1;
    if (isDelivered(order.status)) row.deliveries += 1;

    const earning = order.lifecycle.financials?.riderEarning;
    if (earning) {
      row.settled += 1;
      row.earned += earning.payout.total;
      row.tips += earning.payout.tip;
      row.cashCollected += earning.cashCollected;
    }

    const delivered = hasObservedTimeline(order) ? eventAt(order, "delivered") : null;
    if (delivered != null) {
      const placed = Date.parse(order.placedAt);
      const eta = Date.parse(order.estimatedDeliveryAt);
      row.measured += 1;
      row.minutesTotal += delivered - placed;
      if (!Number.isNaN(eta) && delivered <= eta) row.onTime += 1;
    }

    rows.set(rider.id, row);
  }

  const list = [...rows.values()]
    .map(({ minutesTotal, ...row }) => ({
      ...row,
      avgMinutes: avgMinutes(minutesTotal, row.measured),
      onTimeRate: row.measured > 0 ? row.onTime / row.measured : null,
    }))
    .sort((a, b) => b.deliveries - a.deliveries || b.earned - a.earned);

  return limit == null ? list : list.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Customer activity
// ---------------------------------------------------------------------------

/**
 * Who ordered in the window, and whether the platform had seen them before.
 *
 * `all` is the *whole* of the caller's book, not the window: "new" means first
 * order ever, and the only way to know that is to look outside the window. A
 * customer counted as new because the range starts after their first order would
 * be the sort of quiet error a growth number is judged on.
 *
 * Identity is the normalised phone number, which is what `lib/customers` uses for
 * the admin directory — so a row here and a row in `/admin/customers` are the same
 * person, and the `id` is the one `/admin/customers/[id]` resolves. Which is also
 * why `platformAnalyticsFor` hands this function the *order store* rather than the
 * platform book it gives everything else: see `customerBook` there.
 */
export function customerActivity(
  windowed: Order[],
  all: Order[],
  { from, topLimit = 8 }: { from: string; topLimit?: number },
): CustomerActivity {
  const fromMs = Date.parse(from);
  const firstEver = new Map<string, number>();
  for (const order of all) {
    if (order.deletedAt) continue;
    const phone = normalisePhone(order.contact.phone);
    if (!phone) continue;
    const placed = Date.parse(order.placedAt);
    const seen = firstEver.get(phone);
    if (seen == null || placed < seen) firstEver.set(phone, placed);
  }

  const inWindow = new Map<string, CustomerSpend>();
  let orderCount = 0;
  for (const order of windowed) {
    if (order.deletedAt) continue;
    const phone = normalisePhone(order.contact.phone);
    if (!phone) continue;
    orderCount += 1;
    const row =
      inWindow.get(phone) ??
      {
        id: customerIdFor(phone),
        name: order.contact.name,
        phone,
        orders: 0,
        spend: 0,
      };
    row.orders += 1;
    // Takings, not gross: an order the restaurant refused was never spending.
    if (!isFailure(order.status)) row.spend += order.pricing.total;
    inWindow.set(phone, row);
  }

  let newCustomers = 0;
  let repeat = 0;
  for (const [phone, row] of inWindow) {
    // `>= fromMs`: their first order ever falls inside this window. The fallback
    // only fires for a phone that is in the window and not in `all`, which cannot
    // happen when both come from the same book — it is there so a caller that
    // passes a filtered book gets "new" rather than a crash.
    if ((firstEver.get(phone) ?? fromMs) >= fromMs) newCustomers += 1;
    if (row.orders > 1) repeat += 1;
  }

  const active = inWindow.size;
  return {
    orders: orderCount,
    active,
    newCustomers,
    returning: active - newCustomers,
    repeat,
    ordersPerCustomer: active > 0 ? orderCount / active : 0,
    top: [...inWindow.values()]
      .sort((a, b) => b.spend - a.spend || b.orders - a.orders)
      .slice(0, topLimit),
  };
}

// ---------------------------------------------------------------------------
// Delivery performance
// ---------------------------------------------------------------------------

/**
 * How the delivery operation performed over the window.
 *
 * Counts use every delivery order; the four averages and the on-time rate use
 * only orders with an observed timeline, and `measured` is returned so the screen
 * can say so. That split is the point of this function — see
 * `lib/order-lifecycle.hasObservedTimeline` for why a reconstructed timeline
 * cannot be averaged.
 */
export function deliveryPerformance(orders: Order[]): DeliveryPerformance {
  let deliveryOrders = 0;
  let delivered = 0;
  let failed = 0;
  let assigned = 0;
  let measured = 0;
  let onTime = 0;

  let totalMs = 0;
  let prepMs = 0;
  let prepSamples = 0;
  let courierMs = 0;
  let courierSamples = 0;
  let dispatchMs = 0;
  let dispatchSamples = 0;

  for (const order of orders) {
    if (order.fulfillment !== "delivery") continue;
    deliveryOrders += 1;
    if (isDelivered(order.status)) delivered += 1;
    if (order.status === "delivery-failed" || order.status === "returned") failed += 1;
    if (order.lifecycle.rider) assigned += 1;

    if (!hasObservedTimeline(order)) continue;
    const handedOver = eventAt(order, "delivered");
    const placed = Date.parse(order.placedAt);
    const readyAt = eventAt(order, "ready");
    const assignedAt = eventAt(order, "rider-assigned");
    const pickedUpAt = eventAt(order, "picked-up");

    // Legs are counted independently: an order still on the way has a prep time
    // worth knowing even though its total does not exist yet.
    if (readyAt != null) {
      prepMs += readyAt - placed;
      prepSamples += 1;
    }
    if (readyAt != null && assignedAt != null && assignedAt >= readyAt) {
      dispatchMs += assignedAt - readyAt;
      dispatchSamples += 1;
    }
    if (handedOver == null) continue;

    measured += 1;
    totalMs += handedOver - placed;
    const eta = Date.parse(order.estimatedDeliveryAt);
    if (!Number.isNaN(eta) && handedOver <= eta) onTime += 1;
    if (pickedUpAt != null) {
      courierMs += handedOver - pickedUpAt;
      courierSamples += 1;
    }
  }

  return {
    deliveryOrders,
    delivered,
    failed,
    assigned,
    measured,
    avgMinutes: avgMinutes(totalMs, measured),
    avgPrepMinutes: avgMinutes(prepMs, prepSamples),
    avgCourierMinutes: avgMinutes(courierMs, courierSamples),
    avgDispatchMinutes: avgMinutes(dispatchMs, dispatchSamples),
    onTime,
    onTimeRate: measured > 0 ? onTime / measured : null,
  };
}

// ---------------------------------------------------------------------------
// The whole report
// ---------------------------------------------------------------------------

/**
 * Everything `/admin/analytics` renders, over one window.
 *
 * `book` is the platform's whole order book and `range` selects out of it; the
 * whole book is needed as well as the window because "new customer" is a question
 * about a customer's first order ever, not their first order in the range.
 */
export function platformAnalyticsFor(
  book: Order[],
  {
    range,
    currency,
    topLimit = 8,
    customerBook = book,
  }: {
    range: AnalyticsRange;
    currency: string;
    topLimit?: number;
    /**
     * The orders customer activity is counted over. Defaults to `book`, and the
     * service deliberately passes something narrower — the order store, which is
     * what `/admin/customers` builds its directory from.
     *
     * The synthesised trailing week names each of its orders from a fixed pool of
     * eight demo contacts. Counted as a customer base that reads "eight customers,
     * two hundred orders each", and worse, every row in the table links to a
     * customer page that would show a different figure for the same person — two
     * answers to one question, which is the thing §5.2 exists to prevent. The
     * restaurants, couriers, revenue and commission above are counted for real;
     * this panel says on screen which orders it covers.
     */
    customerBook?: Order[];
  },
): PlatformAnalytics {
  const windowed = ordersInRange(book, range);

  return {
    currency,
    range,
    // The restaurant's own projection, run over every restaurant. Deliberately
    // the same function rather than the same arithmetic written twice.
    trade: analyticsFor(book, { range, currency, topLimit }),
    // …and the payout run's, over the same set.
    money: platformFinancials(windowed, { currency }),
    vendors: vendorPerformance(windowed),
    riders: riderPerformance(windowed),
    customers: customerActivity(ordersInRange(customerBook, range), customerBook, {
      from: range.from,
      topLimit,
    }),
    delivery: deliveryPerformance(windowed),
  };
}
