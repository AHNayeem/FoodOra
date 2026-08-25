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
  /**
   * QUEUED — placed for a future slot and not yet released to anybody.
   *
   * The entry state of a *scheduled* order and the only status that is not
   * reachable by a transition: an order is born here or it is born `placed`. It
   * sits outside the happy path (`DELIVERY_STAGES` / `PICKUP_STAGES` both start
   * at `placed`) because it is not a step of the journey — it is the wait before
   * the journey starts, and a timeline that drew it as a stage would tell an ASAP
   * customer they had skipped one.
   *
   * Released to `placed` by `stores/orders.releaseScheduled` once the slot is
   * close enough to cook for (`SCHEDULE_LEAD_MINUTES`), from which point it is an
   * ordinary order and nothing downstream needs to know it was ever scheduled.
   */
  | "scheduled"
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
 * What an event *says*, beyond the status it moved into (Phase 18, G45).
 *
 * This used to be a `note: string`, and it was a string only in the sense that
 * `"delay:15"` is a string: every value in it was a machine-readable code with a
 * payload glued on after a colon, minted in one module and pulled apart with
 * `split(":")` in another. Nothing typed the vocabulary, so a note the renderer
 * had no case for fell through to the raw code and the customer read
 * `handover-failed:3` on their timeline — which is exactly what had happened to
 * two of the ten notes by the time this phase started.
 *
 * A discriminated union puts the vocabulary in the type system. A new kind of
 * event cannot be minted without the compiler asking the timeline what it says,
 * and its payload arrives as `minutes: number` rather than as the second half of
 * a string.
 *
 * Each member carries only what is *not* already on the order. There is no
 * `method` on the refund members (`lifecycle.refundMethod` holds it), no
 * `scheduledFor` on the release (`order.scheduledFor` holds it) and no reason on
 * a cancellation (`lifecycle.cancelReason` holds it) — an event that restated
 * them could disagree with them, which is the §5.2 mistake in miniature.
 */
export type OrderEventDetail =
  /** The restaurant asked for more time. */
  | { kind: "delay"; minutes: number }
  /** A wrong doorstep code, and which attempt it was. */
  | { kind: "otp-failed"; attempts: number }
  /** A wrong courier code at the counter, and which attempt it was. */
  | { kind: "handover-failed"; attempts: number }
  /**
   * A refund opened, decided or paid. `amount` is null on an event recovered by
   * the migration, where the order records the sum but the event never did — a
   * missing figure rather than a zero one.
   */
  | { kind: "refund-requested"; amount: number | null }
  | { kind: "refund-approved"; amount: number | null }
  | { kind: "refund-rejected" }
  | { kind: "refund-settled"; amount: number | null }
  /** The desk moved the job to another courier. `fromRider` is who lost it. */
  | { kind: "reassigned"; fromRider: string | null }
  /** A scheduled order reached its slot and went to the restaurant. */
  | { kind: "scheduled-release" }
  /** The customer scored the order. */
  | { kind: "rating"; score: number }
  /**
   * Free prose somebody typed — the operator's line on a cancellation, the
   * courier's on a failed doorstep. The one member whose payload is genuinely
   * text, and it is a *field* rather than an encoding: nothing parses it.
   */
  | { kind: "note"; body: string };

/** The tags of {@link OrderEventDetail}. Exported so a renderer can exhaust them. */
export type OrderEventKind = OrderEventDetail["kind"];

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
   * What this event says beyond the status — a delay, a failed code, a refund
   * decision, a typed line from the desk. Null for a plain transition.
   */
  detail: OrderEventDetail | null;
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
/**
 * One thing the counter and the courier confirm before the food leaves the
 * kitchen (Phase 10, G22).
 *
 * A closed vocabulary rather than free text, because the point of a checklist is
 * that the *same* four things are checked every time and can be counted
 * afterwards. `identity` is the one that needs the courier's code: the other three
 * are things either party can see.
 */
export type HandoverCheck =
  /** The courier at the counter is the one dispatch assigned. */
  | "identity"
  /** The order number on the bag matches the docket. */
  | "orderNumber"
  /** Every line on the docket is in the bag. */
  | "items"
  /** Bag sealed, drinks upright, hot and cold separated. */
  | "sealed";

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
  /**
   * Wrong courier codes typed at the counter — the restaurant is locked out of
   * the handover after `HANDOVER_MAX_ATTEMPTS`, exactly as the rider is locked out
   * of the doorstep. Phase 10, G22.
   */
  handoverAttempts: number;
  /** When the food actually changed hands, verified. Null until it has. */
  handoverVerifiedAt: ISODate | null;
  /**
   * Which checks were confirmed at the handover. Empty until it happens — and
   * recorded rather than merely required, because a checklist nobody can look up
   * afterwards is a decoration.
   */
  handoverChecks: HandoverCheck[];
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
