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
import { savedAddresses } from "@/lib/mock";
import { createLifecycle } from "@/lib/order-lifecycle";
import { mockDelay, ok, type Result } from "./http";

/**
 * orders.ts — simulated ordering. Per the prototype rule there is no backend:
 * `placeOrder` fabricates the immutable order record a real endpoint would
 * return (order number, timestamps, ETA, payment result) and hands it back
 * through the same `Promise<Result<Order>>` a live API will use. The client
 * then caches it in the orders store; swapping in the Phase E backend touches
 * only this file.
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
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<Result<Order>> {
  await mockDelay(null, 900);

  if (input.lines.length === 0) {
    return { data: null, error: "errors.emptyCart" };
  }

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
