import type { CartLine } from "./cart";
import type { BaseEntity } from "./common";
import type { TableZone } from "./table";

/**
 * qr.ts — QR Menu (Phase C12).
 *
 * A guest scans the code on their table, lands on `/m/<vendor>?t=<table>` and
 * gets a table-scoped digital menu: browse, send rounds to the kitchen, call a
 * waiter, ask for the bill. Two kinds of shape live here:
 *
 *  - {@link QrMenuConfig} is a real *entity* (seeded per vendor, maps onto a
 *    future Prisma `QrMenuConfig` row) — what the venue has enabled.
 *  - {@link DineInRound} / {@link ServiceRequest} are *session* records that
 *    live in the guest's persisted store, like the cart. Neither carries a
 *    status field: exactly as with order tracking (C9), progress is derived
 *    from elapsed time in `lib/qr.ts` so the prototype needs no backend.
 */

/** Per-venue QR menu settings — what a scanning guest is allowed to do. */
export interface QrMenuConfig extends BaseEntity {
  vendorId: string;
  /** Greeting on the welcome sheet, in the venue's voice. */
  welcomeMessage: string;
  /** Guests may send orders to the kitchen (false = browse-only menu). */
  ordering: boolean;
  /** Show the "call a waiter" service action. */
  waiterCall: boolean;
  /** Show the "request the bill" service action. */
  billRequest: boolean;
  /** Dine-in service charge as a fraction of subtotal (0 = none). */
  serviceChargeRate: number;
  /** Ask the guest for a name before their first round. */
  askGuestName: boolean;
}

/** Kitchen progress for a sent round — derived from `sentAt`, never stored. */
export type DineInRoundStatus = "sent" | "preparing" | "served";

/**
 * One "send to kitchen" batch. A sitting accumulates rounds (starters, then
 * mains, then dessert) rather than replacing a single cart.
 */
export interface DineInRound {
  id: string;
  /** 1-based position within the sitting, shown as "Round 2". */
  roundNumber: number;
  lines: CartLine[];
  note: string;
  sentAt: string;
}

export type ServiceRequestKind = "waiter" | "water" | "cutlery" | "bill";

export interface ServiceRequest {
  id: string;
  kind: ServiceRequestKind;
  requestedAt: string;
}

/** Price breakdown for a dine-in bill (no delivery fee, plus service charge). */
export interface QrPricing {
  currency: string;
  subtotal: number;
  serviceCharge: number;
  serviceChargeRate: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  total: number;
}

export type QrTargetKind = "storefront" | "table";

/**
 * A printable code in the vendor's QR studio: either the venue-wide storefront
 * code or one table's code. `path` is what the QR encodes (origin is added at
 * render time, so the same seed works on any host).
 */
export interface QrTarget {
  id: string;
  kind: QrTargetKind;
  label: string;
  zone: TableZone | null;
  seats: number | null;
  path: string;
}
