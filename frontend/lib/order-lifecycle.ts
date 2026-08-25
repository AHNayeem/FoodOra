import type {
  Order,
  OrderCancelReason,
  OrderLifecycle,
  OrderRider,
  OrderStatus,
  Rider,
} from "@/types";
import { handoverCodeFor, otpFor } from "./delivery";
import { eventWithDetail } from "./order-events";
import { isFailure, isTerminal, stagesFor, stageIndex } from "./order-machine";
import { settleOrder } from "./settlement";

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
 *
 * `status` is the state the order is *born* in, and there are exactly two: an
 * ASAP order starts at `placed`, a scheduled one at `scheduled` (Phase 17, G34).
 * It is a parameter rather than a second constructor because everything else
 * about the record is identical — the code is issued at checkout either way, and
 * a scheduled order that reached the door with no OTP would be the kind of
 * divergence a second lifecycle produces.
 */
export function createLifecycle(
  orderId: string,
  placedAt: string,
  status: OrderStatus = "placed",
): OrderLifecycle {
  return {
    events: [
      {
        id: `evt_${orderId}_${status}`,
        status,
        at: placedAt,
        actor: "customer",
        detail: null,
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
    // The counter's handover code is not stored: it belongs to the *assignment*,
    // so it is derived from the order and the courier on demand — see
    // `handoverCodeOf` below. What is stored is what happened at the counter.
    handoverAttempts: 0,
    handoverVerifiedAt: null,
    handoverChecks: [],
    refund: "none",
    refundAmount: 0,
    refundMethod: null,
    refundDecidedAt: null,
    refundSettledAt: null,
    rating: null,
    // Nothing financial has happened yet — the `completed` transition stamps it.
    financials: null,
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
        id: `evt_${order.id}_${stages[i]}${BACKFILL_EVENT_SUFFIX}`,
        status: stages[i],
        at,
        actor: actorForStage(stages[i]),
        detail: null,
      });
    }
    life.prepMinutes = 25;
    life.promisedReadyAt = new Date(placedMs + 25 * 60_000).toISOString();
    if (stages.slice(0, idx + 1).includes("delivered")) {
      life.otpVerifiedAt = new Date(placedMs + span).toISOString();
    }
    // An order that is already `completed` has already had its money worked out
    // — a backfilled one must carry the same record a live completion stamps, or
    // it would be missing from every settlement it belongs in.
    if (order.status === "completed") {
      life.financials = settleOrder(order, { now: Date.parse(order.updatedAt) });
    }
  } else if (isFailure(order.status)) {
    const byRestaurant = order.status === "rejected";
    life.events.push({
      id: `evt_${order.id}_${order.status}${BACKFILL_EVENT_SUFFIX}`,
      status: order.status,
      at: order.updatedAt,
      actor: byRestaurant ? "restaurant" : "customer",
      detail: null,
    });
    life.cancelledBy = byRestaurant ? "restaurant" : "customer";
    if (byRestaurant) life.rejectionReason = "too-busy";
    else life.cancelReason = "changed-mind";
  }

  return life;
}

/**
 * Marks an event this module *reconstructed* rather than one the machine
 * recorded when it happened.
 *
 * `synthesiseLifecycle` divides the span from placement to the ETA evenly across
 * the stages, because it has nothing else to divide it by — the order it is
 * backfilling was generated with two timestamps and a status, and there is no
 * record of when the kitchen actually finished. That produces a timeline that is
 * fine for a progress bar and worthless as a measurement: every backfilled
 * delivery took exactly as long as its estimate, so a report that averaged them
 * would publish an on-time rate of 100% and mean nothing by it.
 *
 * The suffix is minted here and read by `hasObservedTimeline`, so the two cannot
 * drift. `lib/mock/demo-orders` and `lib/order-machine` mint their own ids and
 * carry no suffix, which is the distinction that matters: those timings were
 * either authored as a working set or actually walked on this device.
 */
export const BACKFILL_EVENT_SUFFIX = "_bf";

/**
 * Did this order's timeline come from something that watched it happen?
 *
 * False for a reconstruction. The only callers are the ones that measure
 * *durations* — Phase 16's delivery-performance panel — and they exclude the
 * reconstructed orders and say on screen how many they measured over, rather
 * than quoting an average that is really the seed's arithmetic (§5.4).
 *
 * Counts are a different question and use every order: an order was cancelled
 * whether or not anyone timed it.
 */
export function hasObservedTimeline(order: Order): boolean {
  const events = order.lifecycle?.events;
  if (!events?.length) return false;
  return !events.some((event) => event.id.endsWith(BACKFILL_EVENT_SUFFIX));
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

/**
 * Backfill the financial fields on an order persisted before commission existed
 * (G01/G02): the rate the order was placed under, and — for one already
 * `completed` — the commission record its completion would have stamped.
 *
 * The rate has to be *given*, not guessed: it belongs to the vendor and only a
 * caller with the vendor list can resolve it. `fallbackRate` is the standard
 * platform rate, which is the honest answer for an order whose vendor has since
 * been removed.
 *
 * Idempotent — an order that already has a rate and a record is returned as is.
 */
export function ensureFinancials(order: Order, fallbackRate: number): Order {
  const commissionRate = order.commissionRate ?? fallbackRate;
  const financials =
    order.lifecycle.financials ??
    (order.status === "completed"
      ? settleOrder(
          { ...order, commissionRate },
          { now: Date.parse(order.updatedAt) || Date.now() },
        )
      : null);
  if (order.commissionRate === commissionRate && order.lifecycle.financials === financials) {
    return order;
  }
  return { ...order, commissionRate, lifecycle: { ...order.lifecycle, financials } };
}

/**
 * Backfill the refund record on an order persisted before the refund lifecycle
 * existed (Phase 5, G07).
 *
 * Two shapes come out of the old build and they need different answers:
 *
 *  - `refund: "approved"` was only ever written by the `refunded` transition,
 *    which ran *after* the wallet had actually been credited. That is a settled
 *    refund, so it becomes `refunded` with the money's date.
 *  - `payment.status: "refunded"` with no refund record at all is the old
 *    instant flip on cancelling a paid order. The customer was already told the
 *    money was back, so it is recorded as back rather than quietly reopened — a
 *    migration must not turn a closed refund into a new liability.
 *
 * Idempotent: an order that already carries the fields is returned untouched.
 */
export function ensureRefundRecord(order: Order): Order {
  const life = order.lifecycle;
  if (life.refundMethod !== undefined && life.refundSettledAt !== undefined) {
    // Already the new shape; only the stale `approved` needs re-reading.
    if (life.refund !== "approved" || life.refundSettledAt === null) return order;
  }

  const settledAt = order.updatedAt;
  const wasSettled = life.refund === "approved" || order.payment.status === "refunded";
  const refund = wasSettled ? "refunded" : (life.refund ?? "none");
  const amount =
    refund === "none" || refund === "rejected"
      ? (life.refundAmount ?? 0)
      : life.refundAmount || order.pricing.total;

  return {
    ...order,
    lifecycle: {
      ...life,
      refund,
      refundAmount: amount,
      refundMethod: refund === "none" ? null : (life.refundMethod ?? order.payment.method),
      refundDecidedAt: refund === "none" || refund === "requested" ? null : settledAt,
      refundSettledAt: refund === "refunded" ? settledAt : null,
    },
  };
}

/**
 * Backfill the handover record on an order persisted before the counter check
 * existed (Phase 10, G22).
 *
 * An order that already reached `picked-up` was handed over — nobody verified it,
 * because there was nothing to verify, and pretending otherwise would be inventing
 * a check that never happened. So the timestamp is the `picked-up` event's own,
 * and `handoverChecks` stays **empty**: an old handover is recorded as having
 * happened and as having no checklist behind it, which is the truth and is
 * distinguishable on screen from one that was checked.
 *
 * Idempotent: an order that already carries the fields is returned untouched.
 */
export function ensureHandoverRecord(order: Order): Order {
  const life = order.lifecycle;
  if (life.handoverVerifiedAt !== undefined && life.handoverAttempts !== undefined) {
    return order;
  }
  const pickedUp = life.events?.find((e) => e.status === "picked-up") ?? null;
  return {
    ...order,
    lifecycle: {
      ...life,
      handoverAttempts: life.handoverAttempts ?? 0,
      handoverVerifiedAt: life.handoverVerifiedAt ?? pickedUp?.at ?? null,
      handoverChecks: life.handoverChecks ?? [],
    },
  };
}

/**
 * Backfill the typed event details on an order persisted before them (Phase 18,
 * G45).
 *
 * Every event in an old store carries `note: "delay:15"` and no `detail`, and
 * every reader now switches on `detail.kind` — so without this an order placed
 * yesterday renders a timeline with every annotation missing. The encoding is
 * read by `lib/order-events`, which is the only module that still knows it.
 *
 * Idempotent, and it rewrites the array only when something actually changed, so
 * a store that has already migrated keeps its object identity and the selectors
 * over it do not re-run.
 */
export function ensureEventDetails(order: Order): Order {
  const events = order.lifecycle?.events;
  if (!events?.length) return order;
  const converted = events.map((event) => eventWithDetail(order, event));
  const changed = converted.some((event, i) => event !== events[i]);
  if (!changed) return order;
  return { ...order, lifecycle: { ...order.lifecycle, events: converted } };
}

/**
 * The handover code for this order, bound to whoever is carrying it.
 *
 * A one-line bind of `lib/delivery.handoverCodeFor` to the order, so no surface
 * has to know that the code is keyed on the *courier* as well as the order. Null
 * until dispatch has chosen somebody.
 */
export function handoverCodeOf(order: Order): string | null {
  return handoverCodeFor(order.id, order.lifecycle.rider?.id ?? null);
}

/** The actor a stage is normally performed by — used only when backfilling. */
function actorForStage(status: OrderStatus): OrderLifecycle["events"][number]["actor"] {
  switch (status) {
    case "scheduled":
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
 *
 * `unavailable` is who cannot take work right now — off shift, or already
 * carrying something (G40). It is *injected* rather than looked up because
 * availability spans two stores (the shift board and the live orders) and this
 * module stays free of both, exactly as it stays free of the mock data it ranks.
 */
export function dispatchRider(
  order: Order,
  fleet: Rider[],
  zoneId: string | null,
  unavailable: ReadonlySet<string> = new Set(),
): Rider | null {
  const excluded = new Set(order.lifecycle.rejectedRiderIds);
  const eligible = fleet.filter(
    (r) => !r.deletedAt && !excluded.has(r.id) && !unavailable.has(r.id),
  );
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

// ---------------------------------------------------------------------------
// Attention — which orders an operations desk should be looking at
// ---------------------------------------------------------------------------

/** A `placed` order nobody has answered for this long is overdue an answer. */
const UNANSWERED_MS = 4 * 60_000;

/** Food on the pass this long with no courier coming is going cold. */
const NO_RIDER_MS = 5 * 60_000;

/**
 * Why an order needs an operator, or null when it does not.
 *
 * `key` is the i18n key under the admin namespace and `minutes` is how long it
 * has been in that state — the rule and its measurement, with the sentence left
 * to the surface. It was previously written twice inside `live-ops.tsx` (once as
 * a filter, once as a label), which is two chances for "stuck" to mean two
 * things; Phase 4 needs the same answer on the orders list, so it lives here.
 *
 * Derived from the clock and the event log, never flagged on the order, so it
 * cannot go stale and no writer has to remember to clear it.
 */
export interface StuckReason {
  key: "stuckFailed" | "stuckUnanswered" | "stuckNoRider" | "stuckOverdue";
  /** Minutes in the state. Zero where the message needs no number. */
  minutes: number;
}

export function stuckReason(order: Order, now: number): StuckReason | null {
  // A finished order cannot be stuck, and a delivered one is waiting on a person
  // rather than blocked — that has its own queue (`awaitingCompletion`).
  if (isTerminal(order.status) || order.status === "delivered") return null;

  if (order.status === "delivery-failed") return { key: "stuckFailed", minutes: 0 };

  if (order.status === "placed") {
    const waiting = now - Date.parse(order.placedAt);
    return waiting > UNANSWERED_MS
      ? { key: "stuckUnanswered", minutes: toMinutes(waiting) }
      : null;
  }

  if (order.status === "ready") {
    // Only a delivery order can be waiting for a courier; a pickup order on the
    // pass is waiting for its customer, which is not the platform's problem.
    if (order.fulfillment !== "delivery") return null;
    const readyAt = timeOf(order, "ready");
    const waiting = readyAt == null ? 0 : now - readyAt;
    return waiting > NO_RIDER_MS
      ? { key: "stuckNoRider", minutes: toMinutes(waiting) }
      : null;
  }

  const remaining = readyInMs(order, now);
  return remaining != null && remaining < 0
    ? { key: "stuckOverdue", minutes: toMinutes(-remaining) }
    : null;
}

/** Does this order need an operator right now? */
export function isStuck(order: Order, now: number): boolean {
  return stuckReason(order, now) !== null;
}

/** Everything needing attention, worst-waited first. */
export function stuckOrders(orders: Order[], now: number): Order[] {
  return orders
    .filter((order) => isStuck(order, now))
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
}
