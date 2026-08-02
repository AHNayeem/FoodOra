import type {
  DeliveryJob,
  DeliveryPayout,
  DeliveryStop,
  DeliveryZone,
  RemittanceMethod,
  RiderCashPosition,
  RiderEarningsPoint,
  RiderEarningsSummary,
  RiderRemittance,
  RiderVehicle,
} from "@/frontend/types";
import { roundMoney } from "@/frontend/lib/checkout";
import { toDateKey } from "@/frontend/lib/dates";

/**
 * delivery.ts — the arithmetic behind the rider app (Phase C18). Pure and
 * deterministic: the same trip and clock always produce the same route, payout
 * and earnings, on the server and after a hard refresh.
 *
 * Three things worth stating up front, because they are the design:
 *
 *  - **The route is computed, not stored.** A trip holds unordered work (pick up
 *    here, drop there); `optimiseRoute` puts it in the order a rider would
 *    actually ride it, respecting the one hard constraint — you cannot deliver an
 *    order you have not collected. Batching therefore needs no special case
 *    anywhere: two orders are just four stops through the same function.
 *  - **Distances are real.** Vendors and addresses carry coordinates, so legs are
 *    great-circle distance with a street-detour factor rather than a made-up
 *    number, which is what makes the payout and the ETA agree with the map.
 *  - **The handoff code is derived from the order id**, so the rider's app and
 *    the customer's tracker show the same four digits with nothing shared
 *    between them but the order (spec: OTP Verification). A real deployment
 *    replaces `otpFor` with a server-issued code and both screens keep working.
 */

/** Vehicles a rider can register, in the order the profile screen lists them. */
export const VEHICLES = [
  "bike",
  "scooter",
  "bicycle",
  "car",
] as const satisfies readonly RiderVehicle[];

/** Ways of handing collected cash back (spec: Cash Collection). */
export const REMITTANCE_METHODS = [
  "agent",
  "bank",
  "wallet",
] as const satisfies readonly RemittanceMethod[];

/** Average city speed per vehicle, km/h — traffic-adjusted, not top speed. */
const SPEED_KMH: Record<RiderVehicle, number> = {
  bike: 22,
  scooter: 24,
  bicycle: 14,
  car: 18,
};

/**
 * Straight-line distance underestimates a ride, so legs are scaled by a detour
 * factor. 1.35 is the usual "circuity" figure for dense city grids.
 */
const DETOUR_FACTOR = 1.35;

/** Minutes lost standing still at each kind of stop (waiting, parking, handing over). */
const HANDLING_MINUTES: Record<DeliveryStop["kind"], number> = {
  pickup: 5,
  dropoff: 3,
};

/** Digits in a handoff code. */
const OTP_LENGTH = 4;

// ---------------------------------------------------------------------------
// Geometry + time
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance between two points, km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ridable distance between two points, km (great-circle × detour factor). */
export function rideKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * DETOUR_FACTOR;
}

/** Riding time for a distance on a given vehicle, whole minutes (min 1). */
export function rideMinutes(km: number, vehicle: RiderVehicle): number {
  return Math.max(1, Math.round((km / SPEED_KMH[vehicle]) * 60));
}

// ---------------------------------------------------------------------------
// Route optimisation
// ---------------------------------------------------------------------------

/** A stop before the router has decided where it falls in the ride. */
export type UnroutedStop = Omit<
  DeliveryStop,
  "sequence" | "legKm" | "legMinutes"
>;

/**
 * Order the stops of a trip into the ride a rider would actually make, and
 * measure each leg (spec: Route Optimization).
 *
 * Greedy nearest-neighbour from `origin`, with one precedence rule: an order's
 * dropoff only becomes reachable once its pickup has been taken. For the two- to
 * four-stop trips a batch produces, nearest-feasible-first is optimal often
 * enough and — more importantly — is explainable to the rider looking at the
 * list, which a fancier solver is not.
 */
export function optimiseRoute(
  origin: LatLng,
  stops: UnroutedStop[],
  vehicle: RiderVehicle,
): DeliveryStop[] {
  const remaining = [...stops];
  const routed: DeliveryStop[] = [];
  const collected = new Set<string>();
  let at = origin;

  while (remaining.length > 0) {
    const feasible = remaining.filter(
      (s) => s.kind === "pickup" || collected.has(s.orderId),
    );
    // Only unreachable dropoffs left (malformed trip) — fall back to input order.
    const pool = feasible.length > 0 ? feasible : remaining;

    let bestIndex = 0;
    let bestKm = Infinity;
    pool.forEach((stop, i) => {
      const km = rideKm(at, stop);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    });

    const next = pool[bestIndex];
    remaining.splice(remaining.indexOf(next), 1);
    if (next.kind === "pickup") collected.add(next.orderId);

    const legKm = Math.round(rideKm(at, next) * 100) / 100;
    routed.push({
      ...next,
      sequence: routed.length,
      legKm,
      legMinutes: rideMinutes(legKm, vehicle),
    });
    at = next;
  }

  return routed;
}

/** Whole-route distance, km (sum of legs, 2dp). */
export function routeDistanceKm(stops: DeliveryStop[]): number {
  return Math.round(stops.reduce((km, s) => km + s.legKm, 0) * 100) / 100;
}

/** Whole-route time, minutes: riding plus standing still at every stop. */
export function routeMinutes(stops: DeliveryStop[]): number {
  return stops.reduce(
    (min, s) => min + s.legMinutes + HANDLING_MINUTES[s.kind],
    0,
  );
}

// ---------------------------------------------------------------------------
// Payout (spec: Delivery Charges, Delivery Earnings)
// ---------------------------------------------------------------------------

/** Is this hour a peak hour in the zone? */
export function isPeakHour(zone: DeliveryZone, at: Date): boolean {
  return zone.peakHours.includes(at.getHours());
}

/**
 * What a trip pays. Base fare and distance come from the zone's rules, peak
 * uplift applies to both, each extra order adds a batch bonus, and customer tips
 * pass straight through. Rounded to the currency's own precision so the itemised
 * lines always add up to the total the rider is shown.
 */
export function computePayout({
  zone,
  distanceKm,
  orderCount,
  tips,
  at,
}: {
  zone: DeliveryZone;
  distanceKm: number;
  orderCount: number;
  tips: number;
  /** When the trip runs — decides whether peak pay applies. */
  at: Date;
}): DeliveryPayout {
  const currency = zone.currency;
  const round = (n: number) => roundMoney(n, currency);

  const baseFare = round(zone.baseFare);
  const distanceFee = round(distanceKm * zone.perKm);
  const peakBonus = isPeakHour(zone, at)
    ? round((baseFare + distanceFee) * (zone.peakMultiplier - 1))
    : 0;
  const batchBonus = round(Math.max(0, orderCount - 1) * zone.batchBonus);
  const tip = round(tips);

  return {
    currency,
    baseFare,
    distanceFee,
    peakBonus,
    batchBonus,
    tip,
    total: round(baseFare + distanceFee + peakBonus + batchBonus + tip),
  };
}

// ---------------------------------------------------------------------------
// Handoff codes (spec: OTP Verification)
// ---------------------------------------------------------------------------

/**
 * The handoff code for an order — a stable 4-digit number derived from its id.
 *
 * Derivation (rather than storage) is what lets the customer's tracker and the
 * rider's app agree without a backend between them: both hash the same order id.
 * Phase E replaces this with a server-issued, single-use code; every caller
 * stays the same.
 */
export function otpFor(orderId: string): string {
  let h = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    h = Math.imul(h ^ orderId.charCodeAt(i), 16777619);
  }
  const value = (h >>> 0) % 10 ** OTP_LENGTH;
  return String(value).padStart(OTP_LENGTH, "0");
}

/** Does the code the customer read out match this stop's? Whitespace-tolerant. */
export function otpMatches(stop: DeliveryStop, entered: string): boolean {
  if (!stop.otp) return true; // pickups have nothing to verify
  return stop.otp === entered.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Trip progress
// ---------------------------------------------------------------------------

export interface JobProgress {
  /** Stops in route order, each flagged done / current. */
  steps: { stop: DeliveryStop; done: boolean; current: boolean; etaMs: number }[];
  /** The stop the rider is riding to, or null when the trip is finished. */
  nextStop: DeliveryStop | null;
  /** Stops completed. */
  completed: number;
  total: number;
  /** 0..1 along the route, for the map marker and progress bar. */
  fraction: number;
  /** Every order collected — the rider is now delivering. */
  allPickedUp: boolean;
  /** Projected finish time (ms) for the whole trip. */
  finishMs: number;
  /** Minutes left, from `now`. */
  remainingMinutes: number;
}

/**
 * Where a trip stands. Which stops are done is the rider's own record (stored on
 * the job, not projected from a clock — the rider is the source of truth here);
 * what is *estimated* is the time still to come, which is added up from the
 * remaining legs. So the checklist never lies about progress, and the ETA is
 * honest about being an estimate.
 */
export function jobProgress(job: DeliveryJob, now: number): JobProgress {
  const done = new Set(job.completedStopIds);
  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const completed = stops.filter((s) => done.has(s.id)).length;

  const nextStop = stops.find((s) => !done.has(s.id)) ?? null;

  let cursor = now;
  const steps = stops.map((stop) => {
    const isDone = done.has(stop.id);
    if (!isDone) cursor += (stop.legMinutes + HANDLING_MINUTES[stop.kind]) * 60_000;
    return {
      stop,
      done: isDone,
      current: stop.id === nextStop?.id,
      etaMs: cursor,
    };
  });

  const allPickedUp = stops
    .filter((s) => s.kind === "pickup")
    .every((s) => done.has(s.id));

  return {
    steps,
    nextStop,
    completed,
    total: stops.length,
    fraction: stops.length === 0 ? 0 : completed / stops.length,
    allPickedUp,
    finishMs: cursor,
    remainingMinutes: Math.max(0, Math.round((cursor - now) / 60_000)),
  };
}

/** The status a job's completed stops imply — kept in step with `completeStop`. */
export function statusFromProgress(job: DeliveryJob): DeliveryJob["status"] {
  if (job.status === "cancelled") return "cancelled";
  const progress = jobProgress(job, 0);
  if (progress.completed === 0) return "accepted";
  if (progress.completed >= progress.total) return "delivered";
  return progress.allPickedUp ? "delivering" : "picking-up";
}

/** An offer nobody took in time. */
export function isOfferExpired(job: DeliveryJob, now: number): boolean {
  return Date.parse(job.expiresAt) <= now;
}

/** Seconds left on an offer, clamped at 0 — drives the countdown ring. */
export function offerSecondsLeft(job: DeliveryJob, now: number): number {
  return Math.max(0, Math.round((Date.parse(job.expiresAt) - now) / 1000));
}

/** Orders on the trip, as the rider counts them (a batch is more than one). */
export function isBatch(job: DeliveryJob): boolean {
  return job.orders.length > 1;
}

/** Cash still to collect on the stops the rider has not completed yet. */
export function cashOutstanding(job: DeliveryJob): number {
  const done = new Set(job.completedStopIds);
  return job.stops
    .filter((s) => !done.has(s.id))
    .reduce((sum, s) => sum + s.cashDue, 0);
}

// ---------------------------------------------------------------------------
// Earnings (spec: Delivery Earnings)
// ---------------------------------------------------------------------------

/** A trip counts towards earnings once it is delivered. */
export function isEarning(job: DeliveryJob): boolean {
  return job.status === "delivered" && Boolean(job.completedAt);
}

/** When a trip's money landed — its completion, falling back to its offer time. */
function earnedAt(job: DeliveryJob): number {
  return Date.parse(job.completedAt ?? job.offeredAt);
}

/**
 * Sum a set of trips into the shape the earnings screen renders, including a
 * per-day series over `days` ending today. Callers filter which trips are in
 * range; this only adds up what it is given, so "today", "this week" and "this
 * month" are the same code path with different filters.
 */
export function earningsSummary(
  jobs: DeliveryJob[],
  { currency, days, now }: { currency: string; days: number; now: number },
): RiderEarningsSummary {
  const earning = jobs.filter(isEarning);

  const totals = earning.reduce(
    (acc, job) => {
      acc.earnings += job.payout.total;
      acc.baseFare += job.payout.baseFare;
      acc.distanceFee += job.payout.distanceFee;
      acc.bonuses += job.payout.peakBonus + job.payout.batchBonus;
      acc.tips += job.payout.tip;
      acc.distanceKm += job.distanceKm;
      acc.cashCollected += job.cashToCollect;
      acc.deliveries += job.orders.length;
      return acc;
    },
    {
      earnings: 0,
      baseFare: 0,
      distanceFee: 0,
      bonuses: 0,
      tips: 0,
      distanceKm: 0,
      cashCollected: 0,
      deliveries: 0,
    },
  );

  // Series buckets: one per day, oldest first, keyed by local date.
  const byDate = new Map<string, RiderEarningsPoint>();
  const today = new Date(now);
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    byDate.set(toDateKey(day), {
      date: toDateKey(day),
      trips: 0,
      earnings: 0,
      distanceKm: 0,
    });
  }
  for (const job of earning) {
    const key = toDateKey(new Date(earnedAt(job)));
    const point = byDate.get(key);
    if (!point) continue;
    point.trips += 1;
    point.earnings += job.payout.total;
    point.distanceKm += job.distanceKm;
  }

  const round = (n: number) => roundMoney(n, currency);

  return {
    currency,
    trips: earning.length,
    deliveries: totals.deliveries,
    earnings: round(totals.earnings),
    baseFare: round(totals.baseFare),
    distanceFee: round(totals.distanceFee),
    bonuses: round(totals.bonuses),
    tips: round(totals.tips),
    distanceKm: Math.round(totals.distanceKm * 10) / 10,
    cashCollected: round(totals.cashCollected),
    perTrip: earning.length === 0 ? 0 : round(totals.earnings / earning.length),
    series: [...byDate.values()].map((p) => ({
      ...p,
      earnings: round(p.earnings),
      distanceKm: Math.round(p.distanceKm * 10) / 10,
    })),
  };
}

/** Trips whose money landed on `dateKey` (local day). */
export function jobsOnDate(jobs: DeliveryJob[], dateKey: string): DeliveryJob[] {
  return jobs.filter(
    (job) => isEarning(job) && toDateKey(new Date(earnedAt(job))) === dateKey,
  );
}

/** Trips whose money landed within the last `days` days (today counts as day 1). */
export function jobsWithinDays(
  jobs: DeliveryJob[],
  days: number,
  now: number,
): DeliveryJob[] {
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return jobs.filter((job) => isEarning(job) && earnedAt(job) >= from.getTime());
}

// ---------------------------------------------------------------------------
// Cash + wallet (spec: Cash Collection, Rider Wallet)
// ---------------------------------------------------------------------------

/**
 * What the rider is holding. Cash collected on delivered trips belongs to the
 * platform until it is remitted, so this is a debt the zone caps — go over it
 * and the app stops offering trips until the rider hands cash in.
 */
export function cashPosition(
  jobs: DeliveryJob[],
  remittances: RiderRemittance[],
  zone: DeliveryZone,
): RiderCashPosition {
  const round = (n: number) => roundMoney(n, zone.currency);
  const collected = round(
    jobs.filter(isEarning).reduce((sum, job) => sum + job.cashToCollect, 0),
  );
  const remitted = round(remittances.reduce((sum, r) => sum + r.amount, 0));
  const inHand = round(Math.max(0, collected - remitted));

  return {
    currency: zone.currency,
    collected,
    remitted,
    inHand,
    limit: zone.cashLimit,
    overLimit: inHand >= zone.cashLimit,
  };
}

/** Share of offers a rider took, 0–1 — offers minus the ones they turned down. */
export function acceptanceRate(offered: number, declined: number): number {
  if (offered <= 0) return 1;
  return Math.max(0, Math.min(1, (offered - declined) / offered));
}
