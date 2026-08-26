/**
 * How far apart two points are — as the rest of the platform is allowed to know it.
 *
 * ## Why this is a port and not a function
 *
 * Unit 1 computed distance with `haversineKm`, a pure function imported directly by the
 * catalog's listing policy. That is the right first implementation and the wrong long-term
 * dependency: straight-line distance is a *label* ("1.2 km away"), and the moment the same
 * number has to support a delivery fare, a rider ETA or a zone boundary, it has to become a
 * routed distance from Google, OSRM, Mapbox or OpenRouteService. Swapping that in must not
 * mean editing the listing policy, so the policy depends on this interface instead.
 *
 * ## Why the primary method takes an array
 *
 * This is the part that a naive port gets wrong, and it is expensive to get wrong later.
 * A `distanceKm(from, to)` port looks cleaner and forces every future provider into
 * one-HTTP-call-per-row: a 500-vendor listing becomes 500 requests, which is roughly
 * $2.50 per page view on Google's Distance Matrix and hundreds of milliseconds of latency
 * even against a local OSRM. Every one of the four named providers has a matrix endpoint
 * precisely because this is the shape callers actually need, so the port is matrix-first
 * and the scalar case is one destination in an array.
 *
 * ## Why it is async even though haversine is not
 *
 * Because every other implementation is. A synchronous port would make the first real
 * provider a breaking change to every call site — which is the situation this file exists
 * to prevent. `HaversineRoutingProvider` returns an already-resolved promise; the cost of
 * that is one microtask per listing and the benefit is that the seam is honest.
 */

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

/** A WGS-84 point. Structurally identical to the catalog's `GeoPoint`, deliberately. */
export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RoutingProviderPort {
  /**
   * The provider's name, for logs and for the boot-time assertion that what is
   * configured is what is running.
   */
  readonly name: string;

  /**
   * Distance in kilometres from one origin to many destinations.
   *
   * **Contract:** the result is positionally aligned with `destinations` and has the
   * same length. A provider that cannot route to a particular destination returns the
   * straight-line distance for that element rather than `null` — the caller is
   * rendering a label and sorting a list, and a null would propagate into both. A
   * provider that cannot answer *at all* throws, so the failure is visible instead of
   * silently reordering a listing by a column of zeroes.
   *
   * Kilometres, rounded to one decimal place: the precision the UI renders. Returning
   * more invites a caller to compare two distances that differ by metres of arithmetic.
   */
  distanceKm(origin: RoutePoint, destinations: readonly RoutePoint[]): Promise<number[]>;
}
