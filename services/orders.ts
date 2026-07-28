import type {
  CartLine,
  CartVendor,
  Courier,
  DeliveryAddress,
  FulfillmentType,
  Order,
  OrderPricing,
  PaymentMethod,
  SavedAddress,
} from "@/types";
import { couriers, savedAddresses } from "@/lib/mock";
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
 * Place an order. Validates the cart is non-empty, simulates gateway latency,
 * then returns a fully-formed Order. Card/wallet payments resolve as `paid`,
 * cash-on-delivery stays `pending` until hand-off — mirroring real behaviour.
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
  // ASAP orders land in ~40 min; scheduled orders keep their requested time.
  const etaIso = input.scheduledFor ?? new Date(now + 40 * 60_000).toISOString();

  const order: Order = {
    id: `ord_${now.toString(36)}`,
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
  };

  return ok(order);
}

/**
 * Cancel an order. Simulated: a real endpoint would enforce the cancellation
 * window server-side; here the client already gates the action (`canCancel`),
 * so this just models the round-trip and returns the affected id. The client
 * then flips the order's status in the store.
 */
export async function cancelOrder(id: string): Promise<Result<{ id: string }>> {
  await mockDelay(null, 600);
  if (!id) return { data: null, error: "errors.generic" };
  return ok({ id });
}

/** Stable string hash → non-negative int, for deterministic demo selection. */
function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Return the courier assigned to an order (Phase C9). Deterministically picked
 * from the demo pool by order id, so a given order always shows the same rider.
 */
export async function getCourier(orderId: string): Promise<Courier> {
  const courier = couriers[hashCode(orderId) % couriers.length];
  return mockDelay(courier, 300);
}
