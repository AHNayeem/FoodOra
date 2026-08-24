import type { ISODate } from "./common";

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
