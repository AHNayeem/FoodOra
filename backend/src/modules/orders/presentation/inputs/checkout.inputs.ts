import { Field, Float, ID, InputType } from '@nestjs/graphql';
import { z } from 'zod';

import { FulfillmentTypeScalar, PaymentMethodScalar } from '../../../../graphql/scalars.registry';
import { DateTimeScalar } from '../../../../common/scalars';
import { FULFILLMENT_TYPES, PAYMENT_METHODS } from '../../../../shared/enums';

/**
 * Checkout's inputs — the same study the cart's inputs began, at higher stakes.
 *
 * **There is no `subtotal`, `deliveryFee`, `discount`, `tax`, `taxRate`, `tip`, `total` or
 * `unitPrice` anywhere in this file.** Not as an optional field, not as an ignored one. The
 * complete list of what a client may say about money is:
 *
 * - `tipPercent` — a *fraction*, which the server multiplies by its own subtotal;
 * - `couponCode` — an *identifier*, which the server looks up and prices itself.
 *
 * Everything else is a choice with no monetary content (delivery or pickup, an address, a
 * tender, a time) or a fact about the customer (name, phone, a note for the kitchen).
 *
 * `frontend/services/orders.ts::placeOrder` accepts a whole `OrderPricing` in its own
 * signature, because V1 may not change that interface — and it sends none of it. Only
 * `pricing.couponCode` crosses the wire, as `couponCode`. That is worth stating twice: the
 * frontend seam looks like it hands over a priced order and does not.
 *
 * ## Why the tip is a fraction and not an amount
 *
 * Because a fraction is what the customer actually chose. `lib/checkout.ts::TIP_PRESETS` is
 * a list of fractions, and the summary renders the money from one — so the fraction is the
 * intent and the money is its display. It also survives the case the whole unit exists for:
 * if the server's subtotal differs from the page's, ten percent is still ten percent, where
 * a stale ৳42 is a number nobody meant.
 */

/** Roughly the entropy of a UUID, minus the formatting. Same rule as the cart's. */
const guestKey = z
  .string()
  .trim()
  .min(16, 'a guest key shorter than this is guessable')
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'expected an opaque url-safe token');

/** Codes are canonicalised server-side; this only bounds the shape. */
const couponCode = z.string().trim().min(2).max(40);

@InputType({ description: 'Where the delivery goes. Stored as a snapshot on the order.' })
export class DeliveryAddressInput {
  @Field(() => String) label!: string;
  @Field(() => String) recipient!: string;
  @Field(() => String) phone!: string;
  @Field(() => String) line1!: string;
  @Field(() => String, { nullable: true }) line2?: string | null;
  @Field(() => String) area!: string;
  @Field(() => String) city!: string;
  @Field(() => String) countryCode!: string;
  @Field(() => String, { nullable: true }) instructions?: string | null;
}

@InputType({ description: 'The choices a quote depends on. None of them is an amount.' })
export class CheckoutSummaryInput {
  @Field(() => FulfillmentTypeScalar, { defaultValue: 'delivery' })
  fulfillment!: string;

  @Field(() => Float, {
    defaultValue: 0,
    description:
      'Tip as a fraction of the subtotal — 0.1 is ten percent. The server does the multiplication.',
  })
  tipPercent!: number;

  @Field(() => String, {
    nullable: true,
    description: 'A coupon code. What it is worth is decided here, never sent from the client.',
  })
  couponCode?: string | null;

  @Field(() => String, { nullable: true, description: 'Identifies an anonymous basket.' })
  guestKey?: string;
}

@InputType({ description: 'Place the order. Every price on the result is computed server-side.' })
export class PlaceOrderInput {
  @Field(() => FulfillmentTypeScalar, { defaultValue: 'delivery' })
  fulfillment!: string;

  @Field(() => Float, { defaultValue: 0, description: 'Fraction of the subtotal.' })
  tipPercent!: number;

  @Field(() => String, { nullable: true }) couponCode?: string | null;

  @Field(() => DeliveryAddressInput, {
    nullable: true,
    description: 'Required for delivery, ignored for pickup.',
  })
  address?: DeliveryAddressInput | null;

  @Field(() => DateTimeScalar, {
    nullable: true,
    description: 'A scheduled slot, or null for as-soon-as-possible.',
  })
  scheduledFor?: Date | null;

  @Field(() => String, { description: 'Who the restaurant should ask for.' })
  contactName!: string;

  @Field(() => String) contactPhone!: string;

  @Field(() => String, { nullable: true, description: 'A note for the kitchen.' })
  notes?: string | null;

  @Field(() => PaymentMethodScalar, {
    defaultValue: 'cash',
    description: 'Cash, card or wallet. The two other schema tenders are refused here.',
  })
  paymentMethod!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Last 4 of the card, for the receipt. Demo only — no gateway is involved.',
  })
  cardLast4?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'The basket’s guest key, when it was built before signing in. Checkout adopts that ' +
      'basket onto the account — which is why the customer does not lose it at the till.',
  })
  guestKey?: string;
}

const address = z.object({
  label: z.string().trim().min(1).max(60),
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(24),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish(),
  area: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  countryCode: z.string().trim().length(2).toUpperCase(),
  instructions: z.string().trim().max(300).nullish(),
});

/**
 * The ceiling here is deliberately generous — 10, a thousand percent — because this is the
 * *shape* check, and the real limit is `CHECKOUT_MAX_TIP_PERCENT`, applied by the service
 * where it is configurable. A validation schema that hard-coded the policy would make the
 * environment variable a lie.
 */
const tipPercent = z.number().min(0).max(10);

export const CheckoutSummarySchema = z.object({
  fulfillment: z.enum(FULFILLMENT_TYPES),
  tipPercent,
  couponCode: couponCode.nullish(),
  guestKey: guestKey.optional(),
});

export const PlaceOrderSchema = z.object({
  fulfillment: z.enum(FULFILLMENT_TYPES),
  tipPercent,
  couponCode: couponCode.nullish(),
  address: address.nullish(),
  scheduledFor: z.date().nullish(),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: z.string().trim().min(6).max(24),
  notes: z.string().trim().max(500).nullish(),
  /**
   * Validated against the *whole* vocabulary here and narrowed to the three accepted
   * tenders by `CheckoutService`. The split is intentional: this layer rejects values that
   * are not tenders at all, and the service rejects tenders the platform cannot charge —
   * which is a policy that will change when the payments unit wires bKash.
   */
  paymentMethod: z.enum(PAYMENT_METHODS),
  cardLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'expected exactly four digits')
    .nullish(),
  guestKey: guestKey.optional(),
});
