import type {
  FulfillmentType,
  Order,
  OrderActor,
  OrderEvent,
  OrderStatus,
} from "@/frontend/types";

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
  return order.status === "placed" || order.status === "confirmed";
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
}

export type TransitionError =
  | "errors.illegalTransition"
  | "errors.notPermitted"
  | "errors.prepTimeRequired"
  | "errors.riderRequired"
  | "errors.otpLocked";

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
      if (order.payment.status === "paid") payment = { ...payment, status: "refunded" };
      break;
    }
    case "cancelled": {
      life.cancelReason = patch.reason ?? "other";
      life.cancelledBy = actor;
      if (order.payment.status === "paid") payment = { ...payment, status: "refunded" };
      break;
    }
    case "returned": {
      life.failureReason = patch.reason ?? life.failureReason ?? "customer-unavailable";
      break;
    }
    case "refunded": {
      life.refund = "approved";
      life.refundAmount = patch.refundAmount ?? order.pricing.total;
      payment = { ...payment, status: "refunded" };
      break;
    }
    case "completed": {
      if (patch.rating) life.rating = patch.rating;
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

/** Log a customer refund request without changing the order's status. */
export function requestRefund(order: Order, now = Date.now()): Order {
  const iso = new Date(now).toISOString();
  return {
    ...order,
    updatedAt: iso,
    lifecycle: {
      ...order.lifecycle,
      refund: "requested",
      refundAmount: order.pricing.total,
      events: [
        ...order.lifecycle.events,
        {
          id: `${eventId(order.id, order.status, now)}_refund`,
          status: order.status,
          at: iso,
          actor: "customer",
          note: "refund-requested",
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
  prompts?: "prep-time" | "reject-reason" | "cancel-reason" | "rider" | "otp" | "fail-reason";
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
      actions.push({ to: "picked-up", key: "handToRider", tone: "primary" });
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
        { to: "picked-up", key: "confirmPickup", tone: "primary" },
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
  if (
    (order.status === "cancelled" || order.status === "rejected" || order.status === "returned") &&
    order.payment.status !== "refunded" &&
    order.lifecycle.refund === "none"
  ) {
    actions.push({ to: "refund", key: "requestRefund", tone: "neutral" });
  }
  if (order.status === "delivered" && order.lifecycle.rating == null) {
    actions.push({ to: "rate", key: "rateOrder", tone: "primary" });
  }
  return actions;
}
