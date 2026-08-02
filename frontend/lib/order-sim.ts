import type { Order, OrderActor, OrderStatus } from "@/frontend/types";
import { PREP_TIME_OPTIONS } from "./order-lifecycle";
import type { TransitionPatch } from "./order-machine";

/**
 * order-sim.ts — the autopilot's rules, as data.
 *
 * A real order lifecycle needs a customer, a kitchen and a courier. A demo has
 * one person. So the autopilot plays whichever roles nobody is currently
 * playing: after an order has sat in a state for its dwell time, it makes the
 * move that state's actor would have made.
 *
 * Two properties keep this honest rather than a cheat:
 *
 *  1. **It uses the same machine as everyone else.** The autopilot proposes a
 *     `(status, actor, patch)`; the store applies it through
 *     `lib/order-machine.transition`, which can refuse it. It has no privileged
 *     path and cannot produce a state a person could not have produced.
 *  2. **A human always wins.** Dwell times are long enough that a presenter
 *     tapping "Accept" acts first; the autopilot then simply finds the order in
 *     a state it no longer owns and moves on.
 *
 * Nothing here reads the clock or mutates anything — `nextMove` is pure and the
 * caller passes `now` in.
 */

/**
 * How long an order rests in each state before the autopilot moves it, in
 * seconds at 1× speed. Chosen so the shape of the lifecycle is legible: the
 * kitchen states are the long ones because that is where the time really goes,
 * and `arrived` is generous so a presenter has room to point at the OTP panel
 * before it is consumed.
 *
 * States absent from this table are ones the autopilot never drives — terminal
 * states, and `delivery-failed`, which is a decision a person should make.
 */
const DWELL_SECONDS: Partial<Record<OrderStatus, number>> = {
  placed: 20,
  confirmed: 25,
  preparing: 45,
  packing: 20,
  ready: 15,
  "rider-assigned": 30,
  "picked-up": 15,
  "on-the-way": 40,
  arrived: 30,
  delivered: 20,
};

/** The move the autopilot would make from each state. */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; actor: OrderActor }>> = {
  placed: { to: "confirmed", actor: "restaurant" },
  confirmed: { to: "preparing", actor: "restaurant" },
  preparing: { to: "packing", actor: "restaurant" },
  packing: { to: "ready", actor: "restaurant" },
  // `ready` is special-cased in `nextMove`: delivery orders need dispatch, and
  // dispatch has to choose a rider, which the store does rather than this table.
  "rider-assigned": { to: "picked-up", actor: "rider" },
  "picked-up": { to: "on-the-way", actor: "rider" },
  "on-the-way": { to: "arrived", actor: "rider" },
  arrived: { to: "delivered", actor: "rider" },
  delivered: { to: "completed", actor: "system" },
};

export interface AutoMove {
  /** `"dispatch"` asks the store to pick a rider; anything else is a transition. */
  kind: "transition" | "dispatch";
  to?: OrderStatus;
  actor?: OrderActor;
  patch?: TransitionPatch;
}

/**
 * What (if anything) the autopilot should do to `order` at `now`.
 *
 * Returns null when the order is terminal, when its state is one the autopilot
 * does not drive, or when it has not rested long enough yet. `speed` scales the
 * dwell times.
 */
export function nextMove(order: Order, now: number, speed = 1): AutoMove | null {
  const dwell = DWELL_SECONDS[order.status];
  if (dwell == null) return null;

  const last = order.lifecycle.events[order.lifecycle.events.length - 1];
  const since = last ? Date.parse(last.at) : Date.parse(order.updatedAt);
  if (now - since < (dwell * 1000) / Math.max(speed, 0.25)) return null;

  // Leaving the pass depends on how the order is being fulfilled.
  if (order.status === "ready") {
    if (order.fulfillment === "pickup") {
      return { kind: "transition", to: "delivered", actor: "restaurant" };
    }
    // Somebody may already have taken it — then there is nothing to dispatch.
    return order.lifecycle.rider
      ? null
      : { kind: "dispatch" };
  }

  const move = NEXT[order.status];
  if (!move) return null;

  // Accepting requires a promised preparation time; the machine refuses without
  // one. Pick by basket size, which is roughly how a kitchen decides.
  if (move.to === "confirmed") {
    const items = order.lines.reduce((n, l) => n + l.quantity, 0);
    const prepMinutes =
      items >= 5 ? PREP_TIME_OPTIONS[2] : items >= 3 ? PREP_TIME_OPTIONS[1] : PREP_TIME_OPTIONS[0];
    return { kind: "transition", to: move.to, actor: move.actor, patch: { prepMinutes } };
  }

  return { kind: "transition", to: move.to, actor: move.actor };
}

/**
 * The point in the ride at which the customer should be told their rider is
 * close (spec: "Near You"). Halfway through the `on-the-way` dwell, so it lands
 * between departure and arrival rather than on top of either.
 */
export function shouldNudgeNearby(order: Order, now: number, speed = 1): boolean {
  if (order.status !== "on-the-way") return false;
  const started = order.lifecycle.events.find((e) => e.status === "on-the-way");
  if (!started) return false;
  const elapsed = now - Date.parse(started.at);
  const dwell = ((DWELL_SECONDS["on-the-way"] ?? 40) * 1000) / Math.max(speed, 0.25);
  return elapsed >= dwell / 2;
}
