import type { CartLineRecord, CartVendorRecord } from '../../cart/domain';
import type {
  CouponKind,
  FulfillmentType,
  OrderActor,
  OrderCancelReason,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from '../../../shared/enums';

/**
 * The records checkout works in.
 *
 * Shaped from `frontend/types/order.ts` rather than from the tables, in both directions:
 * `OrderPricingRecord` is `OrderPricing` field for field, and `PlacedOrder` is `Order`
 * with `lifecycle` nested exactly as the frontend nests it — even though Postgres stores
 * those columns flat. The recomposition happens in the repository, which is the only
 * layer allowed to know they were ever flat.
 *
 * Two things here that are *not* in the frontend's types, both marked, both server-only:
 * `CheckoutQuote.eligible` (whether this basket may be ordered at all) and
 * `PlacedOrder.handoffCode` (returned once at placement — Postgres keeps only its hash).
 */

/** `frontend/types/order.ts::DeliveryAddress`. Stored as a JSON snapshot on the order. */
export interface DeliveryAddressRecord {
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

/** `frontend/types/order.ts::OrderPricing`, field for field and in the same order. */
export interface OrderPricingRecord {
  currency: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode: string | null;
  tax: number;
  taxLabel: string;
  taxRate: number;
  tip: number;
  total: number;
}

/** The tax rule that applied, resolved from `tax_rules` and snapshotted onto the order. */
export interface TaxRuleRecord {
  label: string;
  /** 0–1. `0.05` is five percent. */
  rate: number;
}

/** A coupon as the pricing engine needs it — `coupons` plus its vendor/category scope. */
export interface CouponRecord {
  id: string;
  code: string;
  title: string;
  kind: CouponKind;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number;
  totalLimit: number | null;
  totalRedeemed: number;
  firstOrderOnly: boolean;
  /** Empty = any vendor. */
  vendorIds: string[];
  /** Empty = any dish. Browse-category slugs, as on the frontend. */
  categorySlugs: string[];
}

/** What a coupon is worth against one basket. Mirrors `lib/coupons.ts::CouponEvaluation`. */
export interface CouponOutcome {
  coupon: CouponRecord;
  /** Money off the subtotal. Zero for free-delivery and cashback. */
  discount: number;
  /** True when the fee is waived. */
  freeDelivery: boolean;
  deliveryWaived: number;
  /**
   * Credited to the wallet after the order, so it is deliberately *not* a discount and
   * does not move the total. That is what makes it cashback rather than a price cut.
   */
  cashback: number;
}

/**
 * What the basket is worth, and whether it may be ordered.
 *
 * The quote is a pure function of (cart, vendor, tax rule, choices) and writes nothing —
 * see `checkout.service.ts` for why applying a coupon is a query here rather than a
 * mutation.
 */
export interface CheckoutQuote {
  cartId: string;
  vendor: CartVendorRecord;
  lines: CartLineRecord[];
  fulfillment: FulfillmentType;
  pricing: OrderPricingRecord;
  /** Total units across the lines — the same number the header badge shows. */
  count: number;
  /**
   * Whether `placeOrder` would be accepted. Server-only: the frontend derives its own
   * "below minimum" notice from the cart, and this is the same rule stated once more on
   * the side that enforces it.
   */
  eligible: boolean;
  /** i18n key naming the first blocker, or null when eligible. */
  blockedReason: string | null;
  /** How much more is needed to reach the vendor's minimum. Zero when it is met. */
  amountToMinOrder: number;
  /** The coupon that priced, when one was asked for and accepted. */
  coupon: CouponOutcome | null;
  /** Why a requested coupon was not applied — an i18n key from `coupons.reason.*`. */
  couponRefusal: string | null;
}

/** `frontend/types/order.ts::OrderEvent`. Append-only; placement writes exactly one. */
export interface OrderEventRecord {
  id: string;
  status: OrderStatus;
  at: Date;
  actor: OrderActor;
  note: string | null;
}

/** `frontend/types/order.ts::OrderLifecycle`, nested as the frontend nests it. */
export interface OrderLifecycleRecord {
  events: OrderEventRecord[];
  prepMinutes: number | null;
  promisedReadyAt: Date | null;
  delayMinutes: number;
  rejectionReason: OrderCancelReason | null;
  cancelReason: OrderCancelReason | null;
  cancelledBy: OrderActor | null;
  failureReason: OrderCancelReason | null;
  /** Null until dispatch assigns one — Unit 6. */
  rider: null;
  assignment: null;
  assignedAt: Date | null;
  rejectedRiderIds: string[];
  /**
   * The hand-off code, plaintext.
   *
   * Postgres stores only its SHA-256, so this is populated from the placement response
   * or from Redis, and is an empty string once neither can supply it. `frontend/lib/
   * delivery.ts::otpFor` derived it from the order id, which meant anyone holding an
   * order number held the code; a server-issued one is the fix that file predicted.
   */
  otp: string;
  otpAttempts: number;
  otpVerifiedAt: Date | null;
  refund: RefundStatus;
  refundAmount: number;
  rating: number | null;
}

export interface OrderPaymentRecord {
  method: PaymentMethod;
  status: PaymentStatus;
  cardLast4: string | null;
}

/** `frontend/types/order.ts::Order`. What `placeOrder` returns and the store caches. */
export interface PlacedOrder {
  id: string;
  orderNumber: string;
  vendor: CartVendorRecord;
  lines: CartLineRecord[];
  fulfillment: FulfillmentType;
  address: DeliveryAddressRecord | null;
  scheduledFor: Date | null;
  contact: { name: string; phone: string };
  notes: string | null;
  payment: OrderPaymentRecord;
  pricing: OrderPricingRecord;
  status: OrderStatus;
  placedAt: Date;
  estimatedDeliveryAt: Date;
  lifecycle: OrderLifecycleRecord;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** The customer's choices — everything checkout cannot read from a table. */
export interface CheckoutChoices {
  fulfillment: FulfillmentType;
  /**
   * Tip as a fraction of the subtotal, not an amount.
   *
   * The percentage is what the customer actually chose (`lib/checkout.ts::TIP_PRESETS`
   * is a list of fractions), and it is the form that survives a basket the server
   * prices differently from the page: 10% of the real subtotal is still the intent,
   * where a stale ৳42 is not.
   */
  tipPercent: number;
  /** A code, never a discount. The server decides what it is worth. */
  couponCode: string | null;
}

/** Everything `placeOrder` needs beyond the choices above. */
export interface PlaceOrderRequest extends CheckoutChoices {
  address: DeliveryAddressRecord | null;
  scheduledFor: Date | null;
  contact: { name: string; phone: string };
  notes: string | null;
  paymentMethod: PaymentMethod;
  cardLast4: string | null;
}
