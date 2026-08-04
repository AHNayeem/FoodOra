/**
 * The ordering vocabularies, verbatim from `frontend/types/order.ts`.
 *
 * Every one of them is kebab-case in at least one member — `rider-assigned`,
 * `delivery-failed`, `out-of-stock` — which is why they reach the wire as validated
 * scalars rather than GraphQL enums (D5 §Enums). Postgres keeps native enums
 * underneath with the same `@map`ped labels, and `assertVocabularyMatches` in
 * `OrdersModule.onModuleInit` fails the boot if the two ever drift.
 *
 * The order of `ORDER_STATUSES` is the lifecycle order, not alphabetical, and it is
 * load-bearing in `frontend/lib/order-machine.ts::stagesFor` — a progress bar that
 * shows five stages reads the position of a status in this list. Terminal states
 * follow the happy path.
 */

/**
 * `frontend/types/order.ts::OrderStatus`. Postgres: `order_status_kind`.
 *
 * V1 Unit 3 only ever writes the first member. The rest exist because the *type* is
 * the contract: `Order.status` is this union on the frontend today, so a model that
 * offered a narrower one would be a different type wearing the same name.
 */
export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'preparing',
  'packing',
  'ready',
  'rider-assigned',
  'picked-up',
  'on-the-way',
  'arrived',
  'delivered',
  'completed',
  'rejected',
  'cancelled',
  'delivery-failed',
  'returned',
  'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** `frontend/types/order.ts::OrderActor` — who moved the order. Postgres: `order_actor_kind`. */
export const ORDER_ACTORS = ['customer', 'restaurant', 'rider', 'system', 'admin'] as const;

export type OrderActor = (typeof ORDER_ACTORS)[number];

/** `frontend/types/order.ts::FulfillmentType`. Postgres: `fulfillment_kind`. */
export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;

export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

/**
 * `frontend/types/order.ts::PaymentMethod`, **plus** the two tenders Postgres knows
 * and the prototype does not offer.
 *
 * This is the one vocabulary here that is wider than the frontend's, and the width is
 * the schema's rather than a choice: `payment_method_kind` carries `mfs` (bKash, Nagad)
 * and `netbanking` because D7 designed for Bangladesh, where mobile financial services
 * are the dominant tender. `assertVocabularyMatches` demands both lists agree, so this
 * one has to include them; `checkout.inputs.ts` is where the *accepted* set narrows back
 * to the three the checkout screen renders. Validating at the input rather than in the
 * vocabulary is deliberate — the day the payments unit adds bKash, the scalar already
 * speaks it.
 */
export const PAYMENT_METHODS = ['cash', 'card', 'wallet', 'mfs', 'netbanking'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `frontend/types/order.ts::PaymentStatus`. Postgres: `payment_status_kind`. */
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** `frontend/types/order.ts::OrderCancelReason`. Postgres: `order_cancel_reason_kind`. */
export const ORDER_CANCEL_REASONS = [
  'out-of-stock',
  'too-busy',
  'closing-soon',
  'cannot-deliver',
  'changed-mind',
  'too-slow',
  'ordered-by-mistake',
  'duplicate',
  'customer-unavailable',
  'wrong-address',
  'refused-delivery',
  'other',
] as const;

export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

/** `frontend/types/order.ts::RefundStatus`. Postgres: `refund_status_kind`. */
export const REFUND_STATUSES = ['none', 'requested', 'approved', 'rejected'] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** `frontend/types/coupon.ts::CouponKind` — how a discount is calculated. Postgres: `discount_kind`. */
export const COUPON_KINDS = [
  'percentage',
  'fixed',
  'free-delivery',
  'bogo',
  'cashback',
] as const;

export type CouponKind = (typeof COUPON_KINDS)[number];
