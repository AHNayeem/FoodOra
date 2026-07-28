import type { Order, OrderStatus } from "@/types";

/**
 * tracking.ts — pure logic for the simulated live order tracker (Phase C9).
 *
 * There is no backend in the prototype, so an order's *live* status is derived
 * from elapsed time rather than pushed by a server: `placeOrder` stamps
 * `placedAt` and `estimatedDeliveryAt`, and this module interpolates the
 * lifecycle between them. Only `cancelled` is a real, persisted override (the
 * customer cancelling) — everything else is projected. When the Phase E backend
 * arrives the order's stored `status` becomes authoritative and this derivation
 * is simply dropped; the component contract (`TrackingProgress`) stays the same.
 */

/** Ordered live stages for a delivery order (terminal `cancelled` excluded). */
export const DELIVERY_STAGES: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "picked-up",
  "on-the-way",
  "delivered",
];

/** Ordered stages for pickup — the customer collects it, so it ends at `ready`. */
export const PICKUP_STAGES: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
];

/** The stage sequence for an order's fulfillment type. */
export function stagesFor(fulfillment: Order["fulfillment"]): OrderStatus[] {
  return fulfillment === "pickup" ? PICKUP_STAGES : DELIVERY_STAGES;
}

/**
 * How long before the ETA the kitchen "starts". For an ASAP order (ETA is
 * placed + 40 min) this covers the whole window; for a scheduled order it keeps
 * the order dormant until ~40 min before the requested slot, which is what a
 * real operation does.
 */
const ACTIVE_WINDOW_MS = 40 * 60_000;

export interface TrackStep {
  status: OrderStatus;
  /** Projected wall-clock time (ms) this stage is reached. */
  at: number;
  /** Reached at/before `now`. */
  done: boolean;
  /** The current stage — the last reached one, while not yet complete. */
  active: boolean;
}

export interface TrackingProgress {
  steps: TrackStep[];
  /** Live status: a stage, or `cancelled`. */
  currentStatus: OrderStatus;
  /** Index into `steps` of the current stage; -1 when cancelled. */
  currentIndex: number;
  /** Terminal stage reached (delivered / ready-for-pickup). */
  complete: boolean;
  cancelled: boolean;
  /** Projected hand-off time (ms). */
  etaMs: number;
  /** Time left until the ETA (ms, clamped ≥ 0). */
  remainingMs: number;
  /** 0..1 progress along the timeline, for the map marker / progress bar. */
  fraction: number;
}

/**
 * Derive the live tracking state of `order` at wall-clock `now` (ms). Pure and
 * deterministic, so it produces the same result on every render/tick and after
 * a hard refresh.
 */
export function trackingProgress(order: Order, now: number): TrackingProgress {
  const stages = stagesFor(order.fulfillment);
  const n = stages.length;
  const placed = Date.parse(order.placedAt);
  const eta = Date.parse(order.estimatedDeliveryAt);
  // Progression runs over [start, eta]; `placed` is pinned to the real time.
  const start = Math.max(placed, eta - ACTIVE_WINDOW_MS);
  const total = Math.max(eta - start, 1);

  const cancelled = order.status === "cancelled";

  const at = (i: number) => (i === 0 ? placed : start + (i / (n - 1)) * total);

  // Current stage = the furthest step whose projected time has passed.
  let currentIndex = 0;
  for (let i = 0; i < n; i++) {
    if (now >= at(i)) currentIndex = i;
  }

  const complete = !cancelled && currentIndex >= n - 1;

  const steps: TrackStep[] = stages.map((status, i) => ({
    status,
    at: at(i),
    done: !cancelled && i <= currentIndex,
    active: !cancelled && !complete && i === currentIndex,
  }));

  const fraction = Math.min(1, Math.max(0, (now - start) / total));

  return {
    steps,
    currentStatus: cancelled ? "cancelled" : stages[currentIndex],
    currentIndex: cancelled ? -1 : currentIndex,
    complete,
    cancelled,
    etaMs: eta,
    remainingMs: Math.max(0, eta - now),
    fraction: cancelled ? 0 : complete ? 1 : fraction,
  };
}

/**
 * Can the customer still cancel? Only before the kitchen starts cooking
 * (i.e. while `placed` / `confirmed`), and never once complete or cancelled —
 * matching typical food-delivery cancellation windows.
 */
export function canCancel(order: Order, progress: TrackingProgress): boolean {
  if (progress.cancelled || progress.complete) return false;
  const preparingIndex = stagesFor(order.fulfillment).indexOf("preparing");
  return progress.currentIndex < preparingIndex;
}

/** Whether a courier is assigned yet (delivery orders past the `picked-up` stage). */
export function hasCourier(order: Order, progress: TrackingProgress): boolean {
  if (order.fulfillment !== "delivery" || progress.cancelled) return false;
  return progress.currentIndex >= DELIVERY_STAGES.indexOf("picked-up");
}

/** ETA remaining in whole minutes (rounded), for the countdown display. */
export function remainingMinutes(remainingMs: number): number {
  return Math.max(0, Math.round(remainingMs / 60_000));
}
