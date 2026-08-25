import type {
  FulfillmentType,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/types";
import { isFailure, isInKitchen, isTerminal, isWithRider } from "./order-machine";

/**
 * order-search.ts — asking the order set a question.
 *
 * Phase 4 needs `/admin/orders` to answer "show me every cash delivery from this
 * week that failed", and the honest way to build that is one pure predicate over
 * the shared store rather than a page full of `filter` chains. Everything here is
 * data and functions: no clock (callers pass `now`), no store, no i18n, so the
 * same query object can be serialised into a URL, replayed in a test, or handed
 * to a `WHERE` clause when Phase E moves this server-side.
 *
 * Deliberately *not* a second lifecycle. The status groups below are built from
 * `lib/order-machine`'s own predicates (`isInKitchen`, `isWithRider`,
 * `isTerminal`, `isFailure`) wherever one exists, so a new status joins the right
 * group by being classified once, in the machine, rather than by being remembered
 * here.
 */

/**
 * The coarse buckets an operator thinks in. `all` is absent on purpose — "no
 * group" is expressed as `group: null`, so an empty query means an empty filter.
 */
export type OrderStatusGroup =
  /** Anything still moving. */
  | "live"
  /** With the restaurant. */
  | "kitchen"
  /** With a courier. */
  | "delivering"
  /** Handed over, nobody has closed it (the settle queue). */
  | "awaiting"
  /** Closed, money worked out. */
  | "finished"
  /** Ended badly, in any of the five ways it can. */
  | "failed";

export const ORDER_STATUS_GROUPS: readonly OrderStatusGroup[] = [
  "live",
  "kitchen",
  "delivering",
  "awaiting",
  "finished",
  "failed",
];

/** Every status, in lifecycle order — the exact-status filter's options. */
export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  // Booked for later and not yet released (Phase 17, G34). First, because that is
  // where it sits in the lifecycle — before an order is `placed` with anybody.
  "scheduled",
  "placed",
  "confirmed",
  "preparing",
  "packing",
  "ready",
  "rider-assigned",
  "picked-up",
  "on-the-way",
  "arrived",
  "delivered",
  "completed",
  "rejected",
  "cancelled",
  "delivery-failed",
  "returned",
  "refunded",
];

/** Does a status belong to a group? Delegated to the machine where it can be. */
export function inStatusGroup(status: OrderStatus, group: OrderStatusGroup): boolean {
  switch (group) {
    case "live":
      return !isTerminal(status) && status !== "delivered";
    case "kitchen":
      return status === "placed" || status === "confirmed" || isInKitchen(status) || status === "ready";
    case "delivering":
      return isWithRider(status);
    case "awaiting":
      return status === "delivered";
    case "finished":
      return status === "completed";
    case "failed":
      return isFailure(status);
  }
}

/** How far back the list looks. Windows are half-open: `[start, now]`. */
export type OrderDateRange = "today" | "7d" | "30d" | "all";

export const ORDER_DATE_RANGES: readonly OrderDateRange[] = ["today", "7d", "30d", "all"];

/**
 * One question about the order set. Every member is nullable-or-neutral so a
 * fresh query matches everything, and each is independent of the others — the
 * filters compose rather than override.
 */
export interface OrderQuery {
  /** Free text over the order number, people, restaurant, courier and address. */
  text: string;
  group: OrderStatusGroup | null;
  status: OrderStatus | null;
  payment: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  fulfillment: FulfillmentType | null;
  range: OrderDateRange;
}

/** Matches everything. The starting point for any filter UI. */
export const EMPTY_ORDER_QUERY: OrderQuery = {
  text: "",
  group: null,
  status: null,
  payment: null,
  paymentStatus: null,
  fulfillment: null,
  range: "all",
};

/** Is anything actually being filtered? Drives the "clear filters" affordance. */
export function isEmptyQuery(query: OrderQuery): boolean {
  return (
    query.text.trim() === "" &&
    query.group === null &&
    query.status === null &&
    query.payment === null &&
    query.paymentStatus === null &&
    query.fulfillment === null &&
    query.range === "all"
  );
}

/**
 * Everything a search term is matched against.
 *
 * The courier and the address are in here because of who is searching: an
 * operator on a phone call has "the Banani one" or "Karim's delivery", not an
 * order number. Nothing is matched that the desk cannot legitimately see.
 */
function haystack(order: Order): string {
  return [
    order.orderNumber,
    order.id,
    order.contact.name,
    order.contact.phone,
    order.vendor.name,
    order.lifecycle.rider?.name ?? "",
    order.address?.area ?? "",
    order.address?.line1 ?? "",
    order.address?.recipient ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Does this order match a free-text term? Empty term matches everything. */
export function matchesOrderText(order: Order, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  // Every whitespace-separated word has to appear somewhere: "banani cash" is
  // an intersection, which is how a person expects two words to behave.
  return q.split(/\s+/).every((word) => haystack(order).includes(word));
}

/** Start of a date window in epoch ms, or null for "all time". */
export function rangeStartMs(range: OrderDateRange, now: number): number | null {
  if (range === "all") return null;
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - (range === "7d" ? 7 : 30) * 24 * 60 * 60_000;
}

/**
 * Apply a query. Newest first — an operations list is read from the top, unlike
 * the live board, which is worked from the oldest thing still waiting.
 */
export function filterOrders(orders: Order[], query: OrderQuery, now: number): Order[] {
  const from = rangeStartMs(query.range, now);
  return orders
    .filter((order) => {
      if (order.deletedAt) return false;
      if (from != null && Date.parse(order.placedAt) < from) return false;
      if (query.group && !inStatusGroup(order.status, query.group)) return false;
      if (query.status && order.status !== query.status) return false;
      if (query.payment && order.payment.method !== query.payment) return false;
      if (query.paymentStatus && order.payment.status !== query.paymentStatus) return false;
      if (query.fulfillment && order.fulfillment !== query.fulfillment) return false;
      return matchesOrderText(order, query.text);
    })
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}

/**
 * How many orders each group holds, over the query's *date window only* — the
 * counts on the group chips have to move with the date filter (a chip reading
 * "Failed 14" while the list is scoped to today is a lie) but must not move with
 * the group selection itself, or picking one would zero the others.
 */
export function countByGroup(
  orders: Order[],
  query: OrderQuery,
  now: number,
): Record<OrderStatusGroup, number> {
  const scoped = filterOrders(orders, { ...query, group: null, status: null }, now);
  const counts = {} as Record<OrderStatusGroup, number>;
  for (const group of ORDER_STATUS_GROUPS) {
    counts[group] = scoped.filter((order) => inStatusGroup(order.status, group)).length;
  }
  return counts;
}
