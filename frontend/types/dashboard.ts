import type { ISODate } from "./common";
import type { PlatformFinancials } from "./finance";

/**
 * dashboard.ts — read models for the vendor dashboard (Phase C10).
 *
 * These are *derived* view shapes, not stored entities: a real backend would
 * compute them from the `Order` / `OrderItem` tables with SQL aggregates. The
 * prototype derives the same shapes from the generated vendor order set
 * (`lib/analytics.ts`), so the dashboard is backend-ready — swapping in Phase E
 * changes only `services/vendor.ts`, never these types or the components.
 */

/** Headline KPIs for the overview cards, scoped to "today" vs the day before. */
export interface VendorStats {
  currency: string;
  revenueToday: number;
  ordersToday: number;
  /** Mean order value today, 0 when there are no orders yet. */
  avgOrderValue: number;
  rating: number;
  reviewCount: number;
  /** Orders currently awaiting the kitchen's attention (placed/confirmed/preparing). */
  pendingOrders: number;
  /** Revenue change vs yesterday, as a signed fraction (0.12 = +12%). */
  revenueDelta: number;
  /** Order-count change vs yesterday, as a signed fraction. */
  ordersDelta: number;
}

/** One bucket in the revenue trend chart. */
export interface RevenuePoint {
  date: ISODate;
  /** Short locale-agnostic weekday key ("mon"…"sun") — the UI translates it. */
  dayKey: string;
  /**
   * How many days this bucket covers. Absent means one day, which is what every
   * point meant before Phase 10.
   *
   * A seven-day window is labelled by weekday and always was. A ninety-day one
   * cannot be — "mon" would appear thirteen times — so a wide range buckets by
   * week and the chart needs to know that to label it. The *label itself* is not
   * stored: formatting a date is locale and calendar work, and `lib/analytics` is
   * pure and has no `next-intl`. The chart formats `date` and `spanDays` with the
   * request's own formatter, so the axis reads correctly in Bengali and Arabic
   * rather than in whatever this module hard-coded.
   */
  spanDays?: number;
  revenue: number;
  orders: number;
}

/** Orders taken in a given hour of the day, aggregated across the window. */
export interface HourlyPoint {
  /** 0–23. */
  hour: number;
  orders: number;
}

/** A best-selling menu item over the reporting window. */
export interface BestSeller {
  foodId: string;
  name: string;
  image: string;
  unitsSold: number;
  revenue: number;
}

// ---------------------------------------------------------------------------
// Analytics (Phase 10, G23)
// ---------------------------------------------------------------------------

/**
 * A reporting window the restaurant can pick.
 *
 * Presets plus a custom pair, because those are the two things a range control has
 * to do: answer "how did last week go" in one tap, and answer "what happened over
 * Eid" at all. Resolved to instants by `lib/analytics.resolveRange`, which is the
 * only place a preset means anything — a component that turned "30d" into dates
 * itself would drift from the export's header by a day at midnight.
 */
export type AnalyticsRangeKey = "today" | "7d" | "30d" | "90d" | "custom";

/** A resolved window. `from` is inclusive, `to` is inclusive to the millisecond. */
export interface AnalyticsRange {
  key: AnalyticsRangeKey;
  from: ISODate;
  to: ISODate;
  /** Whole days spanned, at least 1 — the denominator for per-day averages. */
  days: number;
}

/**
 * Everything the analytics page renders, over one window.
 *
 * Every figure here is a projection of the *shared* order book — the spec's
 * binding constraint for this phase ("analytics must use actual shared order
 * data"), which is the same rule Phase 8 obeyed for money applied to counts.
 * `commissionAmount` and `netRevenue` in particular are read off the commission
 * records completed orders carry (`OrderFinancials.commission`) rather than
 * recomputed from a rate: a chart that multiplied revenue by 15% would be §5.4's
 * fake value with a nicer presentation, and it would disagree with
 * `/dashboard/earnings` the moment one order was on a negotiated rate.
 */
export interface VendorAnalytics {
  currency: string;
  range: AnalyticsRange;
  /** Orders that count as takings — everything that did not end badly. */
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
  /** Orders that reached `completed` in the window. */
  completedCount: number;
  /**
   * Orders that ended badly in the window — cancelled, rejected, returned,
   * refunded or a failed handoff. Counting only the customer's cancellations
   * would under-report lost revenue, which is the number this figure exists for.
   */
  cancelledCount: number;
  /**
   * Gross value of the *settled* orders behind the commission figures. A subset of
   * `revenue`: commission is only known once an order completes, so the two are
   * shown side by side rather than one being presented as the other.
   */
  settledGross: number;
  settledCount: number;
  commissionAmount: number;
  /** What the restaurant keeps: settled gross less commission. */
  netRevenue: number;
  series: RevenuePoint[];
  peak: HourlyPoint[];
  topProducts: BestSeller[];
}

// ---------------------------------------------------------------------------
// Platform analytics (Phase 16, G33)
// ---------------------------------------------------------------------------

/**
 * One restaurant's line in the platform league table.
 *
 * Trade and money are carried side by side and counted over different sets on
 * purpose. `orders`/`revenue` cover everything placed in the window that did not
 * end badly; `commission`/`net` cover only the ones that reached `completed` and
 * therefore carry a stamped record. Reporting a commission against the first
 * figure would claim the platform had taken a cut of orders still in a kitchen.
 */
export interface VendorPerformance {
  vendorId: string;
  name: string;
  /** Orders placed in the window that count as takings. */
  orders: number;
  revenue: number;
  avgOrderValue: number;
  completed: number;
  /** Every bad ending — cancelled, rejected, returned, failed handoff. */
  cancelled: number;
  /** `cancelled` over every order placed, 0–1. */
  cancelRate: number;
  /** Orders carrying a commission record — the subset behind the money below. */
  settled: number;
  settledGross: number;
  commission: number;
  /** What the restaurant keeps on the settled orders. */
  net: number;
  /** Mean rating over orders the customer actually rated; null when none did. */
  rating: number | null;
  ratedOrders: number;
}

/**
 * One courier's line.
 *
 * `deliveries` counts jobs this courier finished; `settled`/`earned` count the
 * ones whose completion stamped an earning. The two differ by whatever is sitting
 * at `delivered` waiting to close, which is a real operational fact rather than a
 * rounding difference, so both are shown.
 */
export interface RiderPerformance {
  riderId: string;
  name: string;
  /** Orders assigned to this courier in the window. */
  assigned: number;
  /** …that reached `delivered` or `completed`. */
  deliveries: number;
  /** …that carry a stamped earning record. */
  settled: number;
  earned: number;
  tips: number;
  cashCollected: number;
  /** Deliveries with an observed timeline — the denominator for the minutes. */
  measured: number;
  /** Mean minutes from placement to handover over `measured`; null when none. */
  avgMinutes: number | null;
  /** Handed over no later than the estimate, over `measured`. */
  onTime: number;
  onTimeRate: number | null;
}

/** A customer's spending in the window, for the activity table. */
export interface CustomerSpend {
  /** `lib/customers.customerIdFor(phone)` — the id `/admin/customers/[id]` uses. */
  id: string;
  name: string;
  phone: string;
  orders: number;
  spend: number;
}

/**
 * Who ordered in the window, and whether the platform had met them before.
 *
 * Derived by phone number from **the same order store `/admin/customers` builds
 * its directory from**, not from the platform-wide book the rest of this report
 * reads. That narrower scope is the point rather than an oversight: the
 * synthesised trailing week gives each of its orders a contact name drawn from a
 * fixed pool of eight demo customers, so counting it would report those eight as
 * the platform's customer base with hundreds of orders each — and every row here
 * links to a customer page that would then show a different number for the same
 * person. `orders` is carried so the screen can say which orders the figures
 * cover.
 */
export interface CustomerActivity {
  /** Orders the figures below are counted over — fewer than the report's total. */
  orders: number;
  /** Distinct customers who placed an order inside the window. */
  active: number;
  /** …whose first order on the platform is inside it. */
  newCustomers: number;
  returning: number;
  /** …who placed more than one order inside it. */
  repeat: number;
  ordersPerCustomer: number;
  /** Biggest spenders in the window, longest first. */
  top: CustomerSpend[];
}

/**
 * How the delivery operation performed.
 *
 * The counts are over every delivery order in the window. The **minutes and the
 * on-time rate are not**: they are measured only over orders whose event log was
 * recorded rather than reconstructed (`lib/order-lifecycle.hasObservedTimeline`),
 * and `measured` is carried so the screen can say what the average covers. The
 * synthesised trailing week divides placement-to-ETA evenly across the stages, so
 * including it would report every order as delivered exactly on estimate.
 */
export interface DeliveryPerformance {
  /** Delivery orders placed in the window (pickup excluded). */
  deliveryOrders: number;
  delivered: number;
  /** Failed handoffs and returns. */
  failed: number;
  /** Delivery orders that had a courier assigned. */
  assigned: number;
  /** Delivery orders with an observed timeline — the denominator for everything below. */
  measured: number;
  /** Placement → handover. */
  avgMinutes: number | null;
  /** Placement → on the pass. */
  avgPrepMinutes: number | null;
  /** Courier at the counter → handover. */
  avgCourierMinutes: number | null;
  /** On the pass → courier assigned: how long an order waits for dispatch. */
  avgDispatchMinutes: number | null;
  onTime: number;
  onTimeRate: number | null;
}

/**
 * Everything `/admin/analytics` renders, over one window (Phase 16, G33).
 *
 * Composed rather than recomputed. `trade` is `lib/analytics.analyticsFor` — the
 * exact projection the restaurant's own analytics screen reads — run over every
 * restaurant's book instead of one; `money` is `lib/settlement.platformFinancials`
 * over the same set, which is what `/admin/payouts` reads. So the platform's
 * headline revenue is the sum of the numbers the restaurants can each see, and the
 * commission beneath it is the money the payout run will actually pay against
 * (§5.4). Nothing in this shape is derived from a rate or a percentage.
 */
export interface PlatformAnalytics {
  currency: string;
  range: AnalyticsRange;
  /** Order-side totals, series, peak hours and top products across the platform. */
  trade: VendorAnalytics;
  /** Money-side totals from the stamped per-order records. */
  money: PlatformFinancials;
  /** Restaurants that traded in the window, best revenue first. */
  vendors: VendorPerformance[];
  /** Couriers who carried something in the window, most deliveries first. */
  riders: RiderPerformance[];
  customers: CustomerActivity;
  delivery: DeliveryPerformance;
}
