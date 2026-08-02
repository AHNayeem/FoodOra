import type { Order, OrderEvent, OrderStatus } from "@/frontend/types";
import {
  isFailure,
  isTerminal,
  stagesFor,
  stageIndex,
  DELIVERY_STAGES,
  PICKUP_STAGES,
} from "./order-machine";
import { etaInMs, prepFraction, readyInMs, toMinutes } from "./order-lifecycle";

/**
 * tracking.ts — the customer's view of where their order is.
 *
 * This module used to *invent* that answer: it interpolated a status from the
 * elapsed time between `placedAt` and `estimatedDeliveryAt`, which meant an
 * order marched to "delivered" on a timer whether or not a restaurant had ever
 * seen it, and the mandatory OTP gate could be skipped by waiting forty minutes.
 *
 * It now reads. Status is whatever the restaurant and the rider actually did
 * (`stores/orders` + `lib/order-machine`); the only things still derived from
 * the clock are the things that genuinely are estimates — countdowns, ETAs and
 * how far through the promised preparation window the kitchen is.
 *
 * Re-exports the stage lists so existing callers keep one import.
 */

export { DELIVERY_STAGES, PICKUP_STAGES, stagesFor };

export interface TrackStep {
  status: OrderStatus;
  /** When it actually happened (ms), or null if it hasn't yet. */
  at: number | null;
  /** Reached. */
  done: boolean;
  /** The stage the order is sitting in right now. */
  active: boolean;
  /** Who performed it, for the timeline's attribution line. */
  actor: OrderEvent["actor"] | null;
  /** Free-text detail recorded with the event (a delay, a reason). */
  note: string | null;
}

export interface TrackingProgress {
  steps: TrackStep[];
  /** The order's real status. */
  currentStatus: OrderStatus;
  /** Index into `steps`; -1 for a status that is not on the happy path. */
  currentIndex: number;
  /** Handed over — `delivered` or `completed`. */
  complete: boolean;
  /** Ended badly — rejected, cancelled, returned, refunded, or a failed drop. */
  failed: boolean;
  /** Kept for callers that only care about the cancelled/rejected case. */
  cancelled: boolean;
  /** Nothing follows this status. */
  terminal: boolean;
  /** Projected hand-off time (ms). */
  etaMs: number;
  /** Time left until the ETA (ms, clamped ≥ 0). */
  remainingMs: number;
  /** Time until the kitchen promised the food would be ready (ms); null if unpromised. Negative when overdue. */
  readyMs: number | null;
  /** 0..1 through the promised preparation window. */
  prepFraction: number;
  /** 0..1 along the whole journey, for the map marker and progress bar. */
  fraction: number;
}

/**
 * Derive the customer-facing tracking view of `order` at wall-clock `now` (ms).
 *
 * Pure and deterministic. The event log supplies the "when" for every step that
 * has happened; steps that have not happened simply have no time, which is
 * honest — a real app cannot tell you when your food will be packed either.
 */
export function trackingProgress(order: Order, now: number): TrackingProgress {
  const stages = stagesFor(order.fulfillment);
  const events = order.lifecycle?.events ?? [];

  // First occurrence wins: a status can be revisited (a rider hands a job back
  // and the order returns to `ready`), and the timeline shows when it was first
  // reached rather than the most recent bounce.
  const firstByStatus = new Map<OrderStatus, OrderEvent>();
  for (const event of events) {
    if (!firstByStatus.has(event.status)) firstByStatus.set(event.status, event);
  }

  const currentIndex = stageIndex(order.status, order.fulfillment);
  const failed = isFailure(order.status);
  const complete = order.status === "delivered" || order.status === "completed";

  const steps: TrackStep[] = stages.map((status, i) => {
    const event = firstByStatus.get(status);
    return {
      status,
      at: event ? Date.parse(event.at) : null,
      done: !!event,
      active: !failed && i === currentIndex && !complete,
      actor: event?.actor ?? null,
      note: event?.note ?? null,
    };
  });

  const remainingMs = etaInMs(order, now);

  return {
    steps,
    currentStatus: order.status,
    currentIndex,
    complete,
    failed,
    cancelled: order.status === "cancelled" || order.status === "rejected",
    terminal: isTerminal(order.status),
    etaMs: Date.parse(order.estimatedDeliveryAt),
    remainingMs,
    readyMs: readyInMs(order, now),
    prepFraction: prepFraction(order, now),
    fraction: journeyFraction(order, now),
  };
}

/**
 * How far along the route the courier is, 0..1 — what moves the map marker.
 *
 * Stage index alone is too coarse (the marker would jump in five big steps and
 * then sit still for the whole ride), so the leg the order is *in* is smoothed
 * by the clock: within `on-the-way`, the marker creeps from the pickup toward
 * the door as the ETA approaches. The clock is used for animation only — it can
 * never move the order to the next status.
 */
function journeyFraction(order: Order, now: number): number {
  const stages = stagesFor(order.fulfillment);
  const idx = stageIndex(order.status, order.fulfillment);
  if (idx < 0) return 0;
  if (order.status === "delivered" || order.status === "completed") return 1;

  const base = idx / (stages.length - 1);

  if (order.status === "on-the-way") {
    const startedAt = order.lifecycle.events.find((e) => e.status === "on-the-way");
    const start = startedAt ? Date.parse(startedAt.at) : now;
    const end = Date.parse(order.estimatedDeliveryAt);
    const span = Math.max(end - start, 60_000);
    const within = Math.min(1, Math.max(0, (now - start) / span));
    const next = (idx + 1) / (stages.length - 1);
    return base + (next - base) * within;
  }

  return base;
}

/** ETA remaining in whole minutes, for the countdown display. */
export function remainingMinutes(remainingMs: number): number {
  return toMinutes(remainingMs);
}

/**
 * Whether a courier is assigned. Now a fact rather than a guess: the order
 * carries the rider snapshot from the moment dispatch assigns one, so the
 * customer meets their rider at `rider-assigned` instead of at `picked-up`.
 */
export function hasCourier(order: Order): boolean {
  return order.fulfillment === "delivery" && order.lifecycle.rider !== null;
}
