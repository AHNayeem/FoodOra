import { Injectable } from '@nestjs/common';

import type { RoutePoint, RoutingProviderPort } from '../../shared/contracts';

/** Mean Earth radius, km. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance. No network, no key, no bill, no roads.
 *
 * The honest description of what this returns is "how far away it is if you could
 * fly", which is exactly what a listing card means by "1.2 km" and what the Phase C
 * mock's fixed `distanceKm` was pretending to be. It is *not* a delivery distance:
 * in Dhaka the driving distance across a river or around Hatirjheel can be three
 * times this number, so a fare or a rider ETA built on it will be wrong in the
 * direction that costs money. That is the whole reason this sits behind
 * `RoutingProviderPort` — see `shared/contracts/routing.contract.ts`.
 */
export function haversineKm(from: RoutePoint, to: RoutePoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2;

  // `Math.min(1, …)` guards the antipodal case, where floating-point error can push
  // the argument of `asin` just past 1 and turn a real distance into NaN.
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))) * 10) / 10;
}

@Injectable()
export class HaversineRoutingProvider implements RoutingProviderPort {
  readonly name = 'haversine';

  /**
   * Resolved, not awaited: there is nothing to wait for. The promise is here because
   * the port is shaped for providers that make a network call, and a synchronous port
   * would make the first one of those a breaking change everywhere.
   */
  distanceKm(origin: RoutePoint, destinations: readonly RoutePoint[]): Promise<number[]> {
    return Promise.resolve(destinations.map((destination) => haversineKm(origin, destination)));
  }
}
