import type { BaseEntity, ISODate, RiderVehicle } from "./common";
import type { CartLine, CartVendor } from "./cart";

/**
 * order.ts — the checkout output and its supporting shapes.
 *
 * An `Order` is the immutable record produced at checkout (Phase C8) and read
 * back by order confirmation, order history (C3) and live tracking (C9). Like
 * every other entity it extends `BaseEntity` and snapshots the vendor/lines it
 * was placed against, so the mock maps 1:1 onto the eventual Prisma `Order` /
 * `OrderItem` models and stays correct even if the catalog later changes.
 */

/** Lifecycle a delivery order moves through (drives C9 tracking). */
export type OrderStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "picked-up"
  | "on-the-way"
  | "delivered"
  | "cancelled";

/** How the order is handed to the customer. */
export type FulfillmentType = "delivery" | "pickup";

/** Payment tender — all simulated in the prototype (no real gateway). */
export type PaymentMethod = "cash" | "card" | "wallet";

export type PaymentStatus = "pending" | "paid" | "failed";

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
  /** Promo/voucher reduction applied to the subtotal. */
  discount: number;
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
  status: OrderStatus;
  placedAt: ISODate;
  /** Estimated hand-off time, used by confirmation + tracking. */
  estimatedDeliveryAt: ISODate;
}
