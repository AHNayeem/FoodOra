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

/** One day in the revenue trend chart. */
export interface RevenuePoint {
  date: ISODate;
  /** Short locale-agnostic weekday key ("mon"…"sun") — the UI translates it. */
  dayKey: string;
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
