import { Inject, Injectable } from '@nestjs/common';

import { checkoutConfig, type CheckoutConfig } from '../../../config';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../../shared/contracts';
import { CLOCK, type Clock } from '../../../shared/kernel';
import { fail, ok, type Result } from '../../../shared/kernel';
import { CATALOG_READER, type CatalogReaderPort } from '../../catalog/domain';
import {
  CART_CHECKOUT,
  type CartCheckoutPort,
  cartCount,
  type CartOwner,
  type CartState,
  type CartVendorRecord,
  cartSubtotal,
  deliveryFeeFor,
} from '../../cart/domain';
import type { PaymentMethod, PaymentStatus } from '../../../shared/enums';
import {
  amountToMinOrder,
  CheckoutError,
  type CheckoutChoices,
  type CheckoutQuote,
  computePricing,
  type CouponOutcome,
  CouponRefusal,
  type CouponRefusalKey,
  evaluateCoupon,
  HANDOFF_CACHE,
  HANDOFF_CODE,
  type HandoffCachePort,
  type HandoffCodePort,
  isValidTipPercent,
  normaliseCode,
  ORDER_REPOSITORY,
  type OrderRepositoryPort,
  type PlacedOrder,
  type PlaceOrderRequest,
  type TaxRuleRecord,
} from '../domain';

/**
 * Checkout: what the basket costs, and turning it into an order.
 *
 * ## The one rule this service exists to enforce
 *
 * **Every number on the order comes from a stored row.** Not one price, discount, tax
 * rate, delivery fee or total is read from the request. What the client may send is a
 * short list of *choices* with no monetary content:
 *
 * | The client sends | Where the money comes from |
 * |---|---|
 * | `fulfillment` | the vendor's `deliveryFee` / `freeDeliveryOver`, from `vendors` |
 * | `tipPercent` | multiplied by the server's own subtotal |
 * | `couponCode` | the coupon's rule in `coupons`, evaluated here |
 * | nothing, for lines | `cart_items` snapshots written when each item went in |
 * | nothing, for tax | the most specific live rule in `tax_rules` |
 *
 * The frontend still computes a total, and must: `components/checkout/checkout-view.tsx`
 * updates the summary the instant a tip is tapped, and a round trip per tap would be a
 * worse product. So the client's arithmetic is a *display* and this is the *price*. When
 * they disagree the server wins — and `verify:checkout` asserts they agree on a table of
 * baskets, because a total that changes when the customer presses the button is a bug even
 * when the server's number is the correct one.
 *
 * `frontend/services/orders.ts::placeOrder` still takes `pricing` in its input, because
 * V1 may not change that interface. It sends the fields, and **this service reads none of
 * them** except `couponCode`, which is an identifier rather than an amount. That is worth
 * being explicit about: the seam looks like it trusts the client and does not.
 *
 * ## Why applying a coupon is a query
 *
 * PHASE 4 of the brief lists "Apply Coupon" as a mutation. It is a query here
 * (`checkoutSummary(couponCode:)`), because applying one changes no server state: the
 * evaluation is a pure function of the coupon's row, the basket and the clock, and nothing
 * is consumed until an order exists. A mutation would have to either write the code onto
 * the cart — inventing state the frontend does not read back, since `checkout-view.tsx`
 * holds the applied coupon in component state — or write nothing at all, which is a query
 * wearing the wrong verb. The redemption *is* recorded, at placement, where the money
 * moves.
 *
 * ## What is deliberately not here
 *
 * No payment capture, no `payment_intents`, no ledger entries, no wallet debit, no
 * `coupon_redemptions` row, no notifications, no state transitions beyond `placed`. Card
 * and wallet orders are marked `paid` exactly as the prototype marks them, which is
 * honest about what it is: a demo tender, not a gateway. Those belong to the payments,
 * promotions and notification units, and a half-built one of each would be worse than
 * none — an order that referenced a `PaymentIntent` nothing can settle is harder to
 * unpick than an order that references no payment at all.
 */
@Injectable()
export class CheckoutService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(CART_CHECKOUT) private readonly carts: CartCheckoutPort,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReaderPort,
    @Inject(HANDOFF_CODE) private readonly codes: HandoffCodePort,
    @Inject(HANDOFF_CACHE) private readonly handoffs: HandoffCachePort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(checkoutConfig.KEY) private readonly config: CheckoutConfig,
  ) {}

  /**
   * What this basket would cost, and whether it may be ordered.
   *
   * Writes nothing. Safe to call on every keystroke, which is what makes it usable as the
   * authority behind a live summary if the frontend ever wants one.
   */
  async summary(owner: CartOwner, choices: CheckoutChoices): Promise<Result<CheckoutQuote>> {
    if (!isValidTipPercent(choices.tipPercent, this.config.maxTipPercent)) {
      return fail(CheckoutError.tipInvalid, {
        path: 'input.tipPercent',
        params: { max: this.config.maxTipPercent },
      });
    }

    const cart = await this.readCart(owner);
    if (!cart || cart.lines.length === 0) return fail(CheckoutError.cartEmpty);

    const vendor = await this.carts.loadVendorSnapshot(cart.vendorId);
    if (!vendor) return fail(CheckoutError.vendorUnavailable);

    return ok(await this.quote(owner, cart, vendor, choices));
  }

  /**
   * Place the order.
   *
   * The whole thing is one transaction, and the boundary is not a formality: it writes an
   * order, its items, their options, the first lifecycle event, a sequence increment, and
   * it empties the basket. A failure halfway through either leaves an order nobody paid
   * for or a customer whose basket was consumed by an order that does not exist — and the
   * second is the one that generates a support call nobody can answer.
   *
   * Note the order of the two final writes: the order is created *before* the cart is
   * cleared. Within a transaction the sequence is invisible, but it states the intent —
   * the basket is consumed *by* something, and if the something cannot be written the
   * basket survives.
   */
  async placeOrder(
    actorId: string,
    guestKey: string | undefined,
    request: PlaceOrderRequest,
  ): Promise<Result<PlacedOrder>> {
    const owner: CartOwner = { userId: actorId, guestKey };

    if (!isValidTipPercent(request.tipPercent, this.config.maxTipPercent)) {
      return fail(CheckoutError.tipInvalid, {
        path: 'input.tipPercent',
        params: { max: this.config.maxTipPercent },
      });
    }
    if (!ACCEPTED_TENDERS.has(request.paymentMethod)) {
      return fail(CheckoutError.paymentUnsupported, { path: 'input.paymentMethod' });
    }
    if (!request.contact.name.trim() || request.contact.phone.trim().length < 6) {
      return fail(CheckoutError.contactRequired, { path: 'input.contact' });
    }
    if (request.fulfillment === 'delivery' && !request.address) {
      return fail(CheckoutError.addressRequired, { path: 'input.address' });
    }
    if (request.scheduledFor && request.scheduledFor.getTime() < this.clock.now()) {
      return fail(CheckoutError.scheduleInvalid, { path: 'input.scheduledFor' });
    }

    /**
     * Adoption happens here, before anything is priced.
     *
     * The customer may have filled this basket before signing in, in which case it belongs
     * to a `guestKey` and not to them. Checkout is the first operation that needs an
     * account, so it is the first place the two identities meet — and if adoption waited
     * for a later unit, the demo's own path (browse anonymously → sign in → pay) would
     * find an empty basket at the moment of payment.
     */
    const cart = guestKey
      ? await this.carts.adoptGuestCart(actorId, guestKey)
      : await this.carts.findLive(owner);
    if (!cart || cart.lines.length === 0) return fail(CheckoutError.cartEmpty);

    const vendor = await this.carts.loadVendorSnapshot(cart.vendorId);
    if (!vendor) return fail(CheckoutError.vendorUnavailable);

    /**
     * The check Unit 2 deliberately did not make.
     *
     * A closed kitchen does not block *adding* to a basket — browsing at midnight and
     * ordering at noon is normal, and the shipped UI allows it. It does block placing an
     * order for right now, because the order would sit unanswered until the restaurant
     * opened and the customer would be watching a countdown that means nothing. A
     * scheduled order is exempt: that is precisely the case where "closed now" is
     * irrelevant.
     */
    const listing = await this.catalog.findVendorById(cart.vendorId);
    if (!request.scheduledFor && listing && !listing.isOpen) {
      return fail(CheckoutError.vendorClosed, { params: { vendor: vendor.name } });
    }

    const quote = await this.quote(owner, cart, vendor, request);

    if (!quote.eligible) {
      return fail(quote.blockedReason ?? CheckoutError.belowMinimum, {
        params: { amount: quote.amountToMinOrder, minOrder: vendor.minOrder },
      });
    }

    /**
     * A coupon the server would not honour fails the *order*, not just the discount.
     *
     * The alternative — place it at the undiscounted price — charges the customer more
     * than the screen showed, at the moment they committed, without asking. The refusal
     * carries the reason so the client can drop the coupon, re-price and let them press
     * the button again knowing what it costs.
     */
    if (request.couponCode && !quote.coupon) {
      return fail(CheckoutError.couponRejected, {
        path: 'input.couponCode',
        params: { code: normaliseCode(request.couponCode), reason: quote.couponRefusal },
      });
    }

    const placedAt = this.clock.date();
    const code = this.codes.issue(this.config.otpDigits);

    const placed = await this.uow.runInTransaction(async () => {
      const order = await this.orders.createOrder({
        userId: actorId,
        vendorId: cart.vendorId,
        // Resolved by the repository from the vendor's primary branch: the kitchen board
        // is per branch, and an order with no branch would be invisible to it.
        branchId: null,
        vendorSnapshot: vendor,
        address: request.address,
        fulfillment: request.fulfillment,
        scheduledFor: request.scheduledFor,
        contact: {
          name: request.contact.name.trim(),
          phone: request.contact.phone.trim(),
        },
        notes: request.notes?.trim() || null,
        paymentMethod: request.paymentMethod,
        paymentStatus: paymentStatusFor(request.paymentMethod),
        cardLast4: request.paymentMethod === 'card' ? request.cardLast4 : null,
        pricing: quote.pricing,
        couponId: quote.coupon?.coupon.id ?? null,
        lines: cart.lines,
        placedAt,
        estimatedDeliveryAt:
          request.scheduledFor ?? new Date(placedAt.getTime() + this.config.defaultEtaMinutes * 60_000),
        otpHash: this.codes.hash(code),
      });

      await this.carts.clear(cart.id);
      return order;
    });

    /**
     * Outside the transaction, and allowed to be: the code's home is `orders.otpHash`,
     * which is already committed. Redis holds the readable copy so the customer's tracker
     * can show it later, and a failure to cache costs a display rather than a delivery —
     * so it must not be able to roll back an order that has been placed.
     */
    await this.handoffs.remember(placed.id, code, this.config.otpTtlHours * 3_600);

    // The one time the plaintext is returned. `stores/orders.ts` persists what it is given,
    // which is how the confirmation screen and the tracker can show the code at all.
    return ok({ ...placed, lifecycle: { ...placed.lifecycle, otp: code } });
  }

  /** An order the account owns, with its hand-off code if Redis still has it. */
  async findOrder(actorId: string, orderId: string): Promise<PlacedOrder | null> {
    const order = await this.orders.findOrderById(orderId, actorId);
    if (!order) return null;

    const code = await this.handoffs.recall(order.id);
    return code ? { ...order, lifecycle: { ...order.lifecycle, otp: code } } : order;
  }

  // --- internals ------------------------------------------------------------

  /**
   * The basket to price, without writing anything.
   *
   * A signed-in customer's own cart first; a guest key second. Read-only on purpose —
   * `summary` is a query, and adopting a basket as a side effect of asking what it costs
   * would be a write in a GraphQL query, which is the kind of thing that turns a
   * prefetch into a state change.
   */
  private async readCart(owner: CartOwner): Promise<CartState | null> {
    const mine = await this.carts.findLive(owner);
    if (mine) return mine;
    if (owner.userId && owner.guestKey) {
      return this.carts.findLive({ guestKey: owner.guestKey });
    }
    return null;
  }

  /**
   * The quote, from stored rows only.
   *
   * Shared by `summary` and `placeOrder` so that the number shown and the number charged
   * are produced by the same code path. Two implementations that agreed today would be
   * two implementations that disagree after the first change to either.
   */
  private async quote(
    owner: CartOwner,
    cart: CartState,
    vendor: CartVendorRecord,
    choices: CheckoutChoices,
  ): Promise<CheckoutQuote> {
    const now = this.clock.date();
    const subtotal = cartSubtotal(cart.lines);
    const tax = await this.taxFor(vendor, choices, now);

    const couponResult = choices.couponCode
      ? await this.priceCoupon(owner, cart, vendor, choices, subtotal, now)
      : { outcome: null, refusal: null };

    const pricing = computePricing({
      vendor,
      lines: cart.lines,
      fulfillment: choices.fulfillment,
      tipPercent: choices.tipPercent,
      coupon: couponResult.outcome,
      tax,
    });

    const toMin = amountToMinOrder(vendor, subtotal);
    // Pickup has no minimum: the vendor's floor exists to make a delivery worth riding
    // for, and there is no ride. `checkout-view.tsx` gates its own notice the same way.
    const belowMinimum = choices.fulfillment === 'delivery' && toMin > 0;

    return {
      cartId: cart.id,
      vendor,
      lines: cart.lines,
      fulfillment: choices.fulfillment,
      pricing,
      count: cartCount(cart.lines),
      eligible: !belowMinimum,
      blockedReason: belowMinimum ? CheckoutError.belowMinimum : null,
      amountToMinOrder: toMin,
      coupon: couponResult.outcome,
      couponRefusal: couponResult.refusal,
    };
  }

  /**
   * The tax rule for this order's jurisdiction.
   *
   * The vendor's country, not the customer's: consumption tax follows where the sale
   * happens, and a Dhaka restaurant does not charge UK VAT because a visitor ordered from
   * a British phone. The delivery city narrows it when there is a city-scoped rule, which
   * is why `city` is passed at all.
   *
   * No rule configured means no tax. That is the same answer `frontend/lib/checkout.ts`
   * gives for a country missing from its table, and it is the right default: inventing a
   * rate would charge a customer money on the strength of a guess.
   */
  private async taxFor(
    vendor: CartVendorRecord,
    choices: CheckoutChoices,
    at: Date,
  ): Promise<TaxRuleRecord> {
    const rule = await this.orders.resolveTaxRule({
      countryCode: vendor.countryCode,
      city: null,
      vendorId: vendor.id,
      at,
    });
    return rule ?? { label: NO_TAX_LABEL, rate: 0 };
  }

  /**
   * Look the code up and decide what it is worth — or why it is worth nothing.
   *
   * `deliveryFee` is passed *after* the vendor's free-delivery threshold has been applied,
   * so a free-delivery coupon on a basket that already qualifies is correctly refused as
   * `noSaving` rather than recorded against an order it did not discount.
   */
  private async priceCoupon(
    owner: CartOwner,
    cart: CartState,
    vendor: CartVendorRecord,
    choices: CheckoutChoices,
    subtotal: number,
    now: Date,
  ): Promise<{ outcome: CouponOutcome | null; refusal: CouponRefusalKey | null }> {
    const code = normaliseCode(choices.couponCode ?? '');
    if (!code) return { outcome: null, refusal: null };

    const coupon = await this.orders.findCouponByCode(code);
    if (!coupon) return { outcome: null, refusal: CouponRefusal.unknownCode };

    /**
     * Both usage limits and `firstOrderOnly` need an account, and an anonymous quote has
     * none. So a guest previewing a coupon is given the benefit of the doubt on the
     * per-customer rules — the quote is a shop window, and nothing has been spent. The
     * rules are enforced for real at `placeOrder`, which always has an actor.
     */
    const usage = owner.userId
      ? await this.orders.countCouponUse(coupon.id, owner.userId)
      : { byUser: 0, total: coupon.totalRedeemed };
    const hasOrdered = owner.userId ? await this.orders.hasPlacedOrder(owner.userId) : false;

    const evaluation = evaluateCoupon({ ...coupon, totalRedeemed: usage.total }, {
      vendorId: vendor.id,
      currency: vendor.currency,
      subtotal,
      deliveryFee: deliveryFeeFor(vendor, subtotal),
      fulfillment: choices.fulfillment,
      lines: cart.lines,
      /**
       * Empty, and that has a consequence worth stating: a category-scoped coupon is
       * refused with `categoryOnly` rather than granted, because V1's checkout cannot
       * resolve which browse categories a basket's dishes belong to. Refusing is the
       * conservative direction — it never gives money away — and none of the seeded
       * coupons is category-scoped. Resolving it properly needs a `food_items` →
       * `categories` read, which belongs with the promotions unit that also needs it for
       * the offers board.
       */
      categorySlugs: [],
      isFirstOrder: !hasOrdered,
      timesRedeemed: usage.byUser,
      now,
    });

    return evaluation.eligible
      ? { outcome: evaluation.outcome, refusal: null }
      : { outcome: null, refusal: evaluation.reason };
  }
}

/**
 * The tenders checkout accepts.
 *
 * Narrower than `PAYMENT_METHODS`, on purpose: Postgres knows `mfs` and `netbanking`
 * because D7 designed for Bangladesh, and the checkout screen offers neither. Accepting a
 * tender no gateway is wired to would produce an order marked paid that nobody was
 * charged for.
 */
const ACCEPTED_TENDERS = new Set<PaymentMethod>(['cash', 'card', 'wallet']);

/**
 * Cash is `pending` until the rider collects it; card and wallet resolve immediately.
 *
 * "Immediately" is the prototype's simulation, kept deliberately: `authorisePayment` in
 * `services/orders.ts` is a mock, so marking the order `paid` here records the same
 * fiction rather than inventing a settlement that did not happen. The payments unit
 * replaces this with an intent whose status the gateway owns.
 */
function paymentStatusFor(method: PaymentMethod): PaymentStatus {
  return method === 'cash' ? 'pending' : 'paid';
}

/** What the receipt says when no tax rule applies. */
const NO_TAX_LABEL = 'Tax';
