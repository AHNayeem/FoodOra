import type {
  CartLine,
  CartVendor,
  DeliveryAddress,
  FulfillmentType,
  Order,
  OrderCancelReason,
  OrderPricing,
  PaymentMethod,
  SavedAddress,
} from "@/types";
import { LIVE } from "@/config/backend";
import { getCartKey } from "@/lib/cart-key";
import { savedAddresses, vendorById } from "@/lib/mock";
import { createLifecycle } from "@/lib/order-lifecycle";
import { commissionRateFor, DEFAULT_COMMISSION_RATE } from "@/lib/settlement";
import { execute } from "@/lib/graphql/execute";
import { PLACE_ORDER, type OrderWire } from "@/lib/graphql/order.operations";
import { mockDelay, ok, type Result } from "./http";

/**
 * orders.ts — placing an order.
 *
 * Phase C had no backend: `placeOrder` fabricated the immutable record a real endpoint would
 * return and handed it back through `Promise<Result<Order>>`. V1 Unit 3 makes it real, and
 * the signature is byte-identical — which is the whole point, because
 * `components/checkout/checkout-view.tsx` is not allowed to change.
 *
 * ## The one thing worth understanding about this file
 *
 * **`PlaceOrderInput.pricing` is accepted and almost entirely discarded.** The interface has
 * to keep that field — eight components and a store read `OrderPricing`, and V1 may not
 * touch the type — but of its ten members exactly one crosses the wire: `couponCode`, which
 * is an identifier rather than an amount. `subtotal`, `deliveryFee`, `discount`, `tax`,
 * `taxRate`, `tip` and `total` are all recomputed server-side from stored rows.
 *
 * That is not distrust of our own client. It is that the client's numbers are a *display*
 * built from the page it was rendered with, and the page can be minutes old: a repriced
 * dish, a basket edited on a phone, a coupon that expired at midnight. The screen showing a
 * stale total is a cosmetic problem. Charging it is not.
 *
 * The tip is sent as a **fraction** rather than an amount, derived back out of
 * `pricing.tip / pricing.subtotal`, because a fraction is what the customer chose and what
 * survives a subtotal the server computes differently. See `lib/graphql/order.operations.ts`.
 *
 * ## Why there is no fallback to the mock
 *
 * `services/catalog.ts` degrades to mock data when the API is unreachable, because a stale
 * restaurant list beats an error page. A *write* gets the opposite treatment, and checkout is
 * the sharpest case: an order that "succeeded" locally while failing server-side produces a
 * customer with a confirmation screen, an order number and no dinner. The failure is
 * returned as an error the existing UI already renders.
 */

/** Return the signed-in customer's saved addresses (demo: the seeded book). */
export async function getSavedAddresses(): Promise<SavedAddress[]> {
  return mockDelay(savedAddresses, 200);
}

export interface PlaceOrderInput {
  vendor: CartVendor;
  lines: CartLine[];
  fulfillment: FulfillmentType;
  address: DeliveryAddress | null;
  scheduledFor: string | null;
  contact: { name: string; phone: string };
  notes: string | null;
  payment: { method: PaymentMethod; cardLast4: string | null };
  pricing: OrderPricing;
}

/** 6-char human order reference, e.g. "FO-8F3A21", derived from a timestamp. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/**
 * How long an online payment "takes" before it settles. Card and wallet resolve
 * through a visible processing step at checkout rather than instantly, because
 * an instant success is the one thing a payment screen never does.
 */
export const PAYMENT_PROCESSING_MS = 1400;

/**
 * Place an order. Validates the cart is non-empty, simulates gateway latency,
 * then returns a fully-formed Order in `placed` (PENDING_CONFIRMATION) with its
 * lifecycle record initialised — event log, handoff code and all.
 *
 * Card/wallet payments resolve as `paid`, cash-on-delivery stays `pending` until
 * the rider collects it (the machine settles it on `delivered`).
 *
 * Note what is *not* set here: no ETA is promised beyond a provisional one. The
 * real estimate is stamped when the restaurant accepts and commits to a
 * preparation time — before that, nobody knows.
 */
/**
 * The commission rate to stamp on a new order.
 *
 * Resolved here rather than sent by the client for the same reason the totals are
 * recomputed server-side: what the platform charges a vendor is the platform's
 * business, and a cart snapshot minutes old is not a contract. The cart carries
 * no rate, so there is nothing for a caller to get wrong.
 */
function resolveCommissionRate(vendorId: string): number {
  const vendor = vendorById.get(vendorId);
  return vendor ? commissionRateFor(vendor) : DEFAULT_COMMISSION_RATE;
}

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<Result<Order>> {
  if (input.lines.length === 0) {
    return { data: null, error: "errors.emptyCart" };
  }

  /**
   * `LIVE.orders` requires `LIVE.cart`, and the dependency is real rather than tidy: the
   * server prices the *server's* basket, so an order placed while the cart still lived only
   * in Zustand would be priced from an empty one. Rather than fail confusingly, the mock path
   * stays in charge until both flags are on.
   */
  if (LIVE.orders && LIVE.cart) return placeOrderLive(input);

  await mockDelay(null, 900);

  const now = Date.now();
  const iso = new Date(now).toISOString();
  // Provisional until the kitchen commits to a prep time (see the machine).
  const etaIso = input.scheduledFor ?? new Date(now + 40 * 60_000).toISOString();
  const id = `ord_${now.toString(36)}`;

  const order: Order = {
    id,
    orderNumber: orderNumberFrom(now),
    vendor: input.vendor,
    lines: input.lines,
    fulfillment: input.fulfillment,
    address: input.address,
    scheduledFor: input.scheduledFor,
    contact: input.contact,
    notes: input.notes,
    payment: {
      method: input.payment.method,
      status: input.payment.method === "cash" ? "pending" : "paid",
      cardLast4: input.payment.cardLast4,
    },
    pricing: input.pricing,
    commissionRate: resolveCommissionRate(input.vendor.id),
    status: "placed",
    placedAt: iso,
    estimatedDeliveryAt: etaIso,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
    lifecycle: createLifecycle(id, iso),
  };

  return ok(order);
}

/**
 * The live path: send the choices, receive a priced order.
 *
 * Kept as a separate function rather than branching inline so that the mock body above stays
 * exactly as Phase C wrote it — it is still the path every unit-flag-off run takes, and a
 * rewrite of it would be a change nobody asked for.
 */
async function placeOrderLive(input: PlaceOrderInput): Promise<Result<Order>> {
  /**
   * The tip, back to the fraction the customer picked.
   *
   * `pricing.tip` is money the client computed; `tipPercent` is the choice behind it, and the
   * server multiplies it by *its* subtotal. Guarded against a zero subtotal, which cannot
   * happen with a non-empty basket but would be a division by zero if it did.
   */
  const tipPercent = input.pricing.subtotal > 0 ? input.pricing.tip / input.pricing.subtotal : 0;

  try {
    const { placeOrder: payload } = await execute(PLACE_ORDER, {
      input: {
        fulfillment: input.fulfillment,
        tipPercent,
        // The only member of `pricing` that travels — an identifier, not an amount.
        couponCode: input.pricing.couponCode,
        address: input.address,
        scheduledFor: input.scheduledFor,
        contactName: input.contact.name,
        contactPhone: input.contact.phone,
        notes: input.notes,
        paymentMethod: input.payment.method,
        cardLast4: input.payment.cardLast4,
        // Lets the server adopt a basket that was built before the customer signed in.
        guestKey: getCartKey(),
      },
    });

    if (!payload.success || !payload.data) {
      return { data: null, error: toCheckoutError(payload.error?.key) };
    }
    return ok(toOrder(payload.data));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[orders] placeOrder did not reach the API — no order was created:", detail);

    /**
     * A signed-out checkout arrives here rather than as a payload refusal, and that is the
     * guard chain doing its job: `placeOrder` is not a public mutation, so the JWT guard
     * refuses the request before the resolver can return anything. The refusal is
     * `UNAUTHENTICATED` in `errors[]`, which `execute` turns into a thrown transport error —
     * so the message has to be read out of it to tell the customer the one useful thing.
     *
     * Matching on the key rather than the HTTP shape because the key is the contract: it is
     * what `common/errors` emits and what every other client of this API already switches on.
     */
    if (detail.includes("errors.unauthenticated")) return { data: null, error: "errors.signInRequired" };
    return { data: null, error: "errors.generic" };
  }
}

/**
 * A server refusal key → a key `checkout-view.tsx` can pass to `t()`.
 *
 * The view does `toast.error(t(res.error ?? "errors.generic"))` with the `checkout`
 * namespace, so an unmapped key would render as a raw dotted path in front of a customer.
 * Mapping here rather than adding a translation per server key keeps the message set small
 * and keeps the decision — "which of these does the customer need to be told precisely?" — in
 * one readable place.
 */
function toCheckoutError(key: string | undefined): string {
  switch (key) {
    case "checkout.errors.signInRequired":
      return "errors.signInRequired";
    case "checkout.errors.cartEmpty":
      return "errors.emptyCart";
    case "checkout.errors.vendorClosed":
      return "errors.vendorClosed";
    case "checkout.errors.belowMinimum":
      return "errors.belowMinimum";
    case "checkout.errors.couponRejected":
      return "errors.couponRejected";
    case "checkout.errors.addressRequired":
      return "errors.selectAddress";
    case "checkout.errors.contactRequired":
      return "errors.nameRequired";
    default:
      return "errors.generic";
  }
}

/**
 * `OrderWire` → `Order`.
 *
 * Nearly an identity function, because the GraphQL selection set was written from
 * `types/order.ts`. The two fields that are not on the wire — `lifecycle.rider` and
 * `lifecycle.assignment` — are filled with `null`, which is what `createLifecycle` set them
 * to: no rider is assigned at placement, and the delivery unit owns both.
 */
function toOrder(wire: OrderWire): Order {
  return {
    id: wire.id,
    orderNumber: wire.orderNumber,
    vendor: wire.vendor,
    lines: wire.lines,
    fulfillment: wire.fulfillment,
    address: wire.address,
    scheduledFor: wire.scheduledFor,
    contact: wire.contact,
    notes: wire.notes,
    payment: wire.payment,
    pricing: wire.pricing,
    // Not on the wire yet: a real API returns the rate it applied, and this
    // resolves it locally until the schema carries it.
    commissionRate: resolveCommissionRate(wire.vendor.id),
    status: wire.status,
    placedAt: wire.placedAt,
    estimatedDeliveryAt: wire.estimatedDeliveryAt,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    deletedAt: wire.deletedAt,
    lifecycle: {
      events: wire.lifecycle.events,
      prepMinutes: wire.lifecycle.prepMinutes,
      promisedReadyAt: wire.lifecycle.promisedReadyAt,
      delayMinutes: wire.lifecycle.delayMinutes,
      rejectionReason: wire.lifecycle.rejectionReason as Order["lifecycle"]["rejectionReason"],
      cancelReason: wire.lifecycle.cancelReason as Order["lifecycle"]["cancelReason"],
      cancelledBy: wire.lifecycle.cancelledBy as Order["lifecycle"]["cancelledBy"],
      failureReason: wire.lifecycle.failureReason as Order["lifecycle"]["failureReason"],
      rider: null,
      assignment: null,
      assignedAt: wire.lifecycle.assignedAt,
      rejectedRiderIds: wire.lifecycle.rejectedRiderIds,
      otp: wire.lifecycle.otp,
      otpAttempts: wire.lifecycle.otpAttempts,
      otpVerifiedAt: wire.lifecycle.otpVerifiedAt,
      refund: wire.lifecycle.refund as Order["lifecycle"]["refund"],
      refundAmount: wire.lifecycle.refundAmount,
      rating: wire.lifecycle.rating,
      // Also not on the wire: the commission record is stamped by the transition
      // that completes the order, and a freshly placed one has none.
      financials: null,
    },
  };
}

/**
 * Simulate an online payment authorisation (spec: "Online Payment (Mock)").
 *
 * Always succeeds for the demo card, and fails for one reserved number, so the
 * failure path is reachable on purpose rather than at random — a payment that
 * fails one time in twenty makes for an unreliable demonstration.
 */
export async function authorisePayment(input: {
  method: PaymentMethod;
  cardNumber?: string;
}): Promise<Result<{ authCode: string }>> {
  await mockDelay(null, PAYMENT_PROCESSING_MS);
  const digits = (input.cardNumber ?? "").replace(/\D/g, "");
  if (digits && digits.endsWith("0000")) {
    return { data: null, error: "errors.paymentDeclined" };
  }
  return ok({ authCode: `AUTH-${Date.now().toString(36).toUpperCase().slice(-6)}` });
}

/**
 * Cancel an order. Simulated: a real endpoint would enforce the cancellation
 * window server-side; here the machine gates it (`canCustomerCancel`), so this
 * models the round-trip and hands the reason back for the event log.
 */
export async function cancelOrder(
  id: string,
  reason: OrderCancelReason,
): Promise<Result<{ id: string; reason: OrderCancelReason }>> {
  await mockDelay(null, 600);
  if (!id) return { data: null, error: "errors.generic" };
  return ok({ id, reason });
}

/**
 * Verify a handoff code against the order's own OTP (spec §7).
 *
 * The check lives in the seam, not in the dialog, so a wrong code fails even
 * though the button was tappable — which is the entire point of a verification
 * step. Phase E moves this to the server unchanged.
 */
export async function verifyOtp(
  order: Order,
  entered: string,
): Promise<Result<{ id: string }>> {
  await mockDelay(null, 500);
  const cleaned = entered.replace(/\D/g, "");
  if (cleaned !== order.lifecycle.otp) {
    return { data: null, error: "errors.otpMismatch" };
  }
  return ok({ id: order.id });
}
