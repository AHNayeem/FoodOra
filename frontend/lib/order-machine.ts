import type {
  FulfillmentType,
  HandoverCheck,
  Order,
  OrderActor,
  OrderEvent,
  OrderLifecycle,
  OrderRiderEarning,
  OrderStatus,
  RefundMethod,
} from "@/types";
import { handoverCodeFor, handoverMatches } from "./delivery";
import { settleOrder } from "./settlement";

/**
 * order-machine.ts — the one place an order's lifecycle is defined.
 *
 * Before this module the prototype had three disagreeing notions of "what state
 * is this order in": the customer's tracker interpolated it from the clock, the
 * vendor board advanced a local array, and the rider app tracked stops on an
 * unrelated record. Nothing enforced that a transition was legal, and nothing
 * recorded who made it.
 *
 * Everything now goes through here:
 *
 *  - `TRANSITIONS` declares which statuses may follow which. It is a graph, not
 *    a list, because the lifecycle genuinely branches (a failed handoff either
 *    retries or returns) and rejoins.
 *  - `ACTORS` declares who may make each transition. The restaurant cannot mark
 *    an order delivered; the rider cannot accept it on the kitchen's behalf.
 *  - `transition()` is pure: `(order, to, actor, patch) → Order | error`. It
 *    appends the event, stamps the derived fields (promised time, OTP verified
 *    at, payment settle on delivery) and never mutates its input.
 *
 * Pure and side-effect free by design — the store commits the result, the
 * notification layer reads the emitted event, and Phase E moves the same table
 * server-side without the UI noticing.
 */

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/** Statuses that end the order — nothing follows them. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "completed",
  "rejected",
  "cancelled",
  "returned",
  "refunded",
];

/**
 * Legal successors of each status. A delivery order walks the long path; a
 * pickup order short-circuits at `ready` (see `stagesFor`), which is why `ready`
 * lists both `rider-assigned` and `delivered`.
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // A scheduled order is waiting for its slot, not for a person. Releasing it is
  // the *only* forward move — the kitchen cannot accept what it has not been
  // given — and the customer can still call it off while it waits (G34).
  scheduled: ["placed", "cancelled"],
  placed: ["confirmed", "rejected", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["packing", "cancelled"],
  packing: ["ready", "cancelled"],
  // Delivery orders wait for a courier; pickup orders are collected in person.
  ready: ["rider-assigned", "delivered", "cancelled"],
  // A rider can hand the job back before collecting — dispatch starts again.
  "rider-assigned": ["picked-up", "ready", "cancelled"],
  "picked-up": ["on-the-way"],
  "on-the-way": ["arrived", "delivery-failed"],
  arrived: ["delivered", "delivery-failed"],
  delivered: ["completed"],
  // A failed handoff either goes back for another attempt, or back to the shop.
  "delivery-failed": ["on-the-way", "returned"],
  completed: [],
  rejected: ["refunded"],
  cancelled: ["refunded"],
  returned: ["refunded"],
  refunded: [],
};

/**
 * Who is allowed to make each transition. `system` is dispatch and the demo
 * autopilot; `admin` may make any transition, so it is not listed per entry.
 */
export const ACTORS: Record<OrderStatus, readonly OrderActor[]> = {
  // Nothing transitions *into* `scheduled` — checkout mints an order there. The
  // entry exists because the table is exhaustive, and `customer` is who put it
  // there, so an admin's `adminActions` reads consistently.
  scheduled: ["customer"],
  placed: ["customer", "system"],
  confirmed: ["restaurant"],
  preparing: ["restaurant"],
  packing: ["restaurant"],
  ready: ["restaurant", "rider", "system"],
  "rider-assigned": ["system", "restaurant", "rider"],
  "picked-up": ["rider", "restaurant"],
  "on-the-way": ["rider"],
  arrived: ["rider", "system"],
  delivered: ["rider", "restaurant"],
  completed: ["system", "customer"],
  rejected: ["restaurant"],
  cancelled: ["customer", "restaurant"],
  "delivery-failed": ["rider"],
  returned: ["rider", "restaurant"],
  refunded: ["system"],
};

/** Reached the end of the road. */
export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Ended badly — used for tone (danger vs success) and for analytics. */
export function isFailure(status: OrderStatus): boolean {
  return (
    status === "rejected" ||
    status === "cancelled" ||
    status === "returned" ||
    status === "refunded" ||
    status === "delivery-failed"
  );
}

/** Past the point where the kitchen has committed ingredients. */
export function isInKitchen(status: OrderStatus): boolean {
  return status === "preparing" || status === "packing";
}

/** The order is with a courier. */
export function isWithRider(status: OrderStatus): boolean {
  return (
    status === "rider-assigned" ||
    status === "picked-up" ||
    status === "on-the-way" ||
    status === "arrived" ||
    status === "delivery-failed"
  );
}

// ---------------------------------------------------------------------------
// Scheduling (Phase 17, G34)
// ---------------------------------------------------------------------------

/**
 * How long before the promised slot a scheduled order is handed to the kitchen,
 * in minutes.
 *
 * Not an arbitrary buffer: it is the longest preparation time a restaurant may
 * promise (`PREP_TIME_OPTIONS`'s 35) plus the ride allowance, rounded down to the
 * point where the two together still land inside the slot. Releasing earlier
 * would put food on the pass before anyone wants it — which is precisely the bug
 * G34 describes, a scheduled order behaving like an ASAP one — and releasing
 * later would guarantee it is late.
 */
export const SCHEDULE_LEAD_MINUTES = 45;

/**
 * When this order should be released to the restaurant (ms), or null if it is
 * not scheduled.
 *
 * Derived from the slot rather than stored, for the same reason `stuckReason` is
 * derived from the clock: a stored release time is a second fact that can
 * disagree with the first, and nothing would be responsible for correcting it if
 * the slot were ever changed.
 */
export function releaseAt(order: Order): number | null {
  if (!order.scheduledFor) return null;
  return Date.parse(order.scheduledFor) - SCHEDULE_LEAD_MINUTES * 60_000;
}

/**
 * Should this order be released now?
 *
 * The whole of the release rule, in one place, so the store's sweep and any
 * surface that wants to say "opens in 20 minutes" are answering the same
 * question. An order whose slot has already passed is due immediately — a device
 * that was closed over the slot must not silently drop the order.
 */
export function isDueForRelease(order: Order, now: number): boolean {
  if (order.status !== "scheduled") return false;
  const at = releaseAt(order);
  return at !== null && at <= now;
}

// ---------------------------------------------------------------------------
// The happy path — what the timeline renders
// ---------------------------------------------------------------------------

/**
 * The stages a delivery order is *expected* to pass through, in order. Failure
 * states are deliberately absent: the timeline shows the intended journey and
 * renders an interruption separately, which is how every delivery app does it.
 */
export const DELIVERY_STAGES: readonly OrderStatus[] = [
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
];

/** Pickup ends at the counter — no courier, no OTP journey. */
export const PICKUP_STAGES: readonly OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "packing",
  "ready",
  "delivered",
  "completed",
];

export function stagesFor(fulfillment: FulfillmentType): readonly OrderStatus[] {
  return fulfillment === "pickup" ? PICKUP_STAGES : DELIVERY_STAGES;
}

/**
 * How far along the happy path a status is, 0-based; -1 for a status that is not
 * on it (any failure state). Used for ordering, progress bars and "has it got
 * past X yet" questions.
 */
export function stageIndex(status: OrderStatus, fulfillment: FulfillmentType): number {
  return stagesFor(fulfillment).indexOf(status);
}

/** Has the order reached `target` (or gone past it) on the happy path? */
export function hasReached(order: Order, target: OrderStatus): boolean {
  const current = stageIndex(order.status, order.fulfillment);
  const wanted = stageIndex(target, order.fulfillment);
  if (wanted === -1) return false;
  // A failed order still reached everything it passed through — read the log.
  if (current === -1) {
    return order.lifecycle.events.some((e) => e.status === target);
  }
  return current >= wanted;
}

/** 0..1 along the happy path, for progress bars. Failure states report 0. */
export function stageFraction(order: Order): number {
  const stages = stagesFor(order.fulfillment);
  const idx = stageIndex(order.status, order.fulfillment);
  if (idx < 0) return 0;
  return idx / (stages.length - 1);
}

// ---------------------------------------------------------------------------
// Permissions + guards
// ---------------------------------------------------------------------------

/** Is `to` a legal next status from `from`? */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** May `actor` make this transition? Admin may make any legal one. */
export function actorCan(actor: OrderActor, to: OrderStatus): boolean {
  return actor === "admin" || ACTORS[to].includes(actor);
}

/** How many wrong codes a rider may enter before the handoff is blocked. */
export const OTP_MAX_ATTEMPTS = 3;

/**
 * Can the customer still cancel? Only while the restaurant has not started
 * cooking — once ingredients are committed, cancellation becomes a support
 * matter. Matches the window every major delivery platform enforces.
 */
export function canCustomerCancel(order: Order): boolean {
  // A scheduled order is the easiest cancellation there is — nothing has been
  // bought for it and nobody has been told about it yet (G34).
  return (
    order.status === "scheduled" ||
    order.status === "placed" ||
    order.status === "confirmed"
  );
}

/** The restaurant may bail out until the courier has the food. */
export function canRestaurantCancel(order: Order): boolean {
  return (
    order.status === "confirmed" ||
    order.status === "preparing" ||
    order.status === "packing" ||
    order.status === "ready"
  );
}

/**
 * Is the handoff code available to the customer? Only once the rider is at the
 * door — showing it any earlier defeats the point of the check (spec §7).
 */
export function isOtpRevealed(order: Order): boolean {
  return order.status === "arrived" || order.status === "delivery-failed";
}

/** The rider is locked out of this handoff after too many wrong codes. */
export function isOtpLocked(order: Order): boolean {
  return order.lifecycle.otpAttempts >= OTP_MAX_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// The counter handover (Phase 10, G22)
// ---------------------------------------------------------------------------

/** Wrong courier codes before the counter is locked out. Mirrors the doorstep. */
export const HANDOVER_MAX_ATTEMPTS = 3;

/**
 * The checks that must be confirmed before food leaves the kitchen, in the order
 * the counter works down them.
 *
 * All four are required, which is why there is no `required` flag: a checklist
 * with optional items is a checklist whose optional items are never ticked. If a
 * check ever needs to be conditional it belongs in `handoverChecksFor(order)`
 * rather than as a flag on the item.
 */
export const HANDOVER_CHECKS: readonly HandoverCheck[] = [
  "identity",
  "orderNumber",
  "items",
  "sealed",
];

/**
 * Does this order need a verified handover before it can be collected?
 *
 * Only a *delivery* order with a courier on it. A pickup order never reaches
 * `picked-up` — the customer collects it and the restaurant marks it `delivered`
 * (see `restaurantActions`) — and an order with no courier cannot have a code,
 * because the code is a property of the assignment. Both cases are absences
 * rather than exemptions: there is nothing to verify, not a check being skipped.
 */
export function requiresHandover(order: Order): boolean {
  return order.fulfillment === "delivery" && order.lifecycle.rider != null;
}

/** The counter is locked out of this handover after too many wrong codes. */
export function isHandoverLocked(order: Order): boolean {
  return order.lifecycle.handoverAttempts >= HANDOVER_MAX_ATTEMPTS;
}

/** Has this order's handover already been verified? */
export function isHandoverVerified(order: Order): boolean {
  return order.lifecycle.handoverVerifiedAt != null;
}

/**
 * What the counter still has to confirm. Empty means the checklist is satisfied.
 *
 * Exported so the dialog can disable its own button from the domain's answer
 * rather than counting ticks itself — the same arrangement as `payoutFieldErrors`
 * and `optionGroupError`: the surface asks, it does not decide.
 */
export function missingHandoverChecks(
  checks: readonly HandoverCheck[],
): HandoverCheck[] {
  return HANDOVER_CHECKS.filter((check) => !checks.includes(check));
}

/**
 * Cash still to be handed over on this order, in the order currency; 0 for a
 * prepaid one or one already settled.
 *
 * Lives here because the `delivered` guard below needs it, and it was being
 * re-derived inline by the OTP dialog, the rider's trip screen and the live
 * offer card — three copies of the rule that decides whether money changed
 * hands (G05).
 */
export function cashDueOn(order: Order): number {
  return order.payment.method === "cash" && order.payment.status === "pending"
    ? order.pricing.total
    : 0;
}

// ---------------------------------------------------------------------------
// Applying a transition
// ---------------------------------------------------------------------------

/** Fields a transition may set alongside the status change. */
export interface TransitionPatch {
  /** Free-text note for the event log (already localised by the caller). */
  note?: string | null;
  /** Accept: promised preparation time in minutes. */
  prepMinutes?: number;
  /** Delay: extra minutes requested, added to the promise. */
  extraMinutes?: number;
  reason?: Order["lifecycle"]["rejectionReason"];
  rider?: Order["lifecycle"]["rider"];
  assignment?: Order["lifecycle"]["assignment"];
  /** Refund amount, when moving to `refunded`. */
  refundAmount?: number;
  rating?: number;
  /**
   * Deliver: the rider confirming they took the cash owed at the door. Required
   * on a cash delivery — see the `delivered` guard.
   */
  cashCollected?: boolean;
  /**
   * Collect: the counter's verification of the handover (Phase 10, G22).
   *
   * Required to move a delivery order to `picked-up`. Carries both halves so the
   * guard can refuse a partial one: a checklist with no code proves nothing about
   * *who* took the food, and a code with no checklist proves nothing about what
   * was in the bag.
   */
  handover?: { code: string; checks: HandoverCheck[] };
  /**
   * Complete: what the rider earned on this order, when the caller knows it.
   * The payout needs trip geometry the order does not carry, so the delivery
   * unit computes it and hands it in (G04); null leaves the rider's side of the
   * order unrecorded rather than guessing at it.
   */
  riderEarning?: OrderRiderEarning | null;
}

export type TransitionError =
  | "errors.illegalTransition"
  | "errors.notPermitted"
  | "errors.prepTimeRequired"
  | "errors.riderRequired"
  | "errors.otpLocked"
  | "errors.cashNotConfirmed"
  | "errors.handoverChecklistIncomplete"
  | "errors.handoverCodeInvalid"
  | "errors.handoverLocked";

export type TransitionResult =
  | { order: Order; event: OrderEvent; error: null }
  | { order: null; event: null; error: TransitionError };

/** Deterministic event id — stable across a re-render, unique per order+time. */
function eventId(orderId: string, status: OrderStatus, atMs: number): string {
  return `evt_${orderId}_${status}_${atMs.toString(36)}`;
}

/**
 * Move `order` to `to` as `actor`. Pure: returns a new order and the event it
 * appended, or an error key when the move is illegal, unauthorised, or missing
 * required data (accepting without a prep time, assigning without a rider).
 *
 * Derived state is stamped here rather than by callers, so every surface agrees:
 * accepting sets the promised-ready time, delivering settles a cash payment and
 * verifies the OTP, refunding flips the payment to `refunded`.
 */
export function transition(
  order: Order,
  to: OrderStatus,
  actor: OrderActor,
  patch: TransitionPatch = {},
  now: number = Date.now(),
): TransitionResult {
  const fail = (error: TransitionError): TransitionResult => ({
    order: null,
    event: null,
    error,
  });

  if (!canTransition(order.status, to)) return fail("errors.illegalTransition");
  if (!actorCan(actor, to)) return fail("errors.notPermitted");
  if (to === "confirmed" && !patch.prepMinutes) return fail("errors.prepTimeRequired");
  if (to === "rider-assigned" && !patch.rider && !order.lifecycle.rider) {
    return fail("errors.riderRequired");
  }
  if (to === "delivered" && isOtpLocked(order)) return fail("errors.otpLocked");
  /**
   * Food does not leave the kitchen unverified (G22).
   *
   * The rule lives here rather than in the handover dialog for the same reason the
   * cash rule below does, and the reason Phases 6–7 put every refusal in
   * `decideVendorApplication`: there are three surfaces that can collect an order
   * — the restaurant's board, the courier's trip screen and the operations desk —
   * and a check implemented in one dialog is a check the other two do not perform.
   * The autopilot goes through the same guard and has to satisfy it too.
   *
   * Both halves are required. The checklist is what was in the bag; the code is
   * *who* took it, and it is derived from the order **and the assigned courier**,
   * so a courier dispatch never sent cannot produce one and a reassignment retires
   * the old code without anything having to remember to.
   */
  if (to === "picked-up" && requiresHandover(order)) {
    if (isHandoverLocked(order)) return fail("errors.handoverLocked");
    const handover = patch.handover;
    if (!handover || missingHandoverChecks(handover.checks).length > 0) {
      return fail("errors.handoverChecklistIncomplete");
    }
    const expected = handoverCodeFor(order.id, order.lifecycle.rider?.id ?? null);
    if (!handoverMatches(expected, handover.code)) {
      return fail("errors.handoverCodeInvalid");
    }
  }
  /**
   * A cash delivery cannot close until the rider says the money changed hands
   * (G05). Refusing it here rather than in the doorstep dialog is what makes the
   * two ledgers agree afterwards: from this transition on, the platform's books
   * say the order is paid and the rider's wallet says they are carrying it, and
   * both statements come from the same commit.
   *
   * Delivery only. A cash *pickup* order is paid at the vendor's till by the
   * customer standing there — there is no rider's bag for it to be in, and the
   * restaurant marking it collected is the whole confirmation.
   */
  if (
    to === "delivered" &&
    order.fulfillment === "delivery" &&
    cashDueOn(order) > 0 &&
    patch.cashCollected !== true
  ) {
    return fail("errors.cashNotConfirmed");
  }

  const iso = new Date(now).toISOString();
  const life = { ...order.lifecycle };

  const event: OrderEvent = {
    id: eventId(order.id, to, now),
    status: to,
    at: iso,
    actor,
    note: patch.note ?? null,
  };
  life.events = [...life.events, event];

  let payment = order.payment;
  let estimatedDeliveryAt = order.estimatedDeliveryAt;

  switch (to) {
    case "confirmed": {
      life.prepMinutes = patch.prepMinutes ?? null;
      const readyMs = now + (patch.prepMinutes ?? 0) * 60_000;
      life.promisedReadyAt = new Date(readyMs).toISOString();
      // The customer's ETA is the promise plus the ride (or nothing, for pickup).
      estimatedDeliveryAt = new Date(
        readyMs + (order.fulfillment === "delivery" ? RIDE_ALLOWANCE_MIN * 60_000 : 0),
      ).toISOString();
      break;
    }
    case "rider-assigned": {
      if (patch.rider) life.rider = patch.rider;
      life.assignment = patch.assignment ?? "auto";
      life.assignedAt = iso;
      break;
    }
    case "ready": {
      // Coming *back* to ready means the rider handed the job back: unassign, and
      // remember who, so dispatch offers it to somebody else.
      if (order.status === "rider-assigned" && order.lifecycle.rider) {
        life.rejectedRiderIds = [
          ...life.rejectedRiderIds,
          order.lifecycle.rider.id,
        ];
        life.rider = null;
        life.assignment = null;
        life.assignedAt = null;
      }
      break;
    }
    case "picked-up": {
      // Stamped here, not by the caller — the same rule that puts the promised
      // ready time and the cash settle in this switch. A surface that stamped its
      // own would be a fourth place the handover could be recorded differently.
      if (patch.handover) {
        life.handoverVerifiedAt = iso;
        life.handoverChecks = HANDOVER_CHECKS.filter((c) =>
          patch.handover!.checks.includes(c),
        );
      }
      break;
    }
    case "delivered": {
      life.otpVerifiedAt = iso;
      // Cash is collected on the doorstep — that is the moment it is paid.
      if (order.payment.method === "cash" && order.payment.status === "pending") {
        payment = { ...payment, status: "paid" };
      }
      estimatedDeliveryAt = iso;
      break;
    }
    case "delivery-failed": {
      life.failureReason = patch.reason ?? "customer-unavailable";
      break;
    }
    case "rejected": {
      life.rejectionReason = patch.reason ?? "other";
      life.cancelledBy = "restaurant";
      openRefundOwed(order, life);
      break;
    }
    case "cancelled": {
      life.cancelReason = patch.reason ?? "other";
      life.cancelledBy = actor;
      openRefundOwed(order, life);
      break;
    }
    case "returned": {
      life.failureReason = patch.reason ?? life.failureReason ?? "customer-unavailable";
      openRefundOwed(order, life);
      break;
    }
    case "refunded": {
      // The status only exists for an order that ended badly, and reaching it
      // *is* the settlement — so it stamps the same fields the standalone
      // `settleRefund` does, through the same helper.
      stampRefundSettled(order, life, patch.refundAmount ?? refundAmountOn(order), iso);
      payment = { ...payment, status: "refunded" };
      break;
    }
    case "completed": {
      if (patch.rating) life.rating = patch.rating;
      /**
       * Completion is the moment the money becomes real (G01/G02): the platform
       * takes its commission, the vendor is owed its net and the order joins a
       * weekly settlement. Stamped here rather than by the caller for the same
       * reason the promised-ready time is — four surfaces can complete an order
       * and all four must produce identical books.
       *
       * Idempotent twice over: `TRANSITIONS.completed` is empty so the machine
       * refuses a second completion outright, and even a replayed patch finds
       * this record already present and leaves it untouched. A commission, a
       * settlement line and a rider earning therefore exist at most once each.
       */
      life.financials =
        order.lifecycle.financials ??
        settleOrder(order, { now, riderEarning: patch.riderEarning ?? null });
      break;
    }
  }

  if (patch.reason && to !== "rejected" && to !== "cancelled" && to !== "delivery-failed") {
    life.rejectionReason = life.rejectionReason ?? patch.reason;
  }

  return {
    order: { ...order, status: to, payment, estimatedDeliveryAt, lifecycle: life, updatedAt: iso },
    event,
    error: null,
  };
}

/**
 * Minutes allowed for the ride once food is ready. A single constant rather than
 * per-order geometry: the customer's ETA has to exist before a rider does, and
 * the rider app owns the real routed estimate once one is assigned.
 */
export const RIDE_ALLOWANCE_MIN = 18;

/** Add minutes to the promise without changing status ("need more time"). */
export function addDelay(order: Order, minutes: number, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  const base = order.lifecycle.promisedReadyAt
    ? Date.parse(order.lifecycle.promisedReadyAt)
    : now;
  const promised = new Date(base + minutes * 60_000).toISOString();
  return {
    ...order,
    estimatedDeliveryAt: new Date(
      Date.parse(order.estimatedDeliveryAt) + minutes * 60_000,
    ).toISOString(),
    updatedAt: iso,
    lifecycle: {
      ...order.lifecycle,
      delayMinutes: order.lifecycle.delayMinutes + minutes,
      promisedReadyAt: promised,
      events: [
        ...order.lifecycle.events,
        {
          id: eventId(order.id, order.status, now),
          status: order.status,
          at: iso,
          actor: "restaurant",
          note: `delay:${minutes}`,
        },
      ],
    },
  };
}

/** Record a wrong handoff code. Pure; returns the order with the attempt logged. */
export function recordOtpFailure(order: Order, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  const attempts = order.lifecycle.otpAttempts + 1;
  return {
    ...order,
    updatedAt: iso,
    lifecycle: {
      ...order.lifecycle,
      otpAttempts: attempts,
      events: [
        ...order.lifecycle.events,
        {
          id: `${eventId(order.id, order.status, now)}_otp${attempts}`,
          status: order.status,
          at: iso,
          actor: "rider",
          note: `otp-failed:${attempts}`,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// The refund lifecycle — requested → approved | rejected → refunded (G07)
// ---------------------------------------------------------------------------

/**
 * How the money would go back on this order: the tender it came in on.
 *
 * Resolved from the payment rather than chosen, because it is not a choice — a
 * card payment goes back to that card. What *is* a decision is whether to refund
 * at all, and that is `approveRefund`.
 */
export function refundMethodFor(order: Order): RefundMethod {
  return order.payment.method;
}

/** How long a refund takes to settle, by route. Prose lives in the messages. */
export function refundIsInstant(method: RefundMethod): boolean {
  // The wallet is a ledger this app owns, so there is nothing to wait for. A card
  // refund is a provider's business and cash has to be handed back by a person.
  return method === "wallet";
}

/** Is there money on this order that could go back, and has it not gone yet? */
export function isRefundable(order: Order): boolean {
  return order.payment.status === "paid" && order.lifecycle.refund !== "refunded";
}

/** May the desk decide this refund now? */
export function canDecideRefund(order: Order): boolean {
  return (
    isRefundable(order) &&
    (order.lifecycle.refund === "none" || order.lifecycle.refund === "requested")
  );
}

/** Is there an approved refund still waiting for the money to move? */
export function canSettleRefund(order: Order): boolean {
  return order.lifecycle.refund === "approved" && order.lifecycle.refundSettledAt === null;
}

/** What is owed back: whatever was already agreed, else the whole order. */
function refundAmountOn(order: Order): number {
  return order.lifecycle.refundAmount > 0
    ? order.lifecycle.refundAmount
    : order.pricing.total;
}

/**
 * A refund the *platform* owes, opened by the transition that created the debt.
 *
 * Cancelling, rejecting or returning a paid order does not make the money come
 * back — it makes it owed. This used to flip `payment.status` straight to
 * `refunded` at that moment, which was the clearest instance of the gap analysis's
 * "fake financial value": the customer's card had not been touched and the
 * statement said it had. The refund now *opens*, at `requested`, and only reaches
 * `refunded` when something settles it — instantly for the wallet, on a decision
 * for anything else.
 *
 * Mutates the working copy of the lifecycle the transition is building, which is
 * why it is private to this module.
 */
function openRefundOwed(order: Order, life: OrderLifecycle): void {
  if (order.payment.status !== "paid") return;
  if (life.refund !== "none") return;
  life.refund = "requested";
  life.refundAmount = order.pricing.total;
  life.refundMethod = refundMethodFor(order);
}

/** Stamp a refund as settled. One writer, two callers (see `case "refunded"`). */
function stampRefundSettled(
  order: Order,
  life: OrderLifecycle,
  amount: number,
  iso: string,
): void {
  life.refund = "refunded";
  life.refundAmount = amount;
  life.refundMethod = life.refundMethod ?? refundMethodFor(order);
  life.refundDecidedAt = life.refundDecidedAt ?? iso;
  life.refundSettledAt = iso;
}

/** Append an event that records something about the refund, status unchanged. */
function withRefundEvent(
  order: Order,
  life: OrderLifecycle,
  actor: OrderActor,
  note: string,
  now: number,
): Order {
  const iso = new Date(now).toISOString();
  return {
    ...order,
    updatedAt: iso,
    lifecycle: {
      ...life,
      events: [
        ...life.events,
        {
          id: `${eventId(order.id, order.status, now)}_${note}`,
          status: order.status,
          at: iso,
          actor,
          note,
        },
      ],
    },
  };
}

/** Log a customer refund request without changing the order's status. */
export function requestRefund(order: Order, now = Date.now()): Order {
  const life: OrderLifecycle = {
    ...order.lifecycle,
    refund: "requested",
    refundAmount: order.pricing.total,
    refundMethod: refundMethodFor(order),
  };
  return withRefundEvent(order, life, "customer", "refund-requested", now);
}

/**
 * Grant a refund. Pure — the decision, not the payment.
 *
 * Reaching `approved` and reaching `refunded` are deliberately two steps even
 * though a wallet refund makes them one commit: the difference between "we agreed
 * to pay this" and "the money is back" is the whole content of a refund status,
 * and collapsing them is what made the old model unable to describe a card.
 *
 * A partial amount is allowed and clamped to the order total — a missing side dish
 * is not worth the whole dinner, and that is the commonest real refund there is.
 */
export function approveRefund(
  order: Order,
  input: { amount?: number; method?: RefundMethod } = {},
  now = Date.now(),
): Order {
  const iso = new Date(now).toISOString();
  const amount = Math.min(
    Math.max(input.amount ?? refundAmountOn(order), 0),
    order.pricing.total,
  );
  const life: OrderLifecycle = {
    ...order.lifecycle,
    refund: "approved",
    refundAmount: amount,
    refundMethod: input.method ?? order.lifecycle.refundMethod ?? refundMethodFor(order),
    refundDecidedAt: iso,
  };
  return withRefundEvent(order, life, "admin", "refund-approved", now);
}

/** Refuse a refund. The amount is cleared — nothing is owed. */
export function rejectRefund(order: Order, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  const life: OrderLifecycle = {
    ...order.lifecycle,
    refund: "rejected",
    refundAmount: 0,
    refundDecidedAt: iso,
  };
  return withRefundEvent(order, life, "admin", "refund-rejected", now);
}

/**
 * The money is back. Pure.
 *
 * Separate from the `refunded` *status* because that status only exists for an
 * order that ended badly: a goodwill refund on an order the customer received and
 * ate cannot change its status to `refunded` without lying about what happened to
 * the food. Both routes stamp the same fields through `stampRefundSettled`, and
 * both flip the payment, so no consumer has to know which one ran.
 */
export function settleRefund(order: Order, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  const life: OrderLifecycle = { ...order.lifecycle };
  stampRefundSettled(order, life, refundAmountOn(order), iso);
  const settled = withRefundEvent(order, life, "system", "refund-settled", now);
  return { ...settled, payment: { ...order.payment, status: "refunded" } };
}

/**
 * Record a wrong courier code at the counter. Pure.
 *
 * The counterpart of `recordOtpFailure`, and deliberately identical in shape: an
 * attempt is a fact about the order, it is logged where every other fact about the
 * order is logged, and three of them close the handover. `actor` is the restaurant
 * because it is the counter typing, even when the courier is reading the digits out.
 */
export function recordHandoverFailure(order: Order, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  const attempts = order.lifecycle.handoverAttempts + 1;
  return {
    ...order,
    updatedAt: iso,
    lifecycle: {
      ...order.lifecycle,
      handoverAttempts: attempts,
      events: [
        ...order.lifecycle.events,
        {
          id: `${eventId(order.id, order.status, now)}_handover${attempts}`,
          status: order.status,
          at: iso,
          actor: "restaurant",
          note: `handover-failed:${attempts}`,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Rating (Phase 17, G36)
// ---------------------------------------------------------------------------

/** The scale. Exported so the star control cannot invent a different one. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * May the customer score this order?
 *
 * Only once the food has actually been handed over, and only once — a rating is
 * a fact about a meal that happened, and a second one would silently restate the
 * first in every aggregate that reads it. Editing is a different action and
 * belongs to the review, which has its own window (`lib/reviews.canEditReview`).
 */
export function canRateOrder(order: Order): boolean {
  return (
    (order.status === "delivered" || order.status === "completed") &&
    order.lifecycle.rating === null
  );
}

/**
 * Score an order, 1–5. Pure; returns the order with the rating stamped and the
 * event logged, or the order untouched when the score is out of range.
 *
 * `lifecycle.rating` had a reader in three places and no writer anywhere (G36) —
 * the customer's stats, the review surfaces and Phase 16's restaurant league
 * table were all reading a field only the demo seed ever set. This is the writer,
 * and it is deliberately the *only* one: `stores/orders.rateOrder` wraps it, the
 * review form calls that store action after a review lands, and the star control
 * calls the same one. A second writer is how a five-star review and a one-star
 * stamp end up on the same order.
 *
 * Separate from the `completed` transition rather than folded into it, because
 * rating and closing are different decisions made at different moments: a
 * customer who taps a star has not necessarily finished checking their bag, and
 * one who completes an order has not necessarily formed an opinion.
 */
export function rateOrder(order: Order, rating: number, now = Date.now()): Order {
  const score = Math.round(rating);
  if (score < RATING_MIN || score > RATING_MAX) return order;
  const iso = new Date(now).toISOString();
  return {
    ...order,
    updatedAt: iso,
    lifecycle: {
      ...order.lifecycle,
      rating: score,
      events: [
        ...order.lifecycle.events,
        {
          id: `${eventId(order.id, order.status, now)}_rating`,
          status: order.status,
          at: iso,
          actor: "customer",
          note: `rating:${score}`,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Actor-facing action lists — what a surface should offer, derived not hardcoded
// ---------------------------------------------------------------------------

/**
 * A button a surface can render. Deriving these from the machine is what stops
 * the dashboard growing its own private idea of the lifecycle again: the board
 * asks "what can I do to this order?" rather than switching on the status.
 */
export interface OrderAction {
  /** Target status, or a pseudo-action the surface handles itself. */
  to: OrderStatus | "delay" | "assign" | "refund" | "rate";
  /** i18n key under the surface's namespace. */
  key: string;
  tone: "primary" | "danger" | "neutral";
  /** Needs a dialog to collect input before it can be applied. */
  prompts?:
    | "prep-time"
    | "reject-reason"
    | "cancel-reason"
    | "rider"
    | "otp"
    | "fail-reason"
    /** The rider took cash at the door — the `delivered` guard requires it. */
    | "cash"
    /** The counter is releasing the food — the `picked-up` guard requires it. */
    | "handover"
    /** Irreversible, so it is asked twice. */
    | "confirm";
}

/** What the restaurant can do to this order right now, in display order. */
export function restaurantActions(order: Order): OrderAction[] {
  const actions: OrderAction[] = [];
  switch (order.status) {
    case "placed":
      actions.push(
        { to: "confirmed", key: "accept", tone: "primary", prompts: "prep-time" },
        { to: "rejected", key: "reject", tone: "danger", prompts: "reject-reason" },
      );
      break;
    case "confirmed":
      actions.push(
        { to: "preparing", key: "startPreparing", tone: "primary" },
        { to: "delay", key: "needMoreTime", tone: "neutral" },
      );
      break;
    case "preparing":
      actions.push(
        { to: "packing", key: "startPacking", tone: "primary" },
        { to: "delay", key: "needMoreTime", tone: "neutral" },
      );
      break;
    case "packing":
      actions.push({ to: "ready", key: "markReady", tone: "primary" });
      break;
    case "ready":
      if (order.fulfillment === "pickup") {
        actions.push({ to: "delivered", key: "markCollected", tone: "primary" });
      } else {
        actions.push({ to: "assign", key: "assignRider", tone: "primary", prompts: "rider" });
      }
      break;
    case "rider-assigned":
      // Releasing the food is a verified step now (G22), so it prompts. The guard
      // in `transition` is what enforces it; this only says a dialog is needed.
      actions.push({
        to: "picked-up",
        key: "handToRider",
        tone: "primary",
        prompts: "handover",
      });
      break;
    case "returned":
      break;
  }
  if (canRestaurantCancel(order)) {
    actions.push({ to: "cancelled", key: "cancelOrder", tone: "danger", prompts: "cancel-reason" });
  }
  return actions;
}

/** What the rider can do to this order right now. */
export function riderActions(order: Order): OrderAction[] {
  switch (order.status) {
    case "rider-assigned":
      return [
        // The courier can complete the handover from their own screen, and is held
        // to the same checklist and the same code — their app is where the code is
        // shown, so this is the natural side to run it from.
        { to: "picked-up", key: "confirmPickup", tone: "primary", prompts: "handover" },
        { to: "ready", key: "handBack", tone: "danger" },
      ];
    case "picked-up":
      return [{ to: "on-the-way", key: "startDelivery", tone: "primary" }];
    case "on-the-way":
      return [
        { to: "arrived", key: "markArrived", tone: "primary" },
        { to: "delivery-failed", key: "reportProblem", tone: "danger", prompts: "fail-reason" },
      ];
    case "arrived":
      return [
        { to: "delivered", key: "verifyOtp", tone: "primary", prompts: "otp" },
        { to: "delivery-failed", key: "reportProblem", tone: "danger", prompts: "fail-reason" },
      ];
    case "delivery-failed":
      return [
        { to: "on-the-way", key: "retryDelivery", tone: "primary" },
        { to: "returned", key: "returnToVendor", tone: "danger" },
      ];
    default:
      return [];
  }
}

/** What the customer can do to this order right now. */
export function customerActions(order: Order): OrderAction[] {
  const actions: OrderAction[] = [];
  if (canCustomerCancel(order)) {
    actions.push({ to: "cancelled", key: "cancelOrder", tone: "danger", prompts: "cancel-reason" });
  }
  /**
   * Asking for the money back. Rarely reachable now and deliberately so: an order
   * that ends badly after payment opens its own refund at `requested`, because the
   * platform owes the money whether or not the customer thinks to ask. What is
   * left here is the case where nothing was opened, and it is gated on there being
   * money to return at all — a cash order cancelled before the door was never
   * paid, and offering to refund it was the old condition's mistake.
   */
  if (
    (order.status === "cancelled" || order.status === "rejected" || order.status === "returned") &&
    isRefundable(order) &&
    order.lifecycle.refund === "none"
  ) {
    actions.push({ to: "refund", key: "requestRefund", tone: "neutral" });
  }
  /**
   * Closing the order. The lifecycle could always reach `completed` — the graph
   * and the actor table both allowed it — but no surface ever offered it, so
   * with the demo autopilot switched off an order stopped at `delivered` and its
   * money was never worked out (G03). The customer confirming they have their
   * food is the natural human trigger; the admin can do it too, through the same
   * transition, for an order nobody closes.
   */
  if (order.status === "delivered") {
    actions.push({ to: "completed", key: "completeOrder", tone: "primary" });
  }
  /**
   * Scoring the meal (G36). Offered on `completed` as well as `delivered`, which
   * is the fix rather than a widening: the condition used to be `delivered` only,
   * and completion is where an order actually ends — so the one surface that
   * could have rendered this action was offering it during a window most orders
   * pass straight through.
   */
  if (canRateOrder(order)) {
    actions.push({ to: "rate", key: "rateOrder", tone: "neutral" });
  }
  return actions;
}

/**
 * Every lifecycle move an admin may make on this order right now (Phase 4, G06).
 *
 * Derived from `TRANSITIONS` rather than written out, which is the whole point:
 * the operations desk's intervention controls are the graph, so a new state or a
 * new edge appears on the admin surface the moment it is added to the machine and
 * cannot drift from what the machine will actually accept. `actorCan` is not
 * consulted because `admin` is exempt from the actor table by design — an
 * operator stepping in *is* the exception the table describes.
 *
 * `prompts` is what each move needs collected before it will pass the guards
 * above, so the surface never has to know which transitions are guarded: a
 * refused transition is a bug in this table, not in the page.
 *
 * `key` is the target status; the surface labels it ("Move to …") rather than
 * carrying sixteen strings per locale.
 *
 * `refunded` is deliberately absent. Money going back has a decision behind it
 * (requested → approved/rejected → settled), and offering the bare status
 * transition here would let an operator return a customer's money with no record
 * of who approved it or why — see the refund controls in Phase 5.
 */
export function adminActions(order: Order): OrderAction[] {
  const from = stageIndex(order.status, order.fulfillment);
  return TRANSITIONS[order.status]
    .filter((to) => to !== "refunded")
    .map((to) => {
      const forward = from >= 0 && stageIndex(to, order.fulfillment) === from + 1;
      return {
        to,
        key: to,
        tone: isFailure(to) ? "danger" : forward ? "primary" : "neutral",
        prompts: adminPrompt(order, to),
      } satisfies OrderAction;
    });
}

/** What an admin has to supply before a given move will pass the guards. */
function adminPrompt(order: Order, to: OrderStatus): OrderAction["prompts"] {
  switch (to) {
    case "confirmed":
      return "prep-time";
    case "rejected":
      return "reject-reason";
    case "cancelled":
      return "cancel-reason";
    case "delivery-failed":
      return "fail-reason";
    case "rider-assigned":
      return "rider";
    case "picked-up":
      // The desk is not exempt from the counter check either — an operator who
      // could wave food out of a kitchen would make the checklist advisory.
      return requiresHandover(order) ? "handover" : "confirm";
    case "delivered":
      // Only a cash delivery has money to account for; everything else is a
      // second look, because a handover cannot be un-done.
      return order.fulfillment === "delivery" && cashDueOn(order) > 0 ? "cash" : "confirm";
    case "completed":
    case "returned":
      return "confirm";
    default:
      return undefined;
  }
}
