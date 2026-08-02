import type {
  Order,
  OrderCancelReason,
  OrderLifecycle,
  OrderRider,
  OrderStatus,
  Rider,
} from "@/types";
import { otpFor } from "./delivery";
import { isFailure, isTerminal, stagesFor, stageIndex } from "./order-machine";

/**
 * order-lifecycle.ts — building and reading the lifecycle record.
 *
 * `lib/order-machine.ts` owns *transitions*; this module owns everything around
 * them: creating the initial record, migrating an order that predates it,
 * turning a `Rider` into the public snapshot the customer sees, choosing which
 * rider dispatch offers a job to, and the small derived reads (countdowns,
 * active/past split) that three surfaces would otherwise each reinvent.
 *
 * Kept separate from the machine so the machine stays free of mock-data imports
 * and can be reasoned about — and eventually run server-side — on its own.
 */

/** Preparation times a restaurant may promise, minutes (spec §2). */
export const PREP_TIME_OPTIONS = [15, 25, 35] as const;

/** Extra time a restaurant may ask for, minutes (spec: "Need More Time"). */
export const DELAY_OPTIONS = [5, 10, 15] as const;

/** Reasons a restaurant may refuse an order at intake. */
export const REJECT_REASONS: readonly OrderCancelReason[] = [
  "out-of-stock",
  "too-busy",
  "closing-soon",
  "cannot-deliver",
  "other",
];

/** Reasons a customer may give for cancelling. */
export const CUSTOMER_CANCEL_REASONS: readonly OrderCancelReason[] = [
  "changed-mind",
  "too-slow",
  "ordered-by-mistake",
  "duplicate",
  "other",
];

/** Reasons a handoff can fail on the doorstep. */
export const DELIVERY_FAIL_REASONS: readonly OrderCancelReason[] = [
  "customer-unavailable",
  "wrong-address",
  "refused-delivery",
  "other",
];

// ---------------------------------------------------------------------------
// Construction + migration
// ---------------------------------------------------------------------------

/**
 * The lifecycle a freshly placed order starts with. The OTP is issued *now*
 * (derived from the order id so the rider app can reach the same value without
 * a backend) but is not revealed to anyone until the rider arrives — see
 * `isOtpRevealed`.
 */
export function createLifecycle(orderId: string, placedAt: string): OrderLifecycle {
  return {
    events: [
      {
        id: `evt_${orderId}_placed`,
        status: "placed",
        at: placedAt,
        actor: "customer",
        note: null,
      },
    ],
    prepMinutes: null,
    promisedReadyAt: null,
    delayMinutes: 0,
    rejectionReason: null,
    cancelReason: null,
    cancelledBy: null,
    failureReason: null,
    rider: null,
    assignment: null,
    assignedAt: null,
    rejectedRiderIds: [],
    otp: otpFor(orderId),
    otpAttempts: 0,
    otpVerifiedAt: null,
    refund: "none",
    refundAmount: 0,
    rating: null,
  };
}

/**
 * Reconstruct a plausible lifecycle for an order that only has a status and two
 * timestamps.
 *
 * Two callers need this and they need the same answer: the persisted-store
 * migration (orders placed by an older build have no event log) and the vendor's
 * synthesised week of history (which is generated from a status, not walked).
 * Both would otherwise render an empty timeline for an order that plainly got
 * somewhere.
 *
 * The stages the order passed through are spread evenly between placement and
 * its ETA. That is an approximation and is meant to be — it is reconstructing a
 * history nobody recorded, not inventing one that will be presented as precise.
 */
export function synthesiseLifecycle(order: Order): OrderLifecycle {
  const placedMs = Date.parse(order.placedAt);
  const life = createLifecycle(order.id, order.placedAt);
  const stages = stagesFor(order.fulfillment);
  const idx = stageIndex(order.status, order.fulfillment);

  if (idx > 0) {
    const span = Math.max(Date.parse(order.estimatedDeliveryAt) - placedMs, 60_000);
    for (let i = 1; i <= idx; i++) {
      const at = new Date(placedMs + (i / stages.length) * span).toISOString();
      life.events.push({
        id: `evt_${order.id}_${stages[i]}_bf`,
        status: stages[i],
        at,
        actor: actorForStage(stages[i]),
        note: null,
      });
    }
    life.prepMinutes = 25;
    life.promisedReadyAt = new Date(placedMs + 25 * 60_000).toISOString();
    if (stages.slice(0, idx + 1).includes("delivered")) {
      life.otpVerifiedAt = new Date(placedMs + span).toISOString();
    }
  } else if (isFailure(order.status)) {
    const byRestaurant = order.status === "rejected";
    life.events.push({
      id: `evt_${order.id}_${order.status}_bf`,
      status: order.status,
      at: order.updatedAt,
      actor: byRestaurant ? "restaurant" : "customer",
      note: null,
    });
    life.cancelledBy = byRestaurant ? "restaurant" : "customer";
    if (byRestaurant) life.rejectionReason = "too-busy";
    else life.cancelReason = "changed-mind";
  }

  return life;
}

/**
 * Backfill an order that has no lifecycle — one persisted by a build that
 * predates it. Idempotent: an order that already has an event log is returned
 * untouched.
 */
export function ensureLifecycle(order: Order): Order {
  if (order.lifecycle?.events?.length) return order;
  return { ...order, lifecycle: synthesiseLifecycle(order) };
}

/** The actor a stage is normally performed by — used only when backfilling. */
function actorForStage(status: OrderStatus): OrderLifecycle["events"][number]["actor"] {
  switch (status) {
    case "placed":
      return "customer";
    case "confirmed":
    case "preparing":
    case "packing":
    case "ready":
      return "restaurant";
    case "rider-assigned":
      return "system";
    case "completed":
      return "system";
    default:
      return "rider";
  }
}

/** Public snapshot of a rider — what the customer's tracker is allowed to see. */
export function riderSnapshot(rider: Rider): OrderRider {
  return {
    id: rider.id,
    name: rider.name,
    phone: rider.phone,
    vehicle: rider.vehicle,
    plate: rider.plate,
    rating: rider.rating,
    trips: rider.trips,
    photo: rider.photo,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Pick a rider for an order (spec §4: "System assigns rider automatically (Mock
 * Logic)").
 *
 * The mock logic is deliberately explainable rather than clever: prefer riders
 * in the vendor's zone, drop anyone who has already turned this job down, and
 * rank by rating × acceptance rate. Deterministic — the same order always gets
 * the same rider, so a reload during a demo does not swap the courier out.
 */
export function dispatchRider(
  order: Order,
  fleet: Rider[],
  zoneId: string | null,
): Rider | null {
  const excluded = new Set(order.lifecycle.rejectedRiderIds);
  const eligible = fleet.filter((r) => !r.deletedAt && !excluded.has(r.id));
  if (eligible.length === 0) return null;

  const inZone = zoneId ? eligible.filter((r) => r.zoneId === zoneId) : [];
  const pool = inZone.length > 0 ? inZone : eligible;

  return [...pool].sort(
    (a, b) => b.rating * b.acceptanceRate - a.rating * a.acceptanceRate,
  )[0];
}

// ---------------------------------------------------------------------------
// Derived reads
// ---------------------------------------------------------------------------

/** Still moving — neither finished nor failed. */
export function isActive(order: Order): boolean {
  return !isTerminal(order.status) && order.status !== "delivered";
}

/** Split a feed into what the customer's dashboard calls active vs past. */
export function splitOrders(orders: Order[]): { active: Order[]; past: Order[] } {
  return {
    active: orders.filter(isActive),
    past: orders.filter((o) => !isActive(o)),
  };
}

/** Milliseconds until the promised ready time; negative once it is overdue. */
export function readyInMs(order: Order, now: number): number | null {
  if (!order.lifecycle.promisedReadyAt) return null;
  return Date.parse(order.lifecycle.promisedReadyAt) - now;
}

/** Milliseconds until the ETA, clamped at zero. */
export function etaInMs(order: Order, now: number): number {
  return Math.max(0, Date.parse(order.estimatedDeliveryAt) - now);
}

/** Whole minutes, rounded up, for a countdown display. */
export function toMinutes(ms: number): number {
  return Math.max(0, Math.ceil(ms / 60_000));
}

/**
 * 0..1 through the promised preparation window — the kitchen progress bar the
 * customer watches while the food is being cooked.
 */
export function prepFraction(order: Order, now: number): number {
  const { prepMinutes, promisedReadyAt } = order.lifecycle;
  if (!prepMinutes || !promisedReadyAt) return 0;
  const end = Date.parse(promisedReadyAt);
  const start = end - prepMinutes * 60_000;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** When the order reached a given status, or null if it never did. */
export function timeOf(order: Order, status: OrderStatus): number | null {
  const event = order.lifecycle.events.find((e) => e.status === status);
  return event ? Date.parse(event.at) : null;
}

/** The most recent event, which is what the "last updated" line reads from. */
export function lastEvent(order: Order) {
  return order.lifecycle.events[order.lifecycle.events.length - 1] ?? null;
}
