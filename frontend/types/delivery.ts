import type { BaseEntity, ISODate, RiderVehicle } from "./common";
import type { PaymentMethod } from "./order";

/**
 * delivery.ts — the delivery side of the platform: riders, zones and the trips
 * they run (Phase C18; spec: Delivery Partner, Live Rider Tracking, Route
 * Optimization, Batch Delivery, OTP Verification, Delivery Earnings, Cash
 * Collection, Rider Wallet, Delivery Zones, Delivery Charges).
 *
 * The unit of work is a `DeliveryJob` — one *trip*, not one order. A trip
 * carries one order most of the time and two when the dispatcher batches nearby
 * drops, which is why money, distance and progress all live on the job while
 * per-order details (who to hand it to, what to collect, which code to check)
 * live on its stops. That distinction is what makes batching a data shape rather
 * than a special case in the UI.
 *
 * Everything extends `BaseEntity` like the rest of the seed, so these map 1:1
 * onto the eventual Prisma `Rider` / `DeliveryZone` / `DeliveryJob` /
 * `DeliveryStop` models.
 */

// ---------------------------------------------------------------------------
// Zones — where deliveries happen, and what they pay
// ---------------------------------------------------------------------------

/**
 * A delivery zone. Fares are *data*, not code: two zones can pay differently
 * for the same distance and hold riders to different cash limits with no branch
 * in any component (spec: Delivery Zones, Delivery Charges).
 */
export interface DeliveryZone extends BaseEntity {
  name: string;
  city: string;
  countryCode: string;
  currency: string;
  /** Areas the zone covers — the labels a dropoff address is matched against. */
  areas: string[];
  /** Zone centre, used to place synthesised pickups/drops and score distance. */
  lat: number;
  lng: number;
  /**
   * How far from the zone centre a restaurant may be and still deliver into it
   * (Phase 17, G37).
   *
   * Data, like the fares above, and for the same reason: a sprawling suburban
   * zone can be served from further away than a dense one, and "does this
   * restaurant deliver to me" must not be a branch in a component. A restaurant
   * inside the zone always serves it — this is the *cross-zone* allowance.
   */
  deliveryRadiusKm: number;
  /** Flat amount a rider earns for accepting a trip. */
  baseFare: number;
  /** Earned per kilometre of the whole route. */
  perKm: number;
  /** Multiplier applied to (base + distance) during the zone's peak hours. */
  peakMultiplier: number;
  /** Local hours (0–23) that count as peak in this zone. */
  peakHours: number[];
  /** Extra paid for each additional order batched into one trip. */
  batchBonus: number;
  /** Cash a rider may hold before the zone requires a remittance. */
  cashLimit: number;
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

/** A document the rider had to submit to be activated (spec: Verification). */
export interface RiderDocument {
  kind: "national-id" | "licence" | "vehicle-registration" | "insurance";
  status: "verified" | "pending" | "expired";
  /** Expiry for documents that have one; null otherwise. */
  expiresAt: ISODate | null;
}

/**
 * A delivery partner. `userId` links the rider to their account, which is how
 * the rider app resolves "me" — the same contract `Vendor.ownerId` gives the
 * merchant dashboard.
 */
export interface Rider extends BaseEntity {
  /** Linked account, or null for a rider with no demo login (cf. `Vendor.ownerId`). */
  userId: string | null;
  name: string;
  phone: string;
  photo: string | null;
  vehicle: RiderVehicle;
  /** Plate/registration where the vehicle has one (a bicycle does not). */
  plate: string | null;
  /** Home zone — the pool this rider is offered trips from. */
  zoneId: string;
  rating: number;
  /** Lifetime completed trips. */
  trips: number;
  /** Share of offers accepted, 0–1. */
  acceptanceRate: number;
  /** Share of trips delivered inside the promised window, 0–1. */
  onTimeRate: number;
  joinedAt: ISODate;
  documents: RiderDocument[];
}

// ---------------------------------------------------------------------------
// Jobs (trips)
// ---------------------------------------------------------------------------

/**
 * Rider-visible lifecycle of a trip. Unlike the customer's `OrderStatus` — which
 * the prototype derives from the clock (C9) — this one is driven by what the
 * rider actually did, so it is stored, not projected.
 */
export type DeliveryJobStatus =
  | "offered"
  | "accepted"
  | "picking-up"
  | "delivering"
  | "delivered"
  | "cancelled";

export type DeliveryStopKind = "pickup" | "dropoff";

/**
 * One place the rider must physically be. A trip's stops are ordered by the
 * router (`lib/delivery.optimiseRoute`) and completed strictly in that order, so
 * `sequence` is the contract between the map, the checklist and the seam.
 */
export interface DeliveryStop {
  id: string;
  kind: DeliveryStopKind;
  /** The order this stop belongs to — a batch has stops for two of them. */
  orderId: string;
  orderNumber: string;
  /** Vendor name for a pickup, customer name for a dropoff. */
  name: string;
  address: string;
  area: string;
  phone: string;
  lat: number;
  lng: number;
  /** Kitchen note or door instructions to show on arrival. */
  instructions: string | null;
  /** Position in the optimised route, 0-based. */
  sequence: number;
  /** Distance from the previous stop (from the vendor for the first), km. */
  legKm: number;
  /** Riding time for that leg, minutes. */
  legMinutes: number;
  /** Code the customer reads out at handoff; null for pickups. */
  otp: string | null;
  /** Cash to collect here — 0 when the order was prepaid. */
  cashDue: number;
}

/** The order behind a stop pair, snapshotted onto the trip. */
export interface DeliveryJobOrder {
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  customerName: string;
  itemCount: number;
  /** Order total in the job currency — what the rider collects if unpaid. */
  orderTotal: number;
  paymentMethod: PaymentMethod;
  /** Amount still to collect on delivery (cash orders only). */
  cashDue: number;
}

/** What a trip pays, itemised the way the earnings screen shows it. */
export interface DeliveryPayout {
  currency: string;
  baseFare: number;
  distanceFee: number;
  /** Uplift for delivering in the zone's peak hours. */
  peakBonus: number;
  /** Uplift for each extra order on the trip. */
  batchBonus: number;
  /** Customer tips carried over from the orders. */
  tip: number;
  total: number;
}

/**
 * A trip: one or more orders, the ordered stops that fulfil them, what it pays
 * and how far the rider has got.
 */
export interface DeliveryJob extends BaseEntity {
  /** Human-facing reference, e.g. "TRP-8F3A21". */
  jobNumber: string;
  /** Assigned rider; null while the trip is still in the offer pool. */
  riderId: string | null;
  zoneId: string;
  currency: string;
  orders: DeliveryJobOrder[];
  stops: DeliveryStop[];
  status: DeliveryJobStatus;
  /** Whole-route distance, km. */
  distanceKm: number;
  /** Whole-route riding + handling time, minutes. */
  estimatedMinutes: number;
  payout: DeliveryPayout;
  /** Total cash to collect across the trip. */
  cashToCollect: number;
  offeredAt: ISODate;
  /** Offers lapse — the pool moves on if nobody takes it. */
  expiresAt: ISODate;
  acceptedAt: ISODate | null;
  completedAt: ISODate | null;
  cancelledAt: ISODate | null;
  /** Stop ids the rider has completed, in the order they were done. */
  completedStopIds: string[];
}

// ---------------------------------------------------------------------------
// Derived view models (not entities — computed from jobs)
// ---------------------------------------------------------------------------

/** One day of a rider's earnings, for the bar chart. */
export interface RiderEarningsPoint {
  /** Plain "YYYY-MM-DD" local date key. */
  date: string;
  trips: number;
  earnings: number;
  distanceKm: number;
}

/** A rider's earnings over a range, itemised by what generated them. */
export interface RiderEarningsSummary {
  currency: string;
  /** Trips completed in the range. */
  trips: number;
  /** Orders delivered — higher than `trips` whenever batches ran. */
  deliveries: number;
  earnings: number;
  baseFare: number;
  distanceFee: number;
  bonuses: number;
  tips: number;
  distanceKm: number;
  cashCollected: number;
  /** Earnings ÷ trips, 0 when there were none. */
  perTrip: number;
  series: RiderEarningsPoint[];
}

/**
 * Where a rider stands on cash (spec: Cash Collection). Cash orders are
 * collected by the rider on the doorstep and belong to the platform, so what
 * they hold is a debt, not income — and the zone caps it.
 */
export interface RiderCashPosition {
  currency: string;
  /** Collected on delivered trips. */
  collected: number;
  /** Handed back at a drop point / bank. */
  remitted: number;
  inHand: number;
  limit: number;
  /** At or over the zone's limit — the rider must remit before going on. */
  overLimit: boolean;
}

/** How a rider hands cash back. */
export type RemittanceMethod = "agent" | "bank" | "wallet";

export interface RiderRemittance extends BaseEntity {
  riderId: string;
  amount: number;
  currency: string;
  method: RemittanceMethod;
  /** Deposit slip / agent reference. */
  reference: string;
  occurredAt: ISODate;
}

/** A cash-out of earned balance to the rider's bank. */
export interface RiderWithdrawal extends BaseEntity {
  riderId: string;
  amount: number;
  currency: string;
  status: "processing" | "paid";
  reference: string;
  occurredAt: ISODate;
}

/** What moved a rider's balance. Credits are positive, debits negative. */
export type RiderLedgerType =
  | "trip"
  | "tip"
  | "bonus"
  | "cash-collected"
  | "remittance"
  | "withdrawal";

export interface RiderLedgerEntry {
  id: string;
  type: RiderLedgerType;
  /** Signed amount in the wallet currency (credit > 0, debit < 0). */
  amount: number;
  description: string;
  /** Trip reference this entry came from, when applicable. */
  reference: string | null;
  occurredAt: ISODate;
}

/**
 * The rider's wallet (spec: Rider Wallet). Two balances that must not be
 * confused: `available` is money the platform owes the rider, `cashInHand` is
 * money the rider owes the platform.
 */
export interface RiderWallet {
  currency: string;
  /** Earned, not yet withdrawn. */
  available: number;
  /** Earned on trips that have not settled yet. */
  pending: number;
  cash: RiderCashPosition;
  /** Minimum a withdrawal must reach, from the zone/platform rules. */
  minWithdrawal: number;
  entries: RiderLedgerEntry[];
}
