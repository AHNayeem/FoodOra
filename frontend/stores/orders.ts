"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Order,
  OrderActor,
  OrderStatus,
  Rider,
} from "@/types";
import { buildDemoOrders, riders, vendorById } from "@/lib/mock";
import {
  notificationsFor,
  nearYouNotification,
  refundNotifications,
} from "@/lib/notifications";
import {
  addDelay,
  approveRefund,
  canDecideRefund,
  canSettleRefund,
  canTransition,
  canRateOrder,
  isDueForRelease,
  isTerminal,
  rateOrder,
  recordHandoverFailure,
  recordOtpFailure,
  refundIsInstant,
  refundMethodFor,
  rejectRefund,
  requestRefund,
  settleRefund,
  transition,
  type TransitionError,
  type TransitionPatch,
} from "@/lib/order-machine";
import {
  dispatchRider,
  ensureEventDetails,
  ensureFinancials,
  ensureHandoverRecord,
  ensureLifecycle,
  ensureRefundRecord,
  riderSnapshot,
} from "@/lib/order-lifecycle";
import { commissionRateFor, DEFAULT_COMMISSION_RATE } from "@/lib/settlement";
import { overCashLimit } from "@/lib/risk";
import { zoneForArea } from "@/lib/serviceability";
import { riderEarningForOrder } from "@/services/delivery";
import { offShiftRiderIds, useFleet } from "./fleet";
import { undispatchableRiderIds, useOnboarding } from "./onboarding";
import { emitNotifications, useNotifications } from "./notifications";
import { useWallet } from "./wallet";
import { sessionCan } from "./auth";
import { recordAudit } from "./audit";
import { platformZones } from "./platform-settings";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * orders store — the single source of truth for every live order, on every
 * surface (customer, restaurant, rider, admin).
 *
 * This used to be the *customer's* order history, which is why the prototype had
 * three disagreeing lifecycles: the restaurant board mutated a local array, the
 * rider app ran on synthesised trips, and the customer's tracker interpolated a
 * status from the clock. None of them could see the others.
 *
 * There is still no backend, so "one source of truth" means one persisted store
 * that all four surfaces read and write. That is enough to make the demo real:
 * accepting an order in the dashboard tab changes the customer's tracker in the
 * tab beside it, because both are reading the same key in localStorage — and,
 * since Phase 18 (G42), because the tab that is not writing is listening for the
 * key to change (`lib/store-sync`). Sharing the key was never enough on its own:
 * a persisted store reads it on hydration and, without that listener, never
 * again.
 *
 * Three rules hold this together:
 *
 *  1. **Every mutation goes through the machine.** `advance()` calls
 *     `lib/order-machine.transition`, which refuses illegal moves and stamps the
 *     derived fields. Nothing sets `status` directly.
 *  2. **Every committed transition emits notifications.** The store hands them
 *     to `stores/notifications.notify`, which is where the C25 routing gate
 *     lives, so a new state cannot ship without an inbox entry and cannot
 *     bypass a preference (see `lib/notifications`).
 *  3. **The store never reads the clock for status.** Status is what somebody
 *     did; only ETAs and countdowns are time-derived.
 *
 * Hydration follows the same contract as the other stores — `skipHydration`
 * plus an explicit rehydrate, gated on `hydrated` — with a seeding step on first
 * hydration so a reviewer opening the dashboard is not staring at an empty board
 * (see `lib/mock/demo-orders`). Phase E turns this into a cache of server-owned
 * rows; `advance()` becomes a mutation call and the signatures stay put.
 */

/** Bump when the persisted shape changes; `migrate` backfills the difference. */
const STORE_VERSION = 7;

interface OrdersState {
  orders: Order[];
  hydrated: boolean;
  /** Whether the demo working set has been laid down on this device. */
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  getById: (id: string) => Order | undefined;

  // -- writes ------------------------------------------------------------
  /** Commit a newly placed order (from checkout). */
  addOrder: (order: Order) => void;
  /**
   * Move an order along the lifecycle. Returns the committed order, or an error
   * key when the machine refused it.
   */
  advance: (
    id: string,
    to: OrderStatus,
    actor: OrderActor,
    patch?: TransitionPatch,
  ) => { order: Order | null; error: TransitionError | "errors.notFound" | null };
  /** Restaurant asks for extra minutes without changing status. */
  delayOrder: (id: string, minutes: number) => void;
  /** Assign a courier and move to `rider-assigned` in one step. */
  assignRider: (
    id: string,
    rider: Rider,
    assignment: "auto" | "manual",
  ) => { order: Order | null; error: string | null };
  /**
   * Take an order off its current courier and give it to another one. Two
   * machine transitions, not a field edit — see the implementation.
   */
  reassignRider: (
    id: string,
    rider: Rider,
  ) => { order: Order | null; error: string | null };
  /** Auto-dispatch: pick a rider for a `ready` order and assign them. */
  autoDispatch: (id: string) => { order: Order | null; error: string | null };
  /** Log a wrong handoff code. */
  failOtp: (id: string) => Order | null;
  /**
   * Log a wrong courier code at the counter (Phase 10, G22).
   *
   * Separate from `advance` because a refused transition is pure and leaves the
   * order untouched by design — counting the attempt is a *write*, and the same
   * split already exists for the doorstep (`failOtp` beside the `delivered`
   * guard). Three of them and `errors.handoverLocked` is what the guard returns.
   */
  failHandover: (id: string) => Order | null;
  /** Customer asks for their money back on a failed order. */
  askRefund: (id: string) => void;
  /**
   * The desk's refund decision (Phase 5, G07). Approving a wallet refund also
   * settles it, because the ledger is ours; anything else waits for `settleRefund`.
   */
  decideRefund: (
    id: string,
    decision: "approve" | "reject",
    input?: {
      amount?: number;
      /**
       * Who is deciding. `desk` — the default — is a person at the admin desk and
       * needs `refunds.manage`; `system` is this store settling a wallet order the
       * customer just cancelled, which is not a permission question. See the
       * implementation.
       */
      by?: "desk" | "system";
    },
  ) => { order: Order | null; error: string | null };
  /** Record that an approved refund has actually reached the customer. */
  settleRefund: (id: string) => { order: Order | null; error: string | null };
  /** Raise the "your rider is nearly there" nudge, once per order. */
  notifyNearby: (id: string) => void;
  /**
   * Score a delivered order, 1–5 (Phase 17, G36).
   *
   * The single writer of `lifecycle.rating`. Both surfaces that can produce a
   * score — the star control on the tracker and order history, and the review
   * form when it submits — come through here, so a review's rating and the
   * order's stamp can never be two different numbers.
   */
  rateOrder: (id: string, rating: number) => { order: Order | null; error: string | null };
  /**
   * Hand every scheduled order whose slot is close enough to the restaurant
   * (Phase 17, G34). Returns how many were released.
   *
   * A sweep rather than a timer per order: a device can be closed across a slot,
   * and an order that should have been released an hour ago has to be released
   * on the next look rather than waiting for a tick that already fired. Idempotent
   * — an order that is no longer `scheduled` is not due.
   */
  releaseScheduled: (now?: number) => number;

  // -- lifecycle ---------------------------------------------------------
  /** Lay down the demo working set (idempotent). */
  seed: (now?: number) => void;
  /** Wipe everything and re-seed — the demo bar's reset. */
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

/** Statuses that end an order badly enough to owe the customer their money. */
const REFUNDABLE: readonly OrderStatus[] = ["cancelled", "rejected", "returned"];

/**
 * Should this order's money go back to the wallet, and has it not already?
 *
 * A wallet payment is the one tender the prototype can actually reverse — the
 * money is in a ledger this app owns, so there is nothing to wait for. Cash was
 * never taken and a card refund is a bank's business, which is why both keep the
 * "requested → pending" path (`askRefund`) instead.
 *
 * The ledger is the guard, not a flag on the order: `refundOrder` refuses a
 * second credit for the same order number, so a replayed transition (a second
 * tab, a rehydrate, the demo autopilot) cannot pay out twice.
 */
function owesWalletRefund(order: Order): boolean {
  return (
    order.payment.method === "wallet" &&
    REFUNDABLE.includes(order.status) &&
    // The transition that ended the order opened the refund at `requested` (Phase
    // 5). `canDecideRefund` is therefore the same question asked of the refund
    // lifecycle rather than of the payment flag, which is what stops this firing
    // twice or firing on an order nobody actually paid for.
    canDecideRefund(order)
  );
}

/**
 * Fill in the courier's half of a completed order's books, if it is missing.
 *
 * Two callers, one reason. A *seeded* completed delivery was never transitioned by
 * anybody, so nothing ever called `riderEarningForOrder` for it; a *migrated* one
 * completed before Phase 8 needed the record. Either way the order names a
 * courier and carries a commission record, so the earning is recoverable — and it
 * is recovered by the same function the real `completed` transition calls, priced
 * at the instant the order actually closed rather than now. A courier's week must
 * not move because somebody reloaded the page.
 *
 * Resolved in the store because only the store can reach `services/delivery`:
 * `lib/order-lifecycle`'s migration helpers are pure and cannot see the zones and
 * drop points a payout needs. An order with nothing to recover — a pickup, or one
 * dispatch never touched — is returned untouched rather than given a zero payout,
 * because "no courier" and "a courier who earned nothing" are different facts.
 */
function withRiderEarning(order: Order): Order {
  const financials = order.lifecycle.financials;
  if (!financials || financials.riderEarning) return order;
  if (order.fulfillment !== "delivery" || !order.lifecycle.rider) return order;

  const earning = riderEarningForOrder(
    order,
    Date.parse(financials.settledAt),
    platformZones(),
  );
  if (!earning) return order;
  return {
    ...order,
    lifecycle: { ...order.lifecycle, financials: { ...financials, riderEarning: earning } },
  };
}

export const useOrders = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      hydrated: false,
      seeded: false,

      getById: (id) => get().orders.find((o) => o.id === id),

      addOrder: (order) => {
        set((s) => ({ orders: [order, ...s.orders] }));
        const placed = order.lifecycle.events[0];
        if (placed) emitNotifications(notificationsFor(order, placed));
      },

      advance: (id, to, actor, patch = {}) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return { order: null, error: "errors.notFound" as const };

        /**
         * Phase 14: an admin intervention needs `orders.manage`.
         *
         * Guarded on the **actor**, not on the session, and that is the whole
         * subtlety. `advance` is how a customer cancels, a restaurant accepts and
         * a rider delivers; only the `admin` actor is the platform reaching into
         * somebody else's order, and only that case is a permission question. A
         * blanket session check here would have broken every flow in the app,
         * which is exactly the kind of over-application §5.5 forbids.
         */
        if (actor === "admin" && !sessionCan("orders.manage")) {
          return { order: null, error: "errors.notPermitted" as const };
        }

        /**
         * Completing is when the rider's side of the order is written down (G04).
         * The payout needs the zone's fare rules and the trip's geometry, neither
         * of which the pure machine can see, so it is resolved here — once, for
         * every surface that can close an order — and handed in. A caller that
         * already knows the earning (a replay, a test) keeps its own.
         */
        const resolved: TransitionPatch =
          to === "completed" && patch.riderEarning === undefined
            ? {
                ...patch,
                // Priced against the zone as the platform is configured now
                // (Phase 19, G30), not against the seed's fares.
                riderEarning: riderEarningForOrder(current, Date.now(), platformZones()),
              }
            : patch;

        const result = transition(current, to, actor, resolved);
        if (result.error) return { order: null, error: result.error };

        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? result.order : o)),
        }));
        emitNotifications(notificationsFor(result.order, result.event));

        // Phase 15: §6's "order intervention". Only the `admin` actor, for the
        // same reason the guard above is on the actor — a customer cancelling
        // their own dinner is not a platform mutation, and a trail that recorded
        // every transition would be a duplicate of `lifecycle.events` with none
        // of its detail.
        if (actor === "admin") {
          recordAudit({
            action: "order.intervened",
            entity: "order",
            entityId: id,
            metadata: {
              to,
              from: current.status,
              orderNumber: result.order.orderNumber,
              name: result.order.vendor.name,
              // The line the desk typed where a surface collected one, otherwise
              // the cancellation reason code — the two are the only explanation a
              // transition carries, and an intervention with neither is a bare
              // status move.
              reason:
                patch.detail?.kind === "note"
                  ? patch.detail.body
                  : typeof patch.reason === "string"
                    ? patch.reason
                    : null,
            },
          });
        }

        // Settling the wallet is part of committing the transition, not a thing
        // a surface remembers to do: an order can be cancelled from four of
        // them, and the money has to come back from all four.
        //
        // Phase 5 routes it through the same decision every other refund goes
        // through (`decideRefund`) rather than crediting and advancing here. The
        // effect on the customer is identical — a wallet refund is instant — but
        // the record is now the full lifecycle, requested → approved → refunded,
        // so an automatic refund and one an agent granted are the same shape.
        //
        // The caller's transition already succeeded, so a failure here must not
        // be reported as its failure — the settlement is reported only by what
        // it commits.
        if (owesWalletRefund(result.order)) {
          const settled = get().decideRefund(id, "approve", { by: "system" });
          if (settled.order) return { order: settled.order, error: null };
        }

        return { order: result.order, error: null };
      },

      delayOrder: (id, minutes) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? addDelay(o, minutes) : o)),
        })),

      assignRider: (id, rider, assignment) => {
        /**
         * A rider carries one order at a time. Checked here rather than by the
         * surfaces offering the button, because three of them can assign — the
         * restaurant's dialog, the rider taking a live job, and auto-dispatch —
         * and "this courier already has somebody's dinner" has to mean the same
         * thing to all three (G39, G40).
         */
        const holding = activeOrderForRider(get().orders, rider.id);
        if (holding && holding.id !== id) {
          return { order: null, error: "errors.riderBusy" };
        }
        /**
         * And a rider carries only so much of the platform's money (Phase 18,
         * G44). The zone's `cashLimit` has been drawn on the rider's wallet screen
         * since Phase 3 and consulted by nothing: a courier could be given cash
         * order after cash order with the red bar full behind them.
         *
         * Enforced in the same place as the one-order rule and for the same
         * reason — all three surfaces that can assign have to mean the same thing
         * by it. Prepaid orders pass whatever the courier is holding, because
         * there is nothing to collect.
         */
        const order = get().orders.find((o) => o.id === id);
        // The ceiling an operator has set, not the seed's (Phase 19, G30). The
        // whole folded network, so a courier whose zone was closed today is still
        // held to a limit rather than waved through for want of a record.
        const zone = order
          ? (platformZones().find((z) => z.id === rider.zoneId) ?? null)
          : null;
        if (
          order &&
          zone &&
          overCashLimit(get().orders, rider.id, order, zone.cashLimit, Date.now())
        ) {
          return { order: null, error: "errors.riderCashLimit" };
        }
        const result = get().advance(id, "rider-assigned", "system", {
          rider: riderSnapshot(rider),
          assignment,
        });
        // Phase 15: §6's "rider assignment". Recorded here rather than in
        // `advance` because the assignment is what matters, and the transition it
        // rides on is `system` — so the actor-scoped rule above would have missed
        // every one of them.
        if (result.order) {
          recordAudit({
            action: "order.rider-assigned",
            entity: "order",
            entityId: id,
            metadata: {
              name: rider.name,
              riderId: rider.id,
              mode: assignment,
              orderNumber: result.order.orderNumber,
            },
          });
        }
        return result;
      },

      /**
       * Reassignment (Phase 4, G06) — the operations desk pulling a job off one
       * courier and giving it to another.
       *
       * Expressed as the two transitions it actually is: back to `ready`, which
       * is the machine's own unassign path (it clears the rider and remembers who
       * had it so dispatch stops offering the job back to them), then a fresh
       * assignment. Nothing here writes `lifecycle.rider` directly, so the
       * timeline shows a reassignment as the two events it was.
       *
       * That also decides *when* it is possible, and correctly: `ready` is only
       * reachable from `rider-assigned`, so an order can be reassigned while the
       * courier is riding to the restaurant and not after they have the food. Once
       * it is in the bag the honest move is to fail the delivery, not to
       * quietly hand a stranger's dinner to somebody else.
       *
       * The new courier's availability is checked *before* the release, so a
       * refused reassignment leaves the order exactly as it was rather than
       * stranding it unassigned.
       */
      reassignRider: (id, rider) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return { order: null, error: "errors.notFound" };
        if (current.lifecycle.rider?.id === rider.id) {
          return { order: null, error: "errors.riderUnchanged" };
        }
        const holding = activeOrderForRider(get().orders, rider.id);
        if (holding && holding.id !== id) {
          return { order: null, error: "errors.riderBusy" };
        }
        const released = get().advance(id, "ready", "admin", {
          detail: { kind: "reassigned", fromRider: current.lifecycle.rider?.name ?? null },
        });
        if (released.error) return { order: null, error: released.error };
        const result = get().assignRider(id, rider, "manual");
        // The two transitions already produced an intervention entry and an
        // assignment entry. This third one is the *decision* — "the desk took this
        // job off one courier and gave it to another" — which neither of the other
        // two says, and which is the line an incident review looks for.
        if (result.order) {
          recordAudit({
            action: "order.rider-reassigned",
            entity: "order",
            entityId: id,
            metadata: {
              name: rider.name,
              riderId: rider.id,
              fromRiderId: current.lifecycle.rider?.id ?? null,
              fromRider: current.lifecycle.rider?.name ?? null,
            },
          });
        }
        return result;
      },

      autoDispatch: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return { order: null, error: "errors.notFound" };
        const zoneId = zoneForOrder(order);
        // The fleet is the seed plus whoever this device has approved (Phase 7):
        // a rider the desk admitted this morning has to be pickable, or their
        // approval is a status with no work behind it.
        const rider = dispatchRider(
          order,
          dispatchableFleet(),
          zoneId,
          unavailableRiderIds(get().orders),
        );
        if (!rider) return { order: null, error: "errors.noRiderAvailable" };
        return get().assignRider(id, rider, "auto");
      },

      failOtp: (id) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return null;
        const next = recordOtpFailure(current);
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
        return next;
      },

      failHandover: (id) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return null;
        const next = recordHandoverFailure(current);
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
        return next;
      },

      askRefund: (id) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return;
        const asked = requestRefund(current);
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? asked : o)) }));
        emitNotifications(
          refundNotifications(asked, "requested", asked.updatedAt),
        );
      },

      /**
       * Approve or refuse a refund (Phase 5, G07).
       *
       * The decision is the machine's (`approveRefund` / `rejectRefund`); what the
       * store adds is the part a pure function cannot do — moving the money.
       *
       * A wallet refund is approved and settled in one commit because there is
       * nothing to wait for: the ledger is this application's, `refundOrder`
       * refuses a second credit for the same order number, and leaving it sitting
       * at `approved` would be describing a delay that does not exist. A card or
       * cash refund stops at `approved`, which is the honest state — the provider
       * has not moved, or a person has not yet handed the notes over.
       */
      decideRefund: (id, decision, input = {}) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return { order: null, error: "errors.notFound" };
        if (!canDecideRefund(current)) return { order: null, error: "errors.refundNotOpen" };

        /**
         * Phase 14: a desk decision needs `refunds.manage`. A `system` one does
         * not, and the distinction is why `input.by` exists.
         *
         * `advance` calls this itself to settle a wallet order the customer just
         * cancelled — the money is in a ledger this app owns and there is nothing
         * to decide. Guarding that path on a permission would have made a
         * customer's own cancellation fail unless they held an admin right, which
         * is the §5.5 regression this parameter exists to prevent. The default is
         * `desk`, so a new caller is guarded unless it says otherwise.
         */
        const by = input.by ?? "desk";
        if (by === "desk" && !sessionCan("refunds.manage")) {
          return { order: null, error: "errors.notPermitted" };
        }

        const decided =
          decision === "approve"
            ? approveRefund(current, { amount: input.amount })
            : rejectRefund(current);
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? decided : o)) }));
        emitNotifications(
          refundNotifications(
            decided,
            decision === "approve" ? "approved" : "rejected",
            decided.updatedAt,
          ),
        );

        // Phase 15: §6's "refund decision". Recorded for both routes, labelled
        // by which one it was, because "the desk approved ৳840" and "the system
        // returned it automatically" are different facts about the same money.
        recordAudit({
          action: "refund.decided",
          entity: "order",
          entityId: id,
          metadata: {
            decision,
            by,
            amount: decided.lifecycle.refundAmount,
            currency: decided.pricing.currency,
            method: decided.lifecycle.refundMethod ?? null,
            orderNumber: decided.orderNumber,
          },
        });

        if (decision === "reject") return { order: decided, error: null };

        if (refundIsInstant(refundMethodFor(decided))) {
          const credited = useWallet
            .getState()
            .refundOrder(
              decided.lifecycle.refundAmount,
              decided.vendor.name,
              decided.orderNumber,
            );
          // A refused credit means the ledger already has this refund, which is
          // itself proof the money is back — so it still settles.
          const settled = get().settleRefund(id);
          if (settled.order) return settled;
          if (!credited) return { order: decided, error: null };
        }
        return { order: decided, error: null };
      },

      /**
       * The money is back.
       *
       * Two routes to the same record, and which one applies is decided by the
       * order rather than by the caller: an order that ended badly has `refunded`
       * as a legal *status*, and reaching it is the settlement (the machine stamps
       * the fields there). An order the customer received and ate has no such
       * status — its lifecycle is over — so the refund settles on the lifecycle
       * alone. Both paths go through `stampRefundSettled`, so nothing downstream
       * has to know which one ran.
       */
      settleRefund: (id) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return { order: null, error: "errors.notFound" };
        if (!canSettleRefund(current)) return { order: null, error: "errors.refundNotApproved" };

        // Not guarded on a permission, deliberately: this records that money the
        // desk already approved has actually arrived, and `decideRefund` calls it
        // itself the instant a wallet refund is approved. The decision was the
        // permission question; this is its consequence.
        recordAudit({
          action: "refund.settled",
          entity: "order",
          entityId: id,
          metadata: {
            amount: current.lifecycle.refundAmount,
            currency: current.pricing.currency,
            method: current.lifecycle.refundMethod ?? null,
            orderNumber: current.orderNumber,
          },
        });

        if (canTransition(current.status, "refunded")) {
          const result = get().advance(id, "refunded", "system", {
            refundAmount: current.lifecycle.refundAmount,
          });
          if (result.order) {
            emitNotifications(
              refundNotifications(result.order, "refunded", result.order.updatedAt),
            );
          }
          return { order: result.order, error: result.error };
        }

        const settled = settleRefund(current);
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? settled : o)) }));
        emitNotifications(refundNotifications(settled, "refunded", settled.updatedAt));
        return { order: settled, error: null };
      },

      notifyNearby: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        emitNotifications([nearYouNotification(order, new Date().toISOString())]);
      },

      rateOrder: (id, rating) => {
        const current = get().orders.find((o) => o.id === id);
        if (!current) return { order: null, error: "errors.notFound" };
        /**
         * Already scored is success, not failure.
         *
         * Two surfaces call this and one of them calls it unconditionally: the
         * review form stamps the order whenever a review lands, including for a
         * customer who tapped a star first. Returning an error there would put a
         * red toast on a review that was accepted — so the first score stands and
         * the second call is absorbed. An out-of-range one is a different matter:
         * nothing was recorded, and the caller has to know.
         */
        if (!canRateOrder(current)) return { order: current, error: null };
        const rated = rateOrder(current, rating);
        if (rated === current) return { order: null, error: "errors.ratingRequired" };
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? rated : o)) }));
        return { order: rated, error: null };
      },

      /**
       * The slot sweep.
       *
       * Deliberately *not* part of the demo autopilot even though the autopilot is
       * what calls it most often: releasing a scheduled order is something a
       * server's clock does whether or not anybody is watching, and gating it on
       * the demo switch would mean a reviewer who turned the autopilot off had
       * scheduled orders that never arrived. `DemoEngine` runs it outside its own
       * gate, and the store runs it once on hydration for a device that was closed
       * over the slot.
       */
      releaseScheduled: (now = Date.now()) => {
        const due = get().orders.filter((o) => isDueForRelease(o, now));
        for (const order of due) {
          get().advance(order.id, "placed", "system", {
            detail: { kind: "scheduled-release" },
          });
        }
        return due.length;
      },

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const demo = buildDemoOrders(now).map(withRiderEarning);
        set((s) => {
          const known = new Set(s.orders.map((o) => o.id));
          return {
            orders: [...s.orders, ...demo.filter((o) => !known.has(o.id))],
            seeded: true,
          };
        });
      },

      resetDemo: (now = Date.now()) => {
        useNotifications.getState().resetAll();
        set({ orders: buildDemoOrders(now).map(withRiderEarning), seeded: true });
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-orders",
      version: STORE_VERSION,
      partialize: (s) => ({ orders: s.orders, seeded: s.seeded }),
      /**
       * v1 orders predate the lifecycle record and the extended status set.
       * `ensureLifecycle` reconstructs an event log from what the order does
       * carry, so an order placed before this build still renders a timeline
       * rather than throwing on `order.lifecycle.events`.
       */
      migrate: (persisted, version) => {
        const state = persisted as { orders?: Order[]; seeded?: boolean } | undefined;
        if (!state?.orders) return { orders: [], seeded: false };
        let orders = state.orders;
        if (version < 2) orders = orders.map(ensureLifecycle);
        // v2 orders predate commission (G01/G02): they carry no rate and a
        // completed one carries no commission record. Backfilling the rate from
        // the vendor is what keeps an old device's finished orders inside the
        // settlements they belong to instead of quietly vanishing from the books.
        if (version < 3) {
          orders = orders.map((order) => {
            const vendor = vendorById.get(order.vendor.id);
            return ensureFinancials(
              order,
              vendor ? commissionRateFor(vendor) : DEFAULT_COMMISSION_RATE,
            );
          });
        }
        // v3 orders predate the refund lifecycle (G07): they carry no refund
        // route and no decision/settlement dates, and their `approved` meant what
        // `refunded` means now.
        if (version < 4) orders = orders.map(ensureRefundRecord);
        // v4 orders were completed before the payout run existed (Phase 8): the
        // commission half of their books is there, the courier's half is null.
        // Without the backfill a device that has been running since Phase 2 shows
        // an empty rider payout list and no way to tell that from "nobody rode".
        if (version < 5) orders = orders.map(withRiderEarning);
        // v5 orders predate the counter handover (Phase 10, G22): they carry no
        // attempt counter and no verification stamp, and the `picked-up` guard
        // would read `undefined >= 3` as false but `handoverChecks.includes` as a
        // crash. The backfill records that an already-collected order *was* handed
        // over, and leaves its checklist empty rather than inventing one.
        if (version < 6) orders = orders.map(ensureHandoverRecord);
        // v6 events carry the encoded `note` this phase retired (G45): every
        // annotation on them — a delay, a wrong code, a refund decision — is a
        // string the readers no longer parse. `ensureEventDetails` converts them
        // through the one module that still knows the encoding.
        if (version < 7) orders = orders.map(ensureEventDetails);
        return { orders, seeded: state.seeded ?? false };
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        // Lay the working set down the first time this device hydrates.
        state?.seed();
        // A device closed over a scheduled order's slot has to catch up before
        // any surface reads the board, or the order sits in `scheduled` looking
        // like it was forgotten (Phase 17, G34).
        state?.releaseScheduled();
      },
    },
  ),
);

/**
 * Rehydrate this store when another window writes to it (Phase 18, G42) — one
 * surface accepting, blocking or paying changes what the surface in the next tab
 * is looking at, without a reload.
 */
syncAcrossWindows("foodora-orders", () => void useOrders.persist.rehydrate());

/**
 * Which delivery zone an order belongs to — matched on the drop area. Dispatch
 * uses it to prefer riders who are actually nearby.
 *
 * The matching itself moved to `lib/serviceability.zoneForArea` so the rider app's
 * own zone lookup gives the same answer (G39): a real order's trip has to be priced
 * by the same zone dispatch used to choose its courier.
 *
 * Phase 19 (G30) moved the *list* it matches against, from the seed to the folded
 * network. Same reason, one step further out: an operator who moves an area from
 * one zone to another has to move the couriers dispatch prefers for it, or the
 * order is priced by one zone and offered to the other's fleet.
 */
function zoneForOrder(order: Order): string | null {
  return zoneForArea(platformZones(), order.address?.area)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Selectors — shared by the four surfaces so none of them re-derives the rules
// ---------------------------------------------------------------------------

/** Orders belonging to one restaurant, newest first. */
export function ordersForVendor(orders: Order[], vendorId: string): Order[] {
  return orders
    .filter((o) => o.vendor.id === vendorId)
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}

/** Delivery orders a courier could take right now. */
export function dispatchableOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.status === "ready" && o.fulfillment === "delivery");
}

/**
 * Riders who are carrying an order right now.
 *
 * The admin's fleet board and dispatch were each deriving this for themselves —
 * one from the live board, one not at all. One selector, so "busy" cannot mean
 * two things.
 */
export function busyRiderIds(orders: Order[]): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    const riderId = order.lifecycle.rider?.id;
    if (riderId && isActiveDelivery(order)) ids.add(riderId);
  }
  return ids;
}

/**
 * Everyone dispatch must not pick: riders holding an order, plus riders the shift
 * board says are off shift or already on a synthesised trip (G40).
 *
 * This is where the two halves of availability meet. Neither store can answer it
 * alone — the orders store cannot see a shift, and the shift board deliberately
 * does not mirror orders — so the union is computed once, here, and injected into
 * `dispatchRider`.
 */
/**
 * Everyone dispatch may choose from: the seeded fleet plus the riders this device
 * admitted by approving an application. Who among them is *available* is a
 * separate question — see `unavailableRiderIds`.
 */
export function dispatchableFleet(): Rider[] {
  return [...riders, ...useOnboarding.getState().admittedRiders].filter(
    (r) => !r.deletedAt,
  );
}

export function unavailableRiderIds(orders: Order[]): Set<string> {
  const ids = busyRiderIds(orders);
  for (const id of offShiftRiderIds(useFleet.getState().shifts)) ids.add(id);
  // Phase 7: onboarding is the third half. A rider who is suspended, deactivated
  // or not approved yet is not "busy" and not "off shift" — they may not be given
  // work at all — and this is where that reaches dispatch, so no caller has to
  // remember a second check.
  for (const id of undispatchableRiderIds(useOnboarding.getState().riderApplications)) {
    ids.add(id);
  }
  return ids;
}

/** Carrying food, or on the way to collect it — not free for another job. */
function isActiveDelivery(order: Order): boolean {
  return !isTerminal(order.status) && order.status !== "delivered";
}

/** The order a given rider is currently carrying, if any. */
export function activeOrderForRider(orders: Order[], riderId: string): Order | null {
  return (
    orders.find((o) => o.lifecycle.rider?.id === riderId && isActiveDelivery(o)) ?? null
  );
}

/** Orders a rider has finished, newest first. */
export function completedOrdersForRider(orders: Order[], riderId: string): Order[] {
  return orders
    .filter(
      (o) =>
        o.lifecycle.rider?.id === riderId &&
        (o.status === "delivered" || o.status === "completed"),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/**
 * Delivered orders nobody has closed yet — the operations desk's settle queue.
 *
 * These are invisible on the live board (they are no longer in flight) and
 * invisible in the financial views (their money is not worked out until they
 * complete), which is exactly why they need a surface of their own: before
 * `completed` had a human actor, this was where every order quietly stopped.
 * Oldest first — the one that has waited longest is the one to close.
 */
export function awaitingCompletion(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.status === "delivered")
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

/** Everything still in flight, oldest first — the admin's live board. */
export function liveOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => !isTerminal(o.status) && o.status !== "delivered")
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
}
