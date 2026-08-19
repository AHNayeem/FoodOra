import type { BaseEntity, ISODate, RiderVehicle } from "./common";
import type { CartLine, CartVendor } from "./cart";
import type { OrderFinancials } from "./finance";

/**
 * order.ts — the checkout output and its supporting shapes.
 *
 * An `Order` is the immutable record produced at checkout (Phase C8) and read
 * back by order confirmation, order history (C3) and live tracking (C9). Like
 * every other entity it extends `BaseEntity` and snapshots the vendor/lines it
 * was placed against, so the mock maps 1:1 onto the eventual Prisma `Order` /
 * `OrderItem` models and stays correct even if the catalog later changes.
 */

/**
 * Lifecycle a delivery order moves through.
 *
 * The full spec lifecycle, in order. Names stay in the codebase's kebab-case
 * vocabulary; the spec's SCREAMING_CASE equivalent is noted per member so the
 * two documents can be read side by side.
 *
 * Terminal states are `completed`, `rejected`, `cancelled`, `returned` and
 * `refunded`. `delivery-failed` is *not* terminal — it is the fork where the
 * order is either retried or returned.
 */
export type OrderStatus =
  /** PENDING_CONFIRMATION — with the restaurant, not yet answered. */
  | "placed"
  /** ORDER_ACCEPTED — accepted with a promised preparation time. */
  | "confirmed"
  /** PREPARING — in the kitchen. */
  | "preparing"
  /** PACKING — cooked, being bagged. */
  | "packing"
  /** READY_FOR_PICKUP — on the pass, waiting for a courier (or the customer). */
  | "ready"
  /** RIDER_ASSIGNED — a courier has taken the job and is riding to the vendor. */
  | "rider-assigned"
  /** Courier is at the counter; the restaurant verifies and hands over. */
  | "picked-up"
  /** OUT_FOR_DELIVERY. */
  | "on-the-way"
  /** Courier is at the door — this is what unlocks the customer's OTP. */
  | "arrived"
  /** DELIVERED — OTP verified, food handed over. */
  | "delivered"
  /** COMPLETED — settled: payment closed, invoice available. */
  | "completed"
  /** Restaurant refused the order at intake. Carries a reason. */
  | "rejected"
  /** Cancelled by the customer or the restaurant after acceptance. */
  | "cancelled"
  /** Handoff could not happen (customer unavailable, wrong address…). */
  | "delivery-failed"
  /** Taken back to the restaurant after a failed delivery. */
  | "returned"
  /** A refund was granted on a cancelled / returned order. */
  | "refunded";

/** Who performed a transition. Drives permissions and the timeline's attribution. */
export type OrderActor = "customer" | "restaurant" | "rider" | "system" | "admin";

/** How the order is handed to the customer. */
export type FulfillmentType = "delivery" | "pickup";

/** Payment tender — all simulated in the prototype (no real gateway). */
export type PaymentMethod = "cash" | "card" | "wallet";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

/** A delivery destination — the embedded snapshot stored on an order. */
export interface DeliveryAddress {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  area: string;
  city: string;
  countryCode: string;
  instructions: string | null;
}

/** A reusable address in a customer's address book. */
export interface SavedAddress extends BaseEntity, DeliveryAddress {
  userId: string;
  isDefault: boolean;
}

/** Fully itemised money breakdown (all amounts in `currency`). */
export interface OrderPricing {
  currency: string;
  subtotal: number;
  deliveryFee: number;
  /** Coupon reduction applied to the subtotal (Phase C21). */
  discount: number;
  /** The coupon code that produced `discount`, for the receipt; null if none. */
  couponCode: string | null;
  /** Consumption tax charged on (subtotal − discount). */
  tax: number;
  taxLabel: string;
  taxRate: number;
  /** Courier tip. */
  tip: number;
  total: number;
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  /** Last 4 of the card for `card`, else null. Demo only. */
  cardLast4: string | null;
}

/** The rider assigned to a delivery order (drives C9 tracking). Demo only. */
export interface Courier extends BaseEntity {
  name: string;
  phone: string;
  vehicle: RiderVehicle;
  /** Average rating out of 5. */
  rating: number;
  /** Completed deliveries — a light trust signal in the UI. */
  trips: number;
  /** Avatar URL, or null to fall back to initials. */
  photo: string | null;
}

// ---------------------------------------------------------------------------
// Lifecycle — everything the order accumulates as it is worked on
// ---------------------------------------------------------------------------

/**
 * One thing that happened to an order. The event log is append-only and is the
 * *only* honest source for the timeline: a status alone cannot say who set it,
 * when, or why. Phase E stores these rows verbatim.
 */
export interface OrderEvent {
  id: string;
  /** The status the order moved *into*. */
  status: OrderStatus;
  at: ISODate;
  actor: OrderActor;
  /**
   * Free-text detail shown under the timeline entry — a rejection reason, a
   * delay note, the OTP attempt that failed. Null for a plain transition.
   */
  note: string | null;
}

/** The rider snapshot the customer sees once one is assigned. */
export interface OrderRider {
  id: string;
  name: string;
  phone: string;
  vehicle: RiderVehicle;
  /** Plate where the vehicle has one. */
  plate: string | null;
  rating: number;
  trips: number;
  photo: string | null;
}

/** Why an order ended early. Keys map onto `order.reason.*` i18n messages. */
export type OrderCancelReason =
  | "out-of-stock"
  | "too-busy"
  | "closing-soon"
  | "cannot-deliver"
  | "changed-mind"
  | "too-slow"
  | "ordered-by-mistake"
  | "duplicate"
  | "customer-unavailable"
  | "wrong-address"
  | "refused-delivery"
  | "other";

/**
 * Where a refund has got to (Phase 5, G07).
 *
 * The spec's lifecycle exactly: `requested → approved | rejected → refunded`.
 * The last member is the one that was missing, and its absence was the bug — with
 * `approved` as the terminal state there was no way to say "we decided to pay
 * this and the money has actually gone back", which is a different fact from "we
 * agreed to". A wallet refund passes through both in one commit; a card refund
 * sits at `approved` while the provider works.
 */
export type RefundStatus =
  /** Nobody has asked, and nothing is owed. */
  | "none"
  /** The customer asked, or the platform opened one because it owes the money. */
  | "requested"
  /** Granted. The money has not moved yet. */
  | "approved"
  /** Refused, with a reason on the ticket. */
  | "rejected"
  /** Settled — the money is back with the customer. */
  | "refunded";

/**
 * How the money goes back. Mirrors the tender it was taken on, because that is
 * what decides how long it takes and who has to do something: a wallet refund is
 * a ledger entry this app owns and is instant, a card refund is a request to a
 * provider, and cash has to be handed back or paid out by a person.
 */
export type RefundMethod = "wallet" | "card" | "cash";

/**
 * Everything an order picks up while it is being worked on, kept in one nested
 * object so `Order` stays readable and so a persisted order can be migrated by
 * filling exactly one field.
 */
export interface OrderLifecycle {
  /** Append-only log, oldest first. */
  events: OrderEvent[];
  /** Preparation time the restaurant promised on accept, minutes. */
  prepMinutes: number | null;
  /** When the food is promised ready — `acceptedAt + prepMinutes`, plus delays. */
  promisedReadyAt: ISODate | null;
  /** Extra minutes the restaurant has asked for, cumulative. */
  delayMinutes: number;
  /** Set when the restaurant refuses at intake. */
  rejectionReason: OrderCancelReason | null;
  /** Set on any cancellation, by either side. */
  cancelReason: OrderCancelReason | null;
  cancelledBy: OrderActor | null;
  /** Why a handoff failed. */
  failureReason: OrderCancelReason | null;
  /** The assigned courier, or null while unassigned. */
  rider: OrderRider | null;
  /** How the rider got the job — informs the admin dispatch view. */
  assignment: "auto" | "manual" | null;
  assignedAt: ISODate | null;
  /** Riders who turned this job down, so dispatch stops offering it to them. */
  rejectedRiderIds: string[];
  /** Handoff code. Issued at placement, only *revealed* once the rider arrives. */
  otp: string;
  /** Failed handoff attempts — the rider is locked out after `OTP_MAX_ATTEMPTS`. */
  otpAttempts: number;
  otpVerifiedAt: ISODate | null;
  refund: RefundStatus;
  /** Amount refunded / requested, in the order currency. */
  refundAmount: number;
  /**
   * How the money goes back, resolved from the tender when the refund opens.
   * Null while no refund exists — never guessed at read time, because a payment
   * method can be inspected but a *refund route* is a decision that was made.
   */
  refundMethod: RefundMethod | null;
  /** When it was approved or rejected; null while nobody has decided. */
  refundDecidedAt: ISODate | null;
  /** When the money actually reached the customer; null until it has. */
  refundSettledAt: ISODate | null;
  /** Customer's rating of the completed order, 1–5; null until they rate. */
  rating: number | null;
  /**
   * Commission, settlement reference and rider earning — stamped by the
   * `completed` transition and never recomputed. Null until the order completes.
   */
  financials: OrderFinancials | null;
}

export interface Order extends BaseEntity {
  /** Human-facing reference, e.g. "FO-8F3A21". */
  orderNumber: string;
  vendor: CartVendor;
  lines: CartLine[];
  fulfillment: FulfillmentType;
  /** Snapshot of where it goes; null for pickup. */
  address: DeliveryAddress | null;
  /** ISO time for a scheduled order; null means ASAP. */
  scheduledFor: ISODate | null;
  contact: { name: string; phone: string };
  notes: string | null;
  payment: OrderPayment;
  pricing: OrderPricing;
  /**
   * Platform commission rate agreed with the vendor when this order was placed,
   * 0–1. Snapshotted rather than looked up at completion: the rate that applied
   * is a property of the order, and a later renegotiation must not restate it.
   * Resolved server-side (`services/orders`), never sent by the client.
   */
  commissionRate: number;
  status: OrderStatus;
  placedAt: ISODate;
  /** Estimated hand-off time, used by confirmation + tracking. */
  estimatedDeliveryAt: ISODate;
  /** Everything accumulated while the order is worked on. */
  lifecycle: OrderLifecycle;
}
