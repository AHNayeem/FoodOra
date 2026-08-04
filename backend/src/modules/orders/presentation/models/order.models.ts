import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar, MoneyScalar } from '../../../../common/scalars';
import { payloadOf } from '../../../../graphql';
import {
  CouponKindScalar,
  FulfillmentTypeScalar,
  OrderActorScalar,
  OrderCancelReasonScalar,
  OrderStatusScalar,
  PaymentMethodScalar,
  PaymentStatusScalar,
  RefundStatusScalar,
} from '../../../../graphql/scalars.registry';
import { CartLineModel, CartVendorModel } from '../../../cart/presentation/models/cart.models';

/**
 * The GraphQL surface of checkout and the order it produces.
 *
 * Field for field `frontend/types/order.ts`, in the same order and with the same names, for
 * the same reason the cart's models mirror `types/cart.ts`: those types are the contract and
 * this is the side that bends. `OrderPricing` in particular is copied exactly — including
 * `taxLabel` and `taxRate`, which a fresh design might have folded into a nested object —
 * because `components/checkout/order-summary.tsx` reads those field names today.
 *
 * `CartVendorModel` and `CartLineModel` are reused rather than redeclared. An order's
 * vendor snapshot and its lines *are* the cart's, which is why `Order.lines[].id` is still
 * the composite configuration key: the confirmation screen renders the same rows the basket
 * did, from the same shape.
 */

@ObjectType('OrderPricing', {
  description: 'The itemised breakdown. Every number here is computed server-side.',
})
export class OrderPricingModel {
  @Field(() => String, { description: 'ISO 4217. Every Money field below is in it.' })
  currency!: string;

  @Field(() => MoneyScalar, { description: 'Σ unitPrice × quantity, from the stored line snapshots.' })
  subtotal!: number;

  @Field(() => MoneyScalar, { description: 'Zero on pickup, or when a coupon waived it.' })
  deliveryFee!: number;

  @Field(() => MoneyScalar, { description: 'Coupon reduction, never more than the subtotal.' })
  discount!: number;

  @Field(() => String, { nullable: true, description: 'The code that produced `discount`.' })
  couponCode!: string | null;

  @Field(() => MoneyScalar, { description: 'Charged on (subtotal − discount).' })
  tax!: number;

  @Field(() => String, { description: 'What the receipt calls it — "VAT", "Sales Tax".' })
  taxLabel!: string;

  @Field(() => Float, { description: '0–1. 0.05 is five percent. Snapshotted from `tax_rules`.' })
  taxRate!: number;

  @Field(() => MoneyScalar, { description: 'Courier tip: the subtotal × the chosen fraction.' })
  tip!: number;

  @Field(() => MoneyScalar) total!: number;
}

@ObjectType('AppliedCouponSummary', {
  description: 'What a coupon is worth against this basket. Priced by the server, always.',
})
export class AppliedCouponModel {
  @Field(() => ID) id!: string;
  @Field(() => String) code!: string;
  @Field(() => String) title!: string;
  @Field(() => CouponKindScalar) kind!: string;

  @Field(() => MoneyScalar, { description: 'Money off the subtotal. Zero for free-delivery and cashback.' })
  discount!: number;

  @Field(() => Boolean) freeDelivery!: boolean;
  @Field(() => MoneyScalar) deliveryWaived!: number;

  @Field(() => MoneyScalar, {
    description:
      'Wallet credit earned. Deliberately does NOT reduce the total — that is what makes it cashback.',
  })
  cashback!: number;
}

@ObjectType('CheckoutSummary', {
  description:
    'What the basket costs and whether it may be ordered. A pure read — applying a coupon writes nothing.',
})
export class CheckoutSummaryModel {
  @Field(() => ID) cartId!: string;
  @Field(() => CartVendorModel) vendor!: CartVendorModel;
  @Field(() => [CartLineModel]) lines!: CartLineModel[];
  @Field(() => FulfillmentTypeScalar) fulfillment!: string;
  @Field(() => OrderPricingModel) pricing!: OrderPricingModel;
  @Field(() => Int, { description: 'Total units across the lines.' }) count!: number;

  @Field(() => Boolean, { description: 'Whether `placeOrder` would be accepted right now.' })
  eligible!: boolean;

  @Field(() => String, { nullable: true, description: 'i18n key naming the first blocker.' })
  blockedReason!: string | null;

  @Field(() => MoneyScalar, { description: "How much more to reach the vendor's minimum. Zero when met." })
  amountToMinOrder!: number;

  @Field(() => AppliedCouponModel, { nullable: true }) coupon!: AppliedCouponModel | null;

  @Field(() => String, {
    nullable: true,
    description: 'Why a requested coupon was not applied — a `coupons.reason.*` key.',
  })
  couponRefusal!: string | null;
}

@ObjectType('OrderEvent', { description: 'One thing that happened. Append-only.' })
export class OrderEventModel {
  @Field(() => ID) id!: string;
  @Field(() => OrderStatusScalar) status!: string;
  @Field(() => DateTimeScalar) at!: Date;
  @Field(() => OrderActorScalar) actor!: string;
  @Field(() => String, { nullable: true }) note!: string | null;
}

@ObjectType('OrderLifecycle', {
  description: 'Everything the order accumulates while it is worked on.',
})
export class OrderLifecycleModel {
  @Field(() => [OrderEventModel]) events!: OrderEventModel[];
  @Field(() => Int, { nullable: true }) prepMinutes!: number | null;
  @Field(() => DateTimeScalar, { nullable: true }) promisedReadyAt!: Date | null;
  @Field(() => Int) delayMinutes!: number;
  @Field(() => OrderCancelReasonScalar, { nullable: true }) rejectionReason!: string | null;
  @Field(() => OrderCancelReasonScalar, { nullable: true }) cancelReason!: string | null;
  @Field(() => OrderActorScalar, { nullable: true }) cancelledBy!: string | null;
  @Field(() => OrderCancelReasonScalar, { nullable: true }) failureReason!: string | null;
  @Field(() => DateTimeScalar, { nullable: true }) assignedAt!: Date | null;
  @Field(() => [String]) rejectedRiderIds!: string[];

  @Field(() => String, {
    description:
      'The delivery hand-off code. Returned once at placement and while Redis holds it; ' +
      'Postgres keeps only its SHA-256, so this is an empty string once the TTL passes.',
  })
  otp!: string;

  @Field(() => Int) otpAttempts!: number;
  @Field(() => DateTimeScalar, { nullable: true }) otpVerifiedAt!: Date | null;
  @Field(() => RefundStatusScalar) refund!: string;
  @Field(() => MoneyScalar) refundAmount!: number;
  @Field(() => Int, { nullable: true }) rating!: number | null;
}

@ObjectType('DeliveryAddress', { description: 'Where it goes. A snapshot, not a reference.' })
export class DeliveryAddressModel {
  @Field(() => String) label!: string;
  @Field(() => String) recipient!: string;
  @Field(() => String) phone!: string;
  @Field(() => String) line1!: string;
  @Field(() => String, { nullable: true }) line2!: string | null;
  @Field(() => String) area!: string;
  @Field(() => String) city!: string;
  @Field(() => String) countryCode!: string;
  @Field(() => String, { nullable: true }) instructions!: string | null;
}

@ObjectType('OrderContact')
export class OrderContactModel {
  @Field(() => String) name!: string;
  @Field(() => String) phone!: string;
}

@ObjectType('OrderPayment')
export class OrderPaymentModel {
  @Field(() => PaymentMethodScalar) method!: string;
  @Field(() => PaymentStatusScalar) status!: string;
  @Field(() => String, { nullable: true, description: 'Last 4 of the card. Demo only.' })
  cardLast4!: string | null;
}

@ObjectType('Order', { description: 'The immutable record produced at checkout.' })
export class OrderModel {
  @Field(() => ID) id!: string;

  @Field(() => String, { description: 'Human-facing reference, e.g. "FO-000123".' })
  orderNumber!: string;

  @Field(() => CartVendorModel) vendor!: CartVendorModel;
  @Field(() => [CartLineModel]) lines!: CartLineModel[];
  @Field(() => FulfillmentTypeScalar) fulfillment!: string;
  @Field(() => DeliveryAddressModel, { nullable: true }) address!: DeliveryAddressModel | null;
  @Field(() => DateTimeScalar, { nullable: true }) scheduledFor!: Date | null;
  @Field(() => OrderContactModel) contact!: OrderContactModel;
  @Field(() => String, { nullable: true }) notes!: string | null;
  @Field(() => OrderPaymentModel) payment!: OrderPaymentModel;
  @Field(() => OrderPricingModel) pricing!: OrderPricingModel;
  @Field(() => OrderStatusScalar) status!: string;
  @Field(() => DateTimeScalar) placedAt!: Date;

  @Field(() => DateTimeScalar, {
    description: 'Provisional until the kitchen accepts and commits to a preparation time.',
  })
  estimatedDeliveryAt!: Date;

  @Field(() => OrderLifecycleModel) lifecycle!: OrderLifecycleModel;

  @Field(() => DateTimeScalar) createdAt!: Date;
  @Field(() => DateTimeScalar) updatedAt!: Date;
  @Field(() => DateTimeScalar, { nullable: true }) deletedAt!: Date | null;
}

export const CheckoutSummaryPayload = payloadOf(CheckoutSummaryModel, 'CheckoutSummaryPayload');
export const OrderPayload = payloadOf(OrderModel, 'OrderPayload');
