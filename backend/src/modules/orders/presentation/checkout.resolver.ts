import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { Actor } from '../../../common/context';
import { CurrentUser, Public } from '../../../common/decorators';
import { DomainError, ErrorCode } from '../../../common/errors';
import { zodPipe } from '../../../common/pipes';
import { type DataPayload, toPayload } from '../../../graphql';
import type { FulfillmentType, PaymentMethod } from '../../../shared/enums';
import type { CartOwner } from '../../cart/domain';
import { CheckoutService } from '../application/checkout.service';
import type { CheckoutQuote, PlacedOrder } from '../domain';
import {
  CheckoutSummaryInput,
  CheckoutSummarySchema,
  PlaceOrderInput,
  PlaceOrderSchema,
} from './inputs/checkout.inputs';
import {
  CheckoutSummaryModel,
  CheckoutSummaryPayload,
  OrderModel,
  OrderPayload,
} from './models/order.models';

/**
 * Checkout's three operations, and the one place in V1 where the answer to "who is this?"
 * changes what is allowed.
 *
 * ## Why `checkoutSummary` is public and `placeOrder` is not
 *
 * A quote is a shop window: it prices a basket and writes nothing, so an anonymous visitor
 * is entitled to one — and needs one, because the checkout screen is reachable before
 * signing in and a customer deciding whether to create an account is exactly the person who
 * wants to know the total first.
 *
 * Placing an order is different, and the requirement comes from the schema rather than from
 * preference: `orders.userId` is the only owner column and there is no `guestKey` on that
 * table. A guest order would be an order with no owner — invisible to `myOrders`,
 * unattributable in support, impossible to refund to anyone. `config/backend.ts` predicted
 * this in Unit 2: "Checkout is what will require an account."
 *
 * The consequence is handled rather than left to fail: `placeOrder` takes the basket's
 * `guestKey` and *adopts* that basket onto the account, so browse-anonymously → sign-in →
 * pay keeps the customer's dinner. That adoption is the `mergeGuestCart` Unit 2 listed as a
 * gap, arriving where it belongs.
 *
 * ## Why `placeOrder` and not `checkout`
 *
 * PHASE 4 of the brief calls the mutation "Checkout". It is `placeOrder` here, matching
 * `frontend/services/orders.ts::placeOrder`, because every name on this surface is chosen to
 * match the frontend seam it replaces — that is what has made each unit a one-file change on
 * the client. A verb that only the backend uses would be a translation layer nobody needs.
 */
@Resolver()
export class CheckoutResolver {
  constructor(private readonly checkout: CheckoutService) {}

  @Public()
  @Query(() => CheckoutSummaryPayload, {
    name: 'checkoutSummary',
    description:
      'What the basket costs, from stored rows only. Writes nothing, so it is safe to call ' +
      'on every change of fulfilment, tip or coupon.',
  })
  async checkoutSummary(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(CheckoutSummarySchema)) input: CheckoutSummaryInput,
  ): Promise<DataPayload<CheckoutSummaryModel>> {
    const result = await this.checkout.summary(this.owner(actor, input.guestKey), {
      fulfillment: input.fulfillment as FulfillmentType,
      tipPercent: input.tipPercent,
      couponCode: input.couponCode ?? null,
    });
    if (!result.ok) {
      const refusal = toPayload(result);
      return { success: false, error: refusal.error, data: null };
    }
    return { success: true, error: null, data: toSummaryModel(result.data) };
  }

  /**
   * Place the order.
   *
   * Not `@Public()`, which is the whole point — and the actor comes from the guard's
   * resolved token, never from an argument. A `userId` input would let anyone order in
   * anyone's name.
   */
  @Mutation(() => OrderPayload, {
    description:
      'Turn the basket into an order. Prices, discounts, tax, delivery and the total are ' +
      'computed here; the request may only state a tip fraction and a coupon code.',
  })
  async placeOrder(
    @CurrentUser() actor: Actor | undefined,
    @Args('input', zodPipe(PlaceOrderSchema)) input: PlaceOrderInput,
  ): Promise<DataPayload<PlacedOrder>> {
    if (!actor) throw this.signInRequired();

    const result = await this.checkout.placeOrder(actor.id, input.guestKey, {
      fulfillment: input.fulfillment as FulfillmentType,
      tipPercent: input.tipPercent,
      couponCode: input.couponCode ?? null,
      address: input.address
        ? {
            label: input.address.label,
            recipient: input.address.recipient,
            phone: input.address.phone,
            line1: input.address.line1,
            line2: input.address.line2 ?? null,
            area: input.address.area,
            city: input.address.city,
            countryCode: input.address.countryCode,
            instructions: input.address.instructions ?? null,
          }
        : null,
      scheduledFor: input.scheduledFor ?? null,
      contact: { name: input.contactName, phone: input.contactPhone },
      notes: input.notes ?? null,
      paymentMethod: input.paymentMethod as PaymentMethod,
      cardLast4: input.cardLast4 ?? null,
    });
    return toPayload(result);
  }

  /**
   * One order by id.
   *
   * `frontend/app/(marketing)/checkout/success` reads the order out of the persisted store
   * rather than fetching it, so nothing calls this yet. It exists because an order that can
   * be created and not read back is a write-only record, and because the hand-off code has
   * to be re-readable: the customer closes the tab between placement and the doorstep.
   */
  @Query(() => OrderModel, {
    name: 'order',
    nullable: true,
    description: 'One of your own orders. Somebody else’s is indistinguishable from missing.',
  })
  async order(
    @CurrentUser() actor: Actor | undefined,
    @Args('id', { type: () => String }) id: string,
  ): Promise<PlacedOrder | null> {
    if (!actor) throw this.signInRequired();
    return this.checkout.findOrder(actor.id, id);
  }

  /**
   * The owner of a *basket*, for the quote.
   *
   * Identical precedence to the cart's resolver, and for the identical reasons: a signed-in
   * request ignores `guestKey` for identity, and a request with neither is refused rather
   * than handed an empty basket, because "you did not say who you are" and "your basket is
   * empty" are different facts.
   */
  private owner(actor: Actor | undefined, guestKey: string | undefined): CartOwner {
    if (actor) return { userId: actor.id, guestKey };
    if (guestKey) return { guestKey };

    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'errors.cartOwnerRequired', {
      cause: new Error(
        'Pricing a basket needs either an authenticated actor or the guestKey that owns it.',
      ),
    });
  }

  /**
   * A defensive assertion, not the mechanism.
   *
   * Neither of these operations is `@Public()`, so the guard chain refuses an anonymous
   * request with `errors.unauthenticated` before a resolver body runs — which is why
   * `frontend/services/orders.ts` reads *that* key and not this one. This exists because the
   * `Actor | undefined` in the signature is what the decorator returns and narrowing it with
   * a non-null assertion would be a lie that survives a future `@Public()` added by mistake.
   *
   * Thrown rather than returned as a payload refusal, per D5: a missing session is not
   * something the customer can act on inside the operation — the client has to send them
   * somewhere else first.
   */
  private signInRequired(): DomainError {
    return new DomainError(ErrorCode.UNAUTHENTICATED, 'checkout.errors.signInRequired', {
      cause: new Error(
        'An order needs an owner: `orders.userId` is the only owner column and there is no ' +
          'guestKey on that table. Sign the customer in, then re-send with the basket’s guestKey.',
      ),
    });
  }
}

/**
 * `CheckoutQuote` → the GraphQL model, which exists to flatten one thing.
 *
 * The domain's `CouponOutcome` nests the coupon it priced (`{ coupon, discount, … }`) because
 * that is the honest shape — the rule and what it was worth are two different facts. The wire
 * type is flat, because a client rendering "TEST15 · −৳250" wants one object and not a walk.
 *
 * This mapping is why the model layer is not just a set of decorators over domain records. It
 * was also a real bug for about ten minutes: the flat model over the nested record made
 * GraphQL resolve `code` to null on a non-nullable field, which surfaced as a 200 with an
 * `errors` array beside a perfectly correct `pricing`. Worth remembering as the shape of that
 * failure — the data is right and the response is broken.
 */
function toSummaryModel(quote: CheckoutQuote): CheckoutSummaryModel {
  return {
    cartId: quote.cartId,
    vendor: quote.vendor,
    lines: quote.lines,
    fulfillment: quote.fulfillment,
    pricing: quote.pricing,
    count: quote.count,
    eligible: quote.eligible,
    blockedReason: quote.blockedReason,
    amountToMinOrder: quote.amountToMinOrder,
    coupon: quote.coupon
      ? {
          id: quote.coupon.coupon.id,
          code: quote.coupon.coupon.code,
          title: quote.coupon.coupon.title,
          kind: quote.coupon.coupon.kind,
          discount: quote.coupon.discount,
          freeDelivery: quote.coupon.freeDelivery,
          deliveryWaived: quote.coupon.deliveryWaived,
          cashback: quote.coupon.cashback,
        }
      : null,
    couponRefusal: quote.couponRefusal,
  };
}
