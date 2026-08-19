"use client";

import { useEffect, useMemo } from "react";
import type { DeliveryJob, Order } from "@/types";
import { useRider } from "@/stores/rider";
import { useFleet } from "@/stores/fleet";
import {
  activeOrderForRider,
  completedOrdersForRider,
  useOrders,
} from "@/stores/orders";
import type { RiderContext } from "@/services/delivery";
import { useRiderApp } from "./rider-context";

/**
 * useRiderRecords — everything the rider app knows about this rider, in one
 * place (G39).
 *
 * Four screens (today, earnings, history, wallet) each used to assemble the same
 * `RiderContext` from the device store, and none of them included the real orders
 * the rider had actually delivered — so a real delivery earned nothing on any of
 * them. Two more screens asked "is this rider busy?" and got different answers
 * depending on which store they happened to read.
 *
 * Both problems are the same problem: the rider's reality was assembled per
 * screen. This hook assembles it once. Every screen that needs any part of it
 * reads it from here, so a real delivery and a synthesised trip are visible to
 * all of them at the same instant, and "busy" means one thing.
 */
export interface RiderRecords {
  /** What the delivery seam needs that it cannot see for itself. */
  ctx: RiderContext;
  /** Both stores are hydrated — nothing derived from them is safe before this. */
  hydrated: boolean;
  /** On shift, per the device (and published to the shared board). */
  online: boolean;
  /** The synthesised trip in progress, if any. */
  activeJob: DeliveryJob | null;
  /** The real customer order in progress, if any. */
  activeOrder: Order | null;
  /**
   * Holding work of either kind. The one question dispatch, the offer pool and
   * the live-order list all have to agree on: a rider with food in their bag
   * cannot take a second job, whichever system it came from.
   */
  busy: boolean;
}

export function useRiderRecords(): RiderRecords {
  const { rider } = useRiderApp();

  const online = useRider((s) => s.online);
  const activeJob = useRider((s) => s.activeJob);
  const completed = useRider((s) => s.completed);
  const declined = useRider((s) => s.declined);
  const remittances = useRider((s) => s.remittances);
  const withdrawals = useRider((s) => s.withdrawals);
  const riderHydrated = useRider((s) => s.hydrated);
  const identify = useRider((s) => s.identify);

  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);

  // Both stores back this screen, so both have to be asked to hydrate — the
  // rider shell only knows about its own.
  useEffect(() => {
    useOrders.persist.rehydrate();
    useFleet.persist.rehydrate();
  }, []);

  // Claim the device for this rider, so the shift it publishes is attributable.
  useEffect(() => {
    if (riderHydrated) identify(rider.id);
  }, [rider.id, riderHydrated, identify]);

  const delivered = useMemo(
    () => completedOrdersForRider(orders, rider.id),
    [orders, rider.id],
  );
  const activeOrder = useMemo(
    () => activeOrderForRider(orders, rider.id),
    [orders, rider.id],
  );

  const ctx = useMemo<RiderContext>(
    () => ({ orders: delivered, completed, declined, remittances, withdrawals }),
    [delivered, completed, declined, remittances, withdrawals],
  );

  return {
    ctx,
    hydrated: riderHydrated && ordersHydrated,
    online,
    activeJob,
    activeOrder,
    busy: Boolean(activeJob) || Boolean(activeOrder),
  };
}
