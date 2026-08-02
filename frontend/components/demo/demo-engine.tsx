"use client";

import { useEffect, useRef } from "react";
import { useOrders } from "@/stores/orders";
import { useNotifications } from "@/stores/notifications";
import { useDemo } from "@/stores/demo";
import { nextMove, shouldNudgeNearby } from "@/lib/order-sim";

/** How often the autopilot looks at the board. */
const TICK_MS = 3000;

/**
 * DemoEngine — plays the actors nobody is currently playing.
 *
 * Mounted once in the root layout, renders nothing. Every few seconds it asks
 * `lib/order-sim` whether any live order has rested long enough for its next
 * move, and applies it through the *same* store action a person's tap goes
 * through — so it can be refused by the machine, it emits the same
 * notifications, and it cannot reach a state a person could not.
 *
 * This exists because a demonstration has one person and the lifecycle has
 * three. Turning it off (the demo bar's switch) leaves every surface fully
 * drivable by hand; leaving it on means the customer's tracker tells the whole
 * story on its own.
 *
 * The `nudged` set is local rather than persisted: a duplicate "your rider is
 * close" after a reload is a smaller sin than persisting bookkeeping that has no
 * meaning outside this browser tab.
 */
export function DemoEngine() {
  const nudged = useRef<Set<string>>(new Set());

  useEffect(() => {
    useDemo.persist.rehydrate();
    useOrders.persist.rehydrate();
    // Notifications are rehydrated here, from the root layout, rather than only
    // in the bell: a transition can emit before any bell has mounted, and a
    // later rehydrate would overwrite the pushed items with the stored list.
    useNotifications.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const { autopilot, speed } = useDemo.getState();
      if (!autopilot) return;

      const store = useOrders.getState();
      if (!store.hydrated) return;

      const now = Date.now();

      for (const order of store.orders) {
        // "Near you" is a nudge, not a transition — it fires mid-ride.
        if (!nudged.current.has(order.id) && shouldNudgeNearby(order, now, speed)) {
          nudged.current.add(order.id);
          store.notifyNearby(order.id);
        }

        const move = nextMove(order, now, speed);
        if (!move) continue;

        if (move.kind === "dispatch") {
          store.autoDispatch(order.id);
          continue;
        }
        if (move.to && move.actor) {
          store.advance(order.id, move.to, move.actor, move.patch ?? {});
        }
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  return null;
}
