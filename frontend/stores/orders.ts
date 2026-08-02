"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Order,
  OrderActor,
  OrderStatus,
  Rider,
} from "@/frontend/types";
import { buildDemoOrders, riders } from "@/frontend/lib/mock";
import { notificationsFor, nearYouNotification } from "@/frontend/lib/notifications";
import {
  addDelay,
  isTerminal,
  recordOtpFailure,
  requestRefund,
  transition,
  type TransitionError,
  type TransitionPatch,
} from "@/frontend/lib/order-machine";
import {
  dispatchRider,
  ensureLifecycle,
  riderSnapshot,
} from "@/frontend/lib/order-lifecycle";
import { emitNotifications, useNotifications } from "./notifications";
import { useWallet } from "./wallet";

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
 * tab beside it, because both are reading the same key in localStorage.
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
const STORE_VERSION = 2;

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
  /** Auto-dispatch: pick a rider for a `ready` order and assign them. */
  autoDispatch: (id: string) => { order: Order | null; error: string | null };
  /** Log a wrong handoff code. */
  failOtp: (id: string) => Order | null;
  /** Customer asks for their money back on a failed order. */
  askRefund: (id: string) => void;
  /** Raise the "your rider is nearly there" nudge, once per order. */
  notifyNearby: (id: string) => void;

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
    // The machine flips a paid online order to `refunded` on cancel/reject; a
    // returned one is still `paid`. Either way the money left the wallet.
    (order.payment.status === "paid" || order.payment.status === "refunded")
  );
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

        const result = transition(current, to, actor, patch);
        if (result.error) return { order: null, error: result.error };

        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? result.order : o)),
        }));
        emitNotifications(notificationsFor(result.order, result.event));

        // Settling the wallet is part of committing the transition, not a thing
        // a surface remembers to do: an order can be cancelled from four of
        // them, and the money has to come back from all four. The follow-on
        // `refunded` transition is what tells the customer, through the same
        // notification path as every other status.
        //
        // The caller's transition already succeeded, so a failure here must not
        // be reported as its failure — the settlement is reported only by what
        // it commits.
        if (owesWalletRefund(result.order)) {
          const credited = useWallet
            .getState()
            .refundOrder(
              result.order.pricing.total,
              result.order.vendor.name,
              result.order.orderNumber,
            );
          if (credited) {
            const settled = get().advance(id, "refunded", "system", {
              refundAmount: result.order.pricing.total,
            });
            if (settled.order) return { order: settled.order, error: null };
          }
        }

        return { order: result.order, error: null };
      },

      delayOrder: (id, minutes) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? addDelay(o, minutes) : o)),
        })),

      assignRider: (id, rider, assignment) =>
        get().advance(id, "rider-assigned", "system", {
          rider: riderSnapshot(rider),
          assignment,
        }),

      autoDispatch: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return { order: null, error: "errors.notFound" };
        const zoneId = zoneForOrder(order);
        const rider = dispatchRider(order, riders, zoneId);
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

      askRefund: (id) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? requestRefund(o) : o)),
        })),

      notifyNearby: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        emitNotifications([nearYouNotification(order, new Date().toISOString())]);
      },

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const demo = buildDemoOrders(now);
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
        set({ orders: buildDemoOrders(now), seeded: true });
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
        if (version < 2) {
          return {
            orders: state.orders.map(ensureLifecycle),
            seeded: state.seeded ?? false,
          };
        }
        return state;
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        // Lay the working set down the first time this device hydrates.
        state?.seed();
      },
    },
  ),
);

/**
 * Which delivery zone an order belongs to — matched on the drop area, falling
 * back to the vendor's. Dispatch uses it to prefer riders who are actually
 * nearby. A backend would resolve this from coordinates; the areas are enough
 * here because the seed's zones are defined by exactly these labels.
 */
function zoneForOrder(order: Order): string | null {
  const area = order.address?.area?.toLowerCase() ?? "";
  if (!area) return null;
  if (/gulshan|banani|baridhara|bashundhara|niketan|mohakhali|badda/.test(area)) {
    return "dzn_gulshan";
  }
  if (/dhanmondi|kalabagan|mohammadpur|lalmatia|shantinagar|tejgaon/.test(area)) {
    return "dzn_dhanmondi";
  }
  if (/uttara|mirpur|pallabi|kalshi/.test(area)) return "dzn_uttara";
  return null;
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

/** The order a given rider is currently carrying, if any. */
export function activeOrderForRider(orders: Order[], riderId: string): Order | null {
  return (
    orders.find(
      (o) =>
        o.lifecycle.rider?.id === riderId &&
        !isTerminal(o.status) &&
        o.status !== "delivered",
    ) ?? null
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

/** Everything still in flight, oldest first — the admin's live board. */
export function liveOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => !isTerminal(o.status) && o.status !== "delivered")
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
}
