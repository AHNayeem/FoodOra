import type {
  DeliveryJob,
  DeliveryJobOrder,
  DeliveryStop,
  DeliveryJobStatus,
  DeliveryZone,
  Order,
  OrderRiderEarning,
  RiderVehicle,
} from "@/types";
import {
  computePayout,
  optimiseRoute,
  routeDistanceKm,
  routeMinutes,
  statusFromProgress,
  type LatLng,
  type UnroutedStop,
} from "./delivery";
import { hasReached, isFailure } from "./order-machine";
import { timeOf } from "./order-lifecycle";

/**
 * delivery-bridge.ts — one delivery reality (G39).
 *
 * The prototype grew two: a `DeliveryJob` (synthesised, multi-stop, what pays
 * the rider and fills their wallet) and an `Order` (real, what a customer
 * placed and a restaurant cooked). They shared no code and no records, so a
 * rider could hold one of each at the same time, and delivering a real
 * customer's food earned nothing at all.
 *
 * This module is the bridge, and it goes one way on purpose: the **order is the
 * authority** and a job is *derived* from it. Nothing is copied into a second
 * store to drift out of date — ask for a real order's trip and you get one built
 * from the order as it stands right now. That is what lets the whole rider app
 * (earnings, history, wallet, cash-in-hand, remittance liability) keep running on
 * `DeliveryJob` while the truth lives on the order, with no screen having to know
 * which kind of work it is looking at.
 *
 * Pure, like the rest of `lib/`. A real order carries no coordinates — a
 * `DeliveryAddress` is a postal snapshot — so the caller resolves the two ends of
 * the ride and passes them in (`services/delivery` does it from the seed's zone
 * geography). Distance, ETA and pay then come from the same geometry and the same
 * `computePayout` a synthesised trip uses, which is the point: one payout
 * formula, so a real delivery and an invented one beside it are paid alike.
 */

/** One end of the ride, resolved by the caller from the order's postal detail. */
export interface TripPlace extends LatLng {
  address: string;
  area: string;
  phone: string;
}

export interface OrderTripInput {
  /** The zone whose fares apply — normally the drop area's. */
  zone: DeliveryZone;
  /** What the rider is riding: decides leg times, not pay. */
  vehicle: RiderVehicle;
  pickup: TripPlace;
  dropoff: TripPlace;
  /** Used only for a trip that has not been delivered yet — see `payoutAt`. */
  now?: number;
}

/** The trip id for an order. Namespaced so it cannot collide with a seeded one. */
export function orderJobId(orderId: string): string {
  return `job_${orderId}`;
}

/** Is this trip a real customer's order rather than a synthesised one? */
export function isOrderJob(job: DeliveryJob): boolean {
  return job.orders.length === 1 && job.id === orderJobId(job.orders[0].orderId);
}

/**
 * Cash the order puts in the rider's bag, in the order currency.
 *
 * Deliberately *not* `cashDueOn`: that answers "is there still money to
 * collect", which goes to zero the moment the handoff commits. This answers
 * "did this order involve cash", which is what the wallet, the cash position and
 * the remittance liability need to keep saying afterwards (G05). A refunded
 * order carries nothing — the money went back.
 */
export function cashCarriedOn(order: Order): number {
  if (order.payment.method !== "cash") return 0;
  return order.payment.status === "refunded" ? 0 : order.pricing.total;
}

/**
 * When the trip's pay is fixed: the moment of the handoff, falling back to `now`
 * for one still in progress.
 *
 * This matters more than it looks. Peak pay depends on the hour, so computing a
 * delivered trip's payout from the current clock would quietly change what a
 * rider was paid every time a screen re-read it — and would disagree with the
 * `OrderRiderEarning` stamped at completion. Anchoring to the delivery makes the
 * two identical by construction.
 */
function payoutAt(order: Order, now: number): number {
  return timeOf(order, "delivered") ?? now;
}

/** The stops of a real order's trip: collect from the vendor, hand to the customer. */
function stopsFor(order: Order, input: OrderTripInput): UnroutedStop[] {
  const jobId = orderJobId(order.id);
  const cash = cashCarriedOn(order);
  const shared = { orderId: order.id, orderNumber: order.orderNumber };

  return [
    {
      ...shared,
      id: `${jobId}_pickup`,
      kind: "pickup",
      name: order.vendor.name,
      address: input.pickup.address,
      area: input.pickup.area,
      phone: input.pickup.phone,
      lat: input.pickup.lat,
      lng: input.pickup.lng,
      instructions: order.notes,
      otp: null,
      cashDue: 0,
    },
    {
      ...shared,
      id: `${jobId}_dropoff`,
      kind: "dropoff",
      name: order.contact.name,
      address: input.dropoff.address,
      area: input.dropoff.area,
      phone: order.contact.phone,
      lat: input.dropoff.lat,
      lng: input.dropoff.lng,
      instructions: order.address?.instructions ?? null,
      /**
       * The order's *own* handoff code, not a freshly derived one. The customer's
       * tracker, the doorstep dialog and this trip record therefore show the same
       * four digits because they read the same field — the one thing the two
       * delivery systems were never able to agree on.
       */
      otp: order.lifecycle.otp,
      cashDue: cash,
    },
  ];
}

/**
 * Stops the rider has actually completed, read off the order's event log.
 *
 * Derived rather than stored, because the order already records it: an order
 * that reached `picked-up` was collected, one that reached `delivered` was handed
 * over. `hasReached` reads the log, so an order that failed a handoff and came
 * back still counts the pickup it genuinely made.
 */
function completedStopIdsFor(order: Order, stops: DeliveryStop[]): string[] {
  const done: string[] = [];
  const [pickup, dropoff] = stops;
  if (hasReached(order, "picked-up")) done.push(pickup.id);
  if (hasReached(order, "delivered")) done.push(dropoff.id);
  return done;
}

/**
 * The trip status an order's progress implies.
 *
 * The stops decide, through the same `statusFromProgress` a hand-ticked trip goes
 * through — there is no second status table for real orders. Only the two things
 * stops cannot express are answered here: a trip nobody has taken yet, and one
 * that ended badly.
 */
export function jobStatusFor(
  order: Order,
  stops: DeliveryStop[],
  done: string[],
): DeliveryJobStatus {
  if (isFailure(order.status) || order.status === "returned") return "cancelled";
  if (!order.lifecycle.rider) return "offered";
  return statusFromProgress({ status: "accepted", stops, completedStopIds: done });
}

/**
 * The trip behind a real order.
 *
 * Everything is derived, so calling this twice on the same order gives the same
 * trip — including its id, which is what lets the rider's history dedupe a real
 * delivery against itself instead of showing it twice.
 *
 * A trip built here is never in the offer pool: a real order is offered *as an
 * order* (`dispatchableOrders`), because taking it has to assign the rider on the
 * order itself. `offeredAt` / `expiresAt` are filled from the order's own moments
 * so the shape is complete, not because anything counts down.
 */
export function jobFromOrder(order: Order, input: OrderTripInput): DeliveryJob {
  const { zone, vehicle } = input;
  const now = input.now ?? Date.now();

  const routed = optimiseRoute(input.pickup, stopsFor(order, input), vehicle);
  const distanceKm = routeDistanceKm(routed);
  const done = completedStopIdsFor(order, routed);

  const readyMs = timeOf(order, "ready") ?? Date.parse(order.placedAt);
  const assignedMs = order.lifecycle.assignedAt
    ? Date.parse(order.lifecycle.assignedAt)
    : null;
  const deliveredMs = timeOf(order, "delivered");

  const jobOrder: DeliveryJobOrder = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    vendorId: order.vendor.id,
    vendorName: order.vendor.name,
    customerName: order.contact.name,
    itemCount: order.lines.reduce((n, l) => n + l.quantity, 0),
    orderTotal: order.pricing.total,
    paymentMethod: order.payment.method,
    cashDue: cashCarriedOn(order),
  };

  return {
    id: orderJobId(order.id),
    createdAt: order.placedAt,
    updatedAt: order.updatedAt,
    deletedAt: null,
    // The rider sees the customer's reference on their own trip, so a question
    // about either one can be answered by looking at the other.
    jobNumber: `TRP-${order.orderNumber.replace(/^FO-/, "")}`,
    riderId: order.lifecycle.rider?.id ?? null,
    zoneId: zone.id,
    currency: order.pricing.currency,
    orders: [jobOrder],
    stops: routed,
    status: jobStatusFor(order, routed, done),
    distanceKm,
    estimatedMinutes: routeMinutes(routed),
    /**
     * The pay that was recorded at completion wins. A completed order's rider
     * earning is a stored fact (Phase 2), so re-deriving it here would be the
     * books restating themselves — and the two would differ the moment a peak
     * hour ended.
     */
    payout:
      order.lifecycle.financials?.riderEarning?.payout ??
      computePayout({
        zone,
        distanceKm,
        orderCount: 1,
        tips: order.pricing.tip,
        at: new Date(payoutAt(order, now)),
      }),
    cashToCollect: jobOrder.cashDue,
    offeredAt: new Date(readyMs).toISOString(),
    expiresAt: new Date(assignedMs ?? readyMs).toISOString(),
    acceptedAt: assignedMs ? new Date(assignedMs).toISOString() : null,
    completedAt: deliveredMs ? new Date(deliveredMs).toISOString() : null,
    cancelledAt: isFailure(order.status) ? order.updatedAt : null,
    completedStopIds: done,
  };
}

/**
 * What the rider earned on this order — the record the `completed` transition
 * stamps onto the order's financials (G04).
 *
 * Takes the trip rather than recomputing pay, so the rider's wallet and the
 * order's books are the same number by construction. Null when nobody delivered
 * it: a pickup order, or one that never got a courier.
 */
export function riderEarningFrom(order: Order, job: DeliveryJob): OrderRiderEarning | null {
  const rider = order.lifecycle.rider;
  if (!rider) return null;
  return {
    riderId: rider.id,
    riderName: rider.name,
    currency: job.payout.currency,
    payout: job.payout,
    cashCollected: cashCarriedOn(order),
  };
}
