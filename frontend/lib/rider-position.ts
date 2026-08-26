import type {
  Coordinates,
  DeliveryJob,
  DeliveryStop,
  Order,
  RiderPosition,
  RiderPositionPhase,
  RiderPositionSource,
  RiderTrack,
} from "@/types";
import { isFailure } from "./order-machine";
import { timeOf } from "./order-lifecycle";

/**
 * rider-position.ts — where the courier is (G38).
 *
 * The prototype used to answer this question twice, differently. The customer's
 * tracker moved a marker along a straight line by a *stage* fraction smoothed
 * with the clock (`lib/tracking.journeyFraction`), while the rider's own map
 * jumped between stops by counting completed ones (`components/rider/route-map`)
 * — and the operations desk had no answer at all. Three surfaces, three
 * positions, one delivery.
 *
 * This module is the single answer. It publishes **one representation**
 * (`RiderTrack`: the route, plus a `RiderPosition` on it) derived from the
 * *active delivery* — the trip a real order projects through
 * `lib/delivery-bridge`, or a synthesised one — so the same rider on the same
 * order is in the same place on every screen at the same instant.
 *
 * Four properties are the design:
 *
 *  - **Route-based, not line-based.** The position is interpolated along the
 *    optimised route's real geometry (`path[i + 1]` is `stops[i]`, leg `i` is
 *    `stops[i].legKm` long), so it agrees with the map the router drew and a
 *    batch works with no special case.
 *  - **Lifecycle-aware.** Progress *between* stops is smoothed by the clock;
 *    progress *past* a stop is only ever the rider's own record. The clock can
 *    move the marker toward the door and can never move it through it — the same
 *    rule `lib/tracking` states, kept rather than rewritten: the smoothing here
 *    is that module's `on-the-way` interpolation, generalised to any leg.
 *  - **Deterministic.** No randomness and no stored state: the same delivery and
 *    the same `now` always give the same fix, on the server, in three tabs, and
 *    after a hard refresh.
 *  - **Provider-shaped.** Everything above is `mockRiderPositions`, one
 *    implementation of `RiderPositionProvider`. A real GPS or WebSocket feed
 *    registers through `setRiderPositionProvider` and every screen keeps working
 *    — none of them import the mock.
 *
 * There is no GPS, no socket and no polling here; the mock is honest about being
 * a simulation and says so in `position.source`.
 */

/** Shortest leg the clock is allowed to smooth over — below this it snaps. */
const MIN_LEG_MS = 60_000;

/**
 * How close to a stop the clock may take the marker on its own.
 *
 * Not 1. Arriving is something the rider reports, so a marker that reaches the
 * door because the ETA elapsed would be the clock asserting a fact — exactly the
 * failure the tracker was rewritten to remove. It creeps up to the kerb and
 * waits there for the record to catch up.
 */
const MAX_APPROACH = 0.95;

// ---------------------------------------------------------------------------
// Provider seam
// ---------------------------------------------------------------------------

/** What a provider is asked about: one trip, optionally its order, at a time. */
export interface RiderTrackInput {
  /** The trip — a real order's (`services/delivery.jobForOrder`) or a synthesised one. */
  job: DeliveryJob;
  /**
   * The customer order behind the trip, when there is one. It is the *authority*
   * on the delivery's lifecycle: which stops are done, when the rider left, and
   * when the food is promised. Absent for a synthesised trip, which carries its
   * own completed stops and nothing else.
   */
  order?: Order | null;
  /**
   * Where the ride began — the point `optimiseRoute` measured the first leg
   * from. Defaults to the first stop, which is what a real order's trip is
   * routed from (`lib/delivery-bridge.jobFromOrder`).
   */
  origin?: Coordinates | null;
  now: number;
}

/**
 * A source of courier positions.
 *
 * The mock below is the only implementation the prototype ships. A real one
 * (`gps`) implements the same method against a socket or a polling endpoint and
 * is installed with `setRiderPositionProvider`; because every surface reads
 * `riderTrack` rather than the mock, nothing else changes — which is the whole
 * reason this indirection exists at a stage where there is only one provider.
 */
export interface RiderPositionProvider {
  readonly source: RiderPositionSource;
  track(input: RiderTrackInput): RiderTrack | null;
}

// ---------------------------------------------------------------------------
// Geometry + time
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Straight-line interpolation between two points. */
function lerp(a: Coordinates, b: Coordinates, f: number): Coordinates {
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

/** Planned riding time for a leg, ms (never zero — `rideMinutes` floors at 1). */
function plannedMs(stop: DeliveryStop): number {
  return Math.max(1, stop.legMinutes) * 60_000;
}

/**
 * When the rider finished a stop, from the order's event log — null when the
 * order does not say, which is every stop of a synthesised trip.
 *
 * Derived rather than stored for the reason `lib/delivery-bridge` gives: the
 * order already records it, and a second copy is a second thing to keep in step.
 */
function completionMs(order: Order | null | undefined, stop: DeliveryStop): number | null {
  if (!order || stop.orderId !== order.id) return null;
  return stop.kind === "pickup" ? timeOf(order, "picked-up") : timeOf(order, "delivered");
}

/**
 * When the rider set off on leg `k`.
 *
 * The recorded moment wins wherever there is one — the previous stop's
 * completion, or the `on-the-way` event for the leg to the customer's door,
 * which is the instant the old tracker started smoothing from and still is. Only
 * where nothing was recorded does it fall back to the plan: the trip's
 * acceptance plus the legs before it, which keeps a synthesised trip moving
 * without inventing history for a real one.
 */
function legStartMs(
  stops: DeliveryStop[],
  k: number,
  job: DeliveryJob,
  order: Order | null | undefined,
): number {
  let at = Date.parse(job.acceptedAt ?? job.offeredAt);
  if (!Number.isFinite(at)) at = Date.parse(job.createdAt);

  for (let i = 0; i < k; i++) {
    at = completionMs(order, stops[i]) ?? at + plannedMs(stops[i]);
  }

  // Collected but still at the counter is not "riding to the door": the customer
  // is told the food is on its way when the rider says it is.
  if (order && stops[k]?.kind === "dropoff" && stops[k].orderId === order.id) {
    const departed = timeOf(order, "on-the-way");
    if (departed != null) at = Math.max(at, departed);
  }

  return at;
}

/**
 * When leg `k` is expected to end.
 *
 * The plan, except for the ride to a real customer's door: that one is timed
 * against the ETA the customer was actually promised, because that is the number
 * both of them are watching and it is what the tracker has always smoothed
 * toward. Using the planned leg instead would put the courier at the kerb while
 * the countdown still said nine minutes.
 */
function legEndMs(
  start: number,
  stop: DeliveryStop,
  order: Order | null | undefined,
): number {
  const planned = start + plannedMs(stop);
  if (!order || stop.kind !== "dropoff" || stop.orderId !== order.id) return planned;
  const eta = Date.parse(order.estimatedDeliveryAt);
  return Number.isFinite(eta) ? Math.max(start + MIN_LEG_MS, eta) : planned;
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

/**
 * What the courier is doing, from the order's status — the authority on it.
 *
 * `delivery-failed` lands in `ended` with the rest of the bad endings, which is
 * right: the rider is standing at a door with food nobody took, and the marker
 * must stop moving rather than complete the route.
 */
function phaseFromOrder(order: Order): RiderPositionPhase {
  if (!order.lifecycle.rider) return "unassigned";
  if (isFailure(order.status)) return "ended";
  if (order.status === "delivered" || order.status === "completed") return "delivered";
  if (order.status === "arrived") return "arrived";
  if (order.status === "on-the-way") return "to-dropoff";
  if (order.status === "picked-up") return "at-pickup";
  return "to-pickup";
}

/**
 * The same question for a synthesised trip, which has no order to ask: its
 * completed stops are all it records, so they are what answers.
 */
function phaseFromStops(
  job: DeliveryJob,
  stops: DeliveryStop[],
  completed: number,
): RiderPositionPhase {
  if (!job.riderId) return "unassigned";
  if (job.status === "cancelled") return "ended";
  if (completed >= stops.length) return "delivered";
  const collected = stops
    .filter((s) => s.kind === "pickup")
    .every((s) => job.completedStopIds.includes(s.id));
  return collected ? "to-dropoff" : completed === 0 ? "to-pickup" : "at-pickup";
}

// ---------------------------------------------------------------------------
// The mock provider
// ---------------------------------------------------------------------------

/**
 * The prototype's position source: the route, the delivery's own progress, and
 * the clock for the leg in between. See the module header for why each of those
 * three is allowed to contribute what it does.
 */
export const mockRiderPositions: RiderPositionProvider = {
  source: "mock",

  track({ job, order, origin, now }: RiderTrackInput): RiderTrack | null {
    const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
    if (stops.length === 0) return null;

    const start: Coordinates = origin ?? { lat: stops[0].lat, lng: stops[0].lng };
    const path: Coordinates[] = [start, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];

    const done = new Set(job.completedStopIds);
    const completed = stops.filter((s) => done.has(s.id)).length;
    const phase = order ? phaseFromOrder(order) : phaseFromStops(job, stops, completed);

    // Leg lengths double as the weights that turn leg progress into route
    // progress, so the fraction advances with distance rather than with stop
    // count — a two-minute hop and a nine-kilometre ride are not the same half.
    const lengths = stops.map((s) => Math.max(0, s.legKm));
    const measured = lengths.reduce((a, b) => a + b, 0);
    const weights = measured > 0 ? lengths : stops.map(() => 1);
    const weightTotal = measured > 0 ? measured : stops.length;

    /** Route fraction at the far end of leg `k` (i.e. standing on `stops[k]`). */
    const fractionAt = (k: number) =>
      clamp01(weights.slice(0, k + 1).reduce((a, b) => a + b, 0) / weightTotal);

    const position = ((): RiderPosition => {
      const base = { source: "mock" as const, at: now };

      // Nobody is riding. The route still exists — dispatch can look at it — but
      // there is no courier on it, and saying so beats parking a marker at the
      // restaurant and letting a screen read it as a rider standing there.
      if (phase === "unassigned") {
        return {
          ...base,
          ...path[0],
          phase,
          routeFraction: 0,
          legIndex: 0,
          legFraction: 0,
          headingStopId: stops[0].id,
          moving: false,
        };
      }

      // Finished: on the last stop, route complete, clock stopped at the handoff.
      if (phase === "delivered") {
        const last = stops[stops.length - 1];
        return {
          ...base,
          at: completionMs(order, last) ?? now,
          lat: last.lat,
          lng: last.lng,
          phase,
          routeFraction: 1,
          legIndex: stops.length,
          legFraction: 1,
          headingStopId: null,
          moving: false,
        };
      }

      /**
       * Stopped for good, short of the end. Frozen where the rider actually got
       * to — the door if they reached it (a failed handoff happens on the
       * doorstep), otherwise the last stop they completed — and frozen *at* the
       * moment it ended, so a cancelled order's marker does not keep creeping.
       */
      if (phase === "ended") {
        const reachedDoor =
          order != null &&
          (order.status === "delivery-failed" || order.lifecycle.otpVerifiedAt != null);
        // -1 means they never completed a stop at all — freeze them at the origin
        // rather than at a restaurant they never reached.
        const index = reachedDoor ? stops.length - 1 : completed - 1;
        const at = index >= 0 ? stops[index] : null;
        return {
          ...base,
          at: order ? Date.parse(order.updatedAt) : now,
          lat: at?.lat ?? path[0].lat,
          lng: at?.lng ?? path[0].lng,
          phase,
          routeFraction: at ? fractionAt(index) : 0,
          legIndex: Math.min(completed, stops.length),
          legFraction: at ? 1 : 0,
          headingStopId: stops[Math.min(completed, stops.length - 1)]?.id ?? null,
          moving: false,
        };
      }

      // On the road. The leg is the one after the last stop the rider ticked
      // off — their record, never the clock's opinion of it.
      const k = Math.min(completed, stops.length - 1);
      const heading = stops[k];
      const from = path[k];
      const to = path[k + 1];

      const legStart = legStartMs(stops, k, job, order);
      const legEnd = legEndMs(legStart, heading, order);
      const span = Math.max(legEnd - legStart, MIN_LEG_MS);

      // At the door by the rider's own account: pinned, not interpolated.
      // Collected and not yet away: still at the counter, for the same reason.
      const raw =
        phase === "arrived"
          ? 1
          : phase === "at-pickup"
            ? 0
            : Math.min(MAX_APPROACH, clamp01((now - legStart) / span));

      // A zero-length leg is not a ride: a real order's trip is routed *from* its
      // pickup, so leg 0 has no distance and the courier is simply at the counter.
      const legFraction = heading.legKm <= 0 ? 1 : raw;
      const point = lerp(from, to, legFraction);

      return {
        ...base,
        ...point,
        phase,
        routeFraction: clamp01(
          (weights.slice(0, k).reduce((a, b) => a + b, 0) + weights[k] * legFraction) /
            weightTotal,
        ),
        legIndex: k,
        legFraction,
        headingStopId: heading.id,
        moving: phase === "to-dropoff" || (phase === "to-pickup" && heading.legKm > 0),
      };
    })();

    return {
      jobId: job.id,
      orderId: order?.id ?? job.orders[0]?.orderId ?? null,
      riderId: order?.lifecycle.rider?.id ?? job.riderId,
      path,
      stops,
      completedStopIds: [...job.completedStopIds],
      position,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let provider: RiderPositionProvider = mockRiderPositions;

/**
 * Install a different position source — the seam a real GPS/WebSocket feed
 * arrives through.
 *
 * Deliberately a module-level swap rather than a prop threaded through eight
 * components: the surfaces should not know, and must not have to be edited, for
 * the fixes to become real. Returns the provider it replaced so a caller (a
 * test, a demo toggle) can put the mock back.
 */
export function setRiderPositionProvider(next: RiderPositionProvider): RiderPositionProvider {
  const previous = provider;
  provider = next;
  return previous;
}

/** The provider in force — for a screen that wants to name its source. */
export function riderPositionProvider(): RiderPositionProvider {
  return provider;
}

/**
 * The active delivery's route and the courier on it.
 *
 * The one entry point every surface uses. Null when there is no route to speak
 * of — a trip with no stops.
 */
export function riderTrack(input: RiderTrackInput): RiderTrack | null {
  return provider.track(input);
}

// ---------------------------------------------------------------------------
// Reading a track
// ---------------------------------------------------------------------------

/** Is there a courier on this route right now? */
export function isRiderOnRoute(track: RiderTrack | null): boolean {
  return track != null && track.position.phase !== "unassigned";
}

/** The stop the courier is riding to, resolved from the fix. */
export function headingStop(track: RiderTrack): DeliveryStop | null {
  const { headingStopId } = track.position;
  return headingStopId ? (track.stops.find((s) => s.id === headingStopId) ?? null) : null;
}

/** Route progress as a whole percentage, for a label or a bar. */
export function routePercent(track: RiderTrack): number {
  return Math.round(track.position.routeFraction * 100);
}
