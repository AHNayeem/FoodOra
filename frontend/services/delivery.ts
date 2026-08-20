import {
  buildJobOffers,
  buildRiderHistory,
  buildRiderRemittances,
  deliveryZones,
  dropPointFor,
  OFFER_WINDOW_MS,
  riderById,
  riderByUserId,
  riders,
  vendorById,
  zoneById,
  zoneIdForArea,
} from "@/lib/mock";
import type {
  DeliveryJob,
  DeliveryStop,
  DeliveryZone,
  Order,
  OrderRiderEarning,
  RemittanceMethod,
  Rider,
  RiderCashPosition,
  RiderEarningsSummary,
  RiderLedgerEntry,
  RiderRemittance,
  RiderVehicle,
  RiderWallet,
  RiderWithdrawal,
} from "@/types";
import {
  acceptanceRate,
  cashPosition,
  earningsSummary,
  isOfferExpired,
  jobProgress,
  jobsOnDate,
  jobsWithinDays,
  otpMatches,
  statusFromProgress,
} from "@/lib/delivery";
import {
  jobFromOrder,
  riderEarningFrom,
  type TripPlace,
} from "@/lib/delivery-bridge";
import { roundMoney } from "@/lib/checkout";
import { toDateKey } from "@/lib/dates";
import { mockDelay, ok, type Result } from "./http";

/**
 * delivery.ts — read + write API for the rider app (Phase C18).
 *
 * The seam owns the rules, as everywhere else in this prototype: an offer that
 * has lapsed cannot be accepted, stops cannot be completed out of route order, a
 * handoff without the customer's code is refused, cash the rider has not
 * confirmed taking is refused, and a remittance larger than what they are holding
 * is refused. A component can render whatever button it likes; it cannot talk
 * this layer into an impossible trip.
 *
 * The prototype-specific wrinkle is the same one C16 has, stated plainly: a
 * rider's week is *synthesised* per request, and the trips they actually ran in
 * this browser live in a persisted store the seam cannot read. Callers therefore
 * pass their local records in as `RiderContext`. A real backend has all of it in
 * the database and simply drops the parameter — every signature above stays put.
 */

/** Records held on the rider's device that the seam cannot see for itself. */
export interface RiderContext {
  /**
   * Real customer orders this rider delivered, from `stores/orders` — the bridge
   * out of the two-delivery-systems problem (G39).
   *
   * They arrive as `Order`s and are converted to trips here, so every read below
   * (today, earnings, history, wallet, cash, remittance liability) accounts for a
   * real delivery through exactly the same code path as a synthesised one. The
   * caller passes orders rather than jobs on purpose: the order is the authority
   * and the trip is derived from it, so there is nothing to keep in step.
   */
  orders?: Order[];
  /** Trips completed in this browser, from `stores/rider`. */
  completed?: DeliveryJob[];
  /** Offer ids the rider turned down, so the pool stops showing them. */
  declined?: string[];
  /** Cash hand-ins made in this browser. */
  remittances?: RiderRemittance[];
  /** Cash-outs made in this browser. */
  withdrawals?: RiderWithdrawal[];
}

/** Minimum balance a rider can cash out (platform rule; data in Phase E). */
export const MIN_WITHDRAWAL = 500;

/**
 * How often the offer pool turns over. Screens poll on this cadence rather than
 * inventing one of their own — with a real backend this is where the socket or
 * the revalidate interval would be configured, and the UI would not change.
 */
export const OFFER_REFRESH_MS = OFFER_WINDOW_MS;

// ---------------------------------------------------------------------------
// Real orders as trips (spec: Phase 3 — one delivery reality)
// ---------------------------------------------------------------------------

/** Fallback pickup line for a vendor with no published rider number. */
const VENDOR_PHONE = "+8802255000000";

/**
 * Where a real order's ride starts and ends.
 *
 * An `Order` snapshots postal detail, not coordinates, so the geography has to be
 * resolved from the seed: the vendor's own point for the pickup, and the drop
 * area's point for the handoff. Both come from data the catalog and the zones
 * already carry — see `lib/mock/drop-points` for why the answer is the area's
 * centre and not the doorstep.
 */
function placesFor(order: Order, zone: DeliveryZone): { pickup: TripPlace; dropoff: TripPlace } | null {
  const vendor = vendorById.get(order.vendor.id);
  if (!vendor) return null;

  const dropArea = order.address?.area ?? zone.areas[0];
  const drop = dropPointFor(dropArea);

  return {
    pickup: {
      lat: vendor.location.lat,
      lng: vendor.location.lng,
      address: vendor.location.address,
      area: vendor.location.address.split(",").pop()?.trim() ?? vendor.location.city,
      phone: VENDOR_PHONE,
    },
    dropoff: {
      // No seeded point for this area: the zone centre is the honest answer, and
      // it is inside the zone whose fares are being applied.
      lat: drop?.lat ?? zone.lat,
      lng: drop?.lng ?? zone.lng,
      address: [order.address?.line1, order.address?.line2, order.address?.area]
        .filter(Boolean)
        .join(", "),
      area: dropArea,
      phone: order.contact.phone,
    },
  };
}

/** The zone whose fares apply to an order — the drop area's, else the rider's. */
function zoneForOrder(order: Order, rider: Rider | undefined): DeliveryZone | undefined {
  const byArea = zoneIdForArea(order.address?.area);
  return zoneById.get(byArea ?? rider?.zoneId ?? "") ?? (rider ? zoneById.get(rider.zoneId) : undefined);
}

/**
 * The trip behind a real order, or null when there is no trip to speak of — a
 * pickup order, an unassigned one, or a vendor/zone the seed does not know.
 *
 * Synchronous, like `nextStopOf`: this is a projection of a record the caller
 * already holds, not a fetch. Phase E turns it into a join and the callers stay
 * put.
 */
export function jobForOrder(order: Order, now: number = Date.now()): DeliveryJob | null {
  if (order.fulfillment !== "delivery") return null;
  const rider = order.lifecycle.rider ? riderById.get(order.lifecycle.rider.id) : undefined;
  const zone = zoneForOrder(order, rider);
  if (!zone) return null;
  const places = placesFor(order, zone);
  if (!places) return null;

  return jobFromOrder(order, {
    zone,
    // The order's snapshot is what the customer was told, so it is what the
    // route is timed against — the rider may have changed vehicle since.
    vehicle: order.lifecycle.rider?.vehicle ?? rider?.vehicle ?? "bike",
    pickup: places.pickup,
    dropoff: places.dropoff,
    now,
  });
}

/**
 * What the rider earned delivering this order (G04) — the record the `completed`
 * transition stamps onto the order's financials.
 *
 * Resolved here rather than in the store or a component because it needs the
 * zone's fare rules and the trip's geometry, and because every surface that can
 * complete an order has to produce the same number.
 */
export function riderEarningForOrder(
  order: Order,
  now: number = Date.now(),
): OrderRiderEarning | null {
  const job = jobForOrder(order, now);
  return job ? riderEarningFrom(order, job) : null;
}

/**
 * Orders this rider actually delivered, as trips.
 *
 * Keyed by trip id rather than collected into a list, so the same order appearing
 * twice in the caller's context cannot be earned from twice. The store does not
 * hand out duplicates today; making that a property of *this* function rather
 * than a property of its caller is what keeps it true when a second caller
 * arrives.
 */
function orderTrips(riderId: string, now: number, ctx: RiderContext = {}): DeliveryJob[] {
  const trips = new Map<string, DeliveryJob>();
  for (const order of ctx.orders ?? []) {
    if (order.lifecycle.rider?.id !== riderId) continue;
    if (order.status !== "delivered" && order.status !== "completed") continue;
    const job = jobForOrder(order, now);
    if (job) trips.set(job.id, job);
  }
  return [...trips.values()];
}

/**
 * The rider's week: real deliveries, the synthesised trips they ran in this
 * browser, and the seeded past — deduped, newest first.
 *
 * Order matters. Real orders win, because they are the only records with a
 * customer behind them; a synthesised trip is only ever filler for a week the
 * prototype has no backend to remember.
 */
function resolveHistory(riderId: string, now: number, ctx: RiderContext = {}): DeliveryJob[] {
  const real = orderTrips(riderId, now, ctx);
  const local = (ctx.completed ?? []).filter((j) => j.riderId === riderId);
  const seen = new Set([...real, ...local].map((j) => j.id));
  const synthesised = buildRiderHistory(riderId, now).filter((j) => !seen.has(j.id));
  return [...real, ...local, ...synthesised].sort(
    (a, b) =>
      Date.parse(b.completedAt ?? b.offeredAt) - Date.parse(a.completedAt ?? a.offeredAt),
  );
}

/** Every hand-in the rider has made: the settled past plus this browser's. */
function resolveRemittances(
  riderId: string,
  history: DeliveryJob[],
  now: number,
  ctx: RiderContext = {},
): RiderRemittance[] {
  const local = (ctx.remittances ?? []).filter((r) => r.riderId === riderId);
  const seeded = buildRiderRemittances(riderId, history, now);
  return [...local, ...seeded].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

// ---------------------------------------------------------------------------
// Rider + zone
// ---------------------------------------------------------------------------

/**
 * Resolve "me" for a signed-in account.
 *
 * **No fallback (spec §5.3, G11).** This had the same bug `getDashboardVendor` did
 * and the comment here used to cite it as precedent: any rider-role account with no
 * fleet record was handed the flagship rider, so it could accept trips as them, see
 * their wallet and collect their cash. Phase 7 removes both. An account with no
 * rider record now gets `null`, and `RiderShell` shows them their application
 * instead of somebody else's day.
 *
 * `admitted` is the fleet records this device minted by approving an application.
 * Injected rather than looked up, for the reason stated on `getDashboardVendor`.
 */
export async function getRiderProfile(
  userId: string,
  admitted: Rider[] = [],
): Promise<Rider | null> {
  const mine =
    admitted.find((r) => r.userId === userId && !r.deletedAt) ??
    riderByUserId.get(userId) ??
    null;
  return mockDelay(mine, 250);
}

export async function getRiderZone(zoneId: string): Promise<DeliveryZone | null> {
  return mockDelay(zoneById.get(zoneId) ?? null, 150);
}

/**
 * The whole active fleet — what dispatch picks from, and what the restaurant's
 * assign-rider dialog and the admin's rider board list. Optionally narrowed to
 * one zone, which is how a dispatcher normally looks at it.
 */
export async function getFleet(
  zoneId?: string,
  admitted: Rider[] = [],
): Promise<Rider[]> {
  // `admitted` is the riders this device approved (Phase 7). Injected for the
  // reason stated on `getRiderProfile`: a service cannot read a store, and a
  // courier who was approved this morning still has to appear on the board.
  const active = [...riders, ...admitted].filter((r) => !r.deletedAt);
  return mockDelay(zoneId ? active.filter((r) => r.zoneId === zoneId) : active, 150);
}

/** Every zone — the profile screen lets a rider change which one they work. */
export async function getDeliveryZones(): Promise<DeliveryZone[]> {
  return mockDelay(
    deliveryZones.filter((z) => !z.deletedAt),
    150,
  );
}

/** Simulated profile edit: vehicle, plate and home zone are the rider's to change. */
export async function updateRiderProfile(
  rider: Rider,
  patch: { vehicle?: RiderVehicle; plate?: string | null; zoneId?: string },
): Promise<Result<Rider>> {
  if (patch.zoneId && !zoneById.has(patch.zoneId)) {
    return mockDelay({ data: null, error: "errors.unknownZone" });
  }
  // A bicycle has no registration to give, so an empty plate is normal there.
  const vehicle = patch.vehicle ?? rider.vehicle;
  const plate = patch.plate === undefined ? rider.plate : patch.plate?.trim() || null;
  if (vehicle !== "bicycle" && !plate) {
    return mockDelay({ data: null, error: "errors.plateRequired" });
  }
  return mockDelay(
    ok({
      ...rider,
      vehicle,
      plate,
      zoneId: patch.zoneId ?? rider.zoneId,
      updatedAt: new Date().toISOString(),
    }),
    450,
  );
}

// ---------------------------------------------------------------------------
// Offers (spec: Delivery Partner, Batch Delivery)
// ---------------------------------------------------------------------------

export interface OfferQuery {
  riderId: string;
  /** Always supplied by the caller; the seam never reads the clock itself. */
  now: number;
  /** Offline riders are shown nothing — the pool only goes to available riders. */
  online: boolean;
  /** The trip in progress, if any: a rider on a trip gets no new offers. */
  busy?: boolean;
  ctx?: RiderContext;
}

export async function getJobOffers(query: OfferQuery): Promise<DeliveryJob[]> {
  const { riderId, now, online, busy, ctx } = query;
  if (!online || busy) return mockDelay([], 200);

  const declined = new Set(ctx?.declined ?? []);
  const offers = buildJobOffers(riderId, now).filter(
    (job) => !declined.has(job.id) && !isOfferExpired(job, now),
  );
  return mockDelay(offers, 350);
}

/**
 * Take an offer.
 *
 * Re-checked at the moment it matters rather than trusted from the list the rider
 * was looking at: an offer that lapsed while they read it is refused, and so is
 * one taken while offline or already on a trip. Accepting stamps the rider onto
 * the job and moves it to `accepted` with no stops done yet.
 */
export async function acceptJob({
  job,
  riderId,
  now,
  online,
  busy,
}: {
  job: DeliveryJob;
  riderId: string;
  now: number;
  online: boolean;
  busy: boolean;
}): Promise<Result<DeliveryJob>> {
  if (!online) return mockDelay({ data: null, error: "errors.offline" });
  if (busy) return mockDelay({ data: null, error: "errors.alreadyOnTrip" });
  if (job.status !== "offered") return mockDelay({ data: null, error: "errors.offerTaken" });
  if (isOfferExpired(job, now)) return mockDelay({ data: null, error: "errors.offerExpired" });

  const stamp = new Date(now).toISOString();
  return mockDelay(
    ok({
      ...job,
      riderId,
      status: "accepted",
      acceptedAt: stamp,
      updatedAt: stamp,
      completedStopIds: [],
    }),
    500,
  );
}

/** Turn an offer down. Nothing to validate — it just leaves this rider's pool. */
export async function declineJob(job: DeliveryJob): Promise<Result<string>> {
  return mockDelay(ok(job.id), 200);
}

// ---------------------------------------------------------------------------
// Running a trip (spec: OTP Verification, Cash Collection)
// ---------------------------------------------------------------------------

export interface CompleteStopInput {
  job: DeliveryJob;
  stopId: string;
  now: number;
  /** The code the customer read out — required at every dropoff. */
  otp?: string;
  /** The rider confirming they took the cash owed at this stop. */
  cashCollected?: boolean;
}

/**
 * Mark a stop done.
 *
 * Three rules live here, not in the screen:
 *  - **Order.** Only the next stop on the optimised route can be completed, so a
 *    rider cannot deliver an order they have not collected.
 *  - **The code.** A dropoff needs the customer's four digits. This is the whole
 *    point of OTP verification, so a mistyped code fails here even if the button
 *    was enabled.
 *  - **The cash.** Where there is cash owed, the rider has to confirm taking it
 *    before the stop closes — otherwise the platform's ledger and the rider's bag
 *    disagree from that moment on.
 *
 * Completing the last stop finishes the trip.
 */
export async function completeStop(
  input: CompleteStopInput,
): Promise<Result<DeliveryJob>> {
  const { job, stopId, now, otp, cashCollected } = input;
  if (job.status === "cancelled") return mockDelay({ data: null, error: "errors.tripCancelled" });
  if (job.status === "delivered") return mockDelay({ data: null, error: "errors.tripDone" });

  const progress = jobProgress(job, now);
  const next = progress.nextStop;
  const stop = job.stops.find((s) => s.id === stopId);
  if (!stop) return mockDelay({ data: null, error: "errors.unknownStop" });
  if (!next || next.id !== stop.id) {
    return mockDelay({ data: null, error: "errors.stopOutOfOrder" });
  }
  if (stop.kind === "dropoff" && !otpMatches(stop, otp ?? "")) {
    return mockDelay({ data: null, error: "errors.badOtp" });
  }
  if (stop.cashDue > 0 && !cashCollected) {
    return mockDelay({ data: null, error: "errors.cashNotConfirmed" });
  }

  const stamp = new Date(now).toISOString();
  const advanced: DeliveryJob = {
    ...job,
    completedStopIds: [...job.completedStopIds, stop.id],
    updatedAt: stamp,
  };
  const status = statusFromProgress(advanced);

  return mockDelay(
    ok({
      ...advanced,
      status,
      completedAt: status === "delivered" ? stamp : null,
    }),
    400,
  );
}

/**
 * Give a trip back. Allowed only while nothing has been collected — once food is
 * in the rider's bag the trip has to be finished or handled by support, which is
 * how a real operation works.
 */
export async function cancelJob({
  job,
  now,
}: {
  job: DeliveryJob;
  now: number;
}): Promise<Result<DeliveryJob>> {
  if (job.completedStopIds.length > 0) {
    return mockDelay({ data: null, error: "errors.notCancellable" });
  }
  if (job.status === "delivered" || job.status === "cancelled") {
    return mockDelay({ data: null, error: "errors.notCancellable" });
  }
  const stamp = new Date(now).toISOString();
  return mockDelay(
    ok({ ...job, status: "cancelled", cancelledAt: stamp, updatedAt: stamp }),
    400,
  );
}

// ---------------------------------------------------------------------------
// Today, earnings and history (spec: Delivery Earnings)
// ---------------------------------------------------------------------------

/** The numbers the home screen leads with. */
export interface RiderDay {
  today: RiderEarningsSummary;
  /** Trips delivered today, newest first. */
  trips: DeliveryJob[];
  /** Lifetime figures off the rider record, for the stats row. */
  rating: number;
  lifetimeTrips: number;
  acceptance: number;
  cash: RiderCashPosition;
}

export async function getRiderDay({
  riderId,
  now,
  ctx,
}: {
  riderId: string;
  now: number;
  ctx?: RiderContext;
}): Promise<RiderDay | null> {
  const rider = riderById.get(riderId);
  const zone = rider ? zoneById.get(rider.zoneId) : undefined;
  if (!rider || !zone) return mockDelay(null, 200);

  const history = resolveHistory(riderId, now, ctx);
  const trips = jobsOnDate(history, toDateKey(new Date(now)));
  const remittances = resolveRemittances(riderId, history, now, ctx);
  const declined = (ctx?.declined ?? []).length;

  return mockDelay(
    {
      today: earningsSummary(trips, { currency: zone.currency, days: 1, now }),
      trips,
      rating: rider.rating,
      lifetimeTrips: rider.trips + (ctx?.completed?.length ?? 0) + orderTrips(riderId, now, ctx).length,
      // Pool this session's accept/decline decisions into the rider's historical
      // rate rather than averaging the two rates, which would let two declines
      // outweigh a thousand trips. `acceptanceRate` is reused so the arithmetic
      // lives in one place.
      acceptance: pooledAcceptance(rider.acceptanceRate, rider.trips, trips.length + declined, declined),
      cash: cashPosition(trips, todaysRemittances(remittances, now), zone),
    },
    350,
  );
}

/**
 * Blend a rider's historical acceptance rate with this session's offers, treating
 * the record as `history` samples and the session as `offered` more.
 */
function pooledAcceptance(
  rate: number,
  history: number,
  offered: number,
  declined: number,
): number {
  if (offered === 0) return rate;
  const sessionAccepted = acceptanceRate(offered, declined) * offered;
  return Math.min(1, (rate * history + sessionAccepted) / (history + offered));
}

/** Hand-ins made today — the only ones that offset today's outstanding cash. */
function todaysRemittances(all: RiderRemittance[], now: number): RiderRemittance[] {
  const today = toDateKey(new Date(now));
  return all.filter((r) => toDateKey(new Date(r.occurredAt)) === today);
}

export type EarningsRange = "today" | "week" | "month";

const RANGE_DAYS: Record<EarningsRange, number> = { today: 1, week: 7, month: 30 };

/**
 * Earnings over a range. One code path for all three ranges — only the window
 * changes — so the day, the week and the month can never be computed differently.
 * The synthesised history covers a week; a month simply contains it.
 */
export async function getRiderEarnings({
  riderId,
  range,
  now,
  ctx,
}: {
  riderId: string;
  range: EarningsRange;
  now: number;
  ctx?: RiderContext;
}): Promise<RiderEarningsSummary | null> {
  const rider = riderById.get(riderId);
  const zone = rider ? zoneById.get(rider.zoneId) : undefined;
  if (!rider || !zone) return mockDelay(null, 200);

  const days = RANGE_DAYS[range];
  const history = resolveHistory(riderId, now, ctx);
  const inRange =
    range === "today"
      ? jobsOnDate(history, toDateKey(new Date(now)))
      : jobsWithinDays(history, days, now);

  return mockDelay(
    earningsSummary(inRange, { currency: zone.currency, days, now }),
    350,
  );
}

/** Completed trips, newest first — the history screen. */
export async function getRiderJobs({
  riderId,
  now,
  days = 7,
  ctx,
}: {
  riderId: string;
  now: number;
  days?: number;
  ctx?: RiderContext;
}): Promise<DeliveryJob[]> {
  const history = resolveHistory(riderId, now, ctx);
  return mockDelay(jobsWithinDays(history, days, now), 350);
}

/** One trip by id, from the rider's history. Used by the trip receipt. */
export async function getRiderJob({
  riderId,
  jobId,
  now,
  ctx,
}: {
  riderId: string;
  jobId: string;
  now: number;
  ctx?: RiderContext;
}): Promise<DeliveryJob | null> {
  const history = resolveHistory(riderId, now, ctx);
  return mockDelay(history.find((j) => j.id === jobId) ?? null, 250);
}

// ---------------------------------------------------------------------------
// Wallet (spec: Rider Wallet, Cash Collection)
// ---------------------------------------------------------------------------

/**
 * The rider's wallet.
 *
 * Two balances that must never be confused, so they are built separately:
 * `available` is what the platform owes the rider — earnings from *settled* days,
 * less what they have cashed out, less any cash they are still carrying — while
 * `cash.inHand` is what the rider owes the platform from today's doorstep
 * collections. `pending` is today's earnings, which settle overnight.
 */
export async function getRiderWallet({
  riderId,
  now,
  ctx,
}: {
  riderId: string;
  now: number;
  ctx?: RiderContext;
}): Promise<RiderWallet | null> {
  const rider = riderById.get(riderId);
  const zone = rider ? zoneById.get(rider.zoneId) : undefined;
  if (!rider || !zone) return mockDelay(null, 200);

  const currency = zone.currency;
  const round = (n: number) => roundMoney(n, currency);
  const today = toDateKey(new Date(now));

  const history = resolveHistory(riderId, now, ctx);
  const week = jobsWithinDays(history, 7, now);
  const todayTrips = jobsOnDate(history, today);
  const remittances = resolveRemittances(riderId, history, now, ctx);
  const withdrawals = (ctx?.withdrawals ?? []).filter((w) => w.riderId === riderId);

  const settled = week.filter(
    (job) => toDateKey(new Date(job.completedAt ?? job.offeredAt)) !== today,
  );
  const cash = cashPosition(todayTrips, todaysRemittances(remittances, now), zone);

  const earned = round(settled.reduce((sum, job) => sum + job.payout.total, 0));
  const withdrawn = round(withdrawals.reduce((sum, w) => sum + w.amount, 0));
  const pending = round(todayTrips.reduce((sum, job) => sum + job.payout.total, 0));

  const entries: RiderLedgerEntry[] = [
    ...week.map<RiderLedgerEntry>((job) => ({
      id: `led_trip_${job.id}`,
      type: "trip",
      amount: job.payout.total,
      description: job.orders.map((o) => o.vendorName).join(" + "),
      reference: job.jobNumber,
      occurredAt: job.completedAt ?? job.offeredAt,
    })),
    ...week
      .filter((job) => job.cashToCollect > 0)
      .map<RiderLedgerEntry>((job) => ({
        id: `led_cash_${job.id}`,
        type: "cash-collected",
        // Cash taken at the door is platform money, so it nets off the payable.
        amount: -job.cashToCollect,
        description: job.orders.map((o) => o.customerName).join(" + "),
        reference: job.jobNumber,
        occurredAt: job.completedAt ?? job.offeredAt,
      })),
    ...remittances.map<RiderLedgerEntry>((r) => ({
      id: `led_rmt_${r.id}`,
      type: "remittance",
      amount: r.amount,
      description: r.reference,
      reference: r.reference,
      occurredAt: r.occurredAt,
    })),
    ...withdrawals.map<RiderLedgerEntry>((w) => ({
      id: `led_wdr_${w.id}`,
      type: "withdrawal",
      amount: -w.amount,
      description: w.reference,
      reference: w.reference,
      occurredAt: w.occurredAt,
    })),
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return mockDelay(
    {
      currency,
      available: round(Math.max(0, earned - withdrawn - cash.inHand)),
      pending,
      cash,
      minWithdrawal: MIN_WITHDRAWAL,
      entries,
    },
    400,
  );
}

/** Every hand-in, for the wallet's cash tab. */
export async function getRiderRemittances({
  riderId,
  now,
  ctx,
}: {
  riderId: string;
  now: number;
  ctx?: RiderContext;
}): Promise<RiderRemittance[]> {
  const history = resolveHistory(riderId, now, ctx);
  return mockDelay(resolveRemittances(riderId, history, now, ctx), 300);
}

/**
 * Hand cash in. Refused for a non-amount or for more than the rider is holding —
 * the point of the screen is that the two ledgers agree afterwards, and letting
 * someone remit money they do not have breaks exactly that.
 */
export async function remitCash({
  riderId,
  amount,
  method,
  position,
  now,
}: {
  riderId: string;
  amount: number;
  method: RemittanceMethod;
  position: RiderCashPosition;
  now: number;
}): Promise<Result<RiderRemittance>> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return mockDelay({ data: null, error: "errors.amountRequired" });
  }
  if (amount > position.inHand) {
    return mockDelay({ data: null, error: "errors.remitTooMuch" });
  }
  const stamp = new Date(now).toISOString();
  return mockDelay(
    ok({
      id: `rmt_${now.toString(36)}`,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      riderId,
      amount: roundMoney(amount, position.currency),
      currency: position.currency,
      method,
      reference: `RMT-${now.toString(36).toUpperCase().slice(-6)}`,
      occurredAt: stamp,
    }),
    600,
  );
}

/** Cash out earned balance. The platform minimum is enforced here. */
export async function withdrawEarnings({
  riderId,
  amount,
  wallet,
  now,
}: {
  riderId: string;
  amount: number;
  wallet: RiderWallet;
  now: number;
}): Promise<Result<RiderWithdrawal>> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return mockDelay({ data: null, error: "errors.amountRequired" });
  }
  if (amount < wallet.minWithdrawal) {
    return mockDelay({ data: null, error: "errors.belowMinimum" });
  }
  if (amount > wallet.available) {
    return mockDelay({ data: null, error: "errors.withdrawTooMuch" });
  }
  const stamp = new Date(now).toISOString();
  return mockDelay(
    ok({
      id: `wdr_${now.toString(36)}`,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      riderId,
      amount: roundMoney(amount, wallet.currency),
      currency: wallet.currency,
      status: "processing" as const,
      reference: `WDR-${now.toString(36).toUpperCase().slice(-6)}`,
      occurredAt: stamp,
    }),
    700,
  );
}

/** The stop a rider is riding to, for the shell's active-trip chip. */
export function nextStopOf(job: DeliveryJob, now: number): DeliveryStop | null {
  return jobProgress(job, now).nextStop;
}
