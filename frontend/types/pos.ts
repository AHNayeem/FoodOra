import type { BaseEntity, ISODate } from "./common";
import type { PaymentMethod } from "./order";

/**
 * pos.ts — POS Lite domain shapes (Phase C11).
 *
 * The in-store point of sale: a cashier builds a *ticket* (quick-service, so no
 * option-group customiser), optionally holds it, then charges it — producing an
 * immutable `PosSale` (the counter equivalent of an `Order`). Held tickets and
 * completed sales live in a persisted store (the prototype's register drawer);
 * the shapes still mirror the eventual Prisma `Sale` / `SaleItem` models.
 */

/** Where a POS order is served. */
export type PosOrderType = "dine-in" | "takeaway" | "delivery";

/** A single line on a POS ticket — one product; quantity accumulates. */
export interface PosTicketLine {
  /** Equals the food id (one line per product on a quick ticket). */
  id: string;
  foodId: string;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
}

/** A manual counter discount applied to the whole ticket. */
export interface PosDiscount {
  type: "percent" | "amount";
  /** Percent (0–100) for `percent`, else an absolute amount in currency. */
  value: number;
}

/** Itemised money breakdown for a sale (mirrors the taxable subset of OrderPricing). */
export interface PosPricing {
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  total: number;
}

/** Tender captured at charge time — all simulated (no real gateway). */
export interface PosPayment {
  method: PaymentMethod;
  /** Cash handed over (cash only), else null. */
  tendered: number | null;
  /** Change returned (cash only), else null. */
  change: number | null;
  /** Last 4 of the card (card only), else null. */
  cardLast4: string | null;
}

/** A parked ticket the cashier can recall later. Persisted per device. */
export interface PosHeldTicket {
  id: string;
  /** Human label for the recall list, e.g. "T4 · 15:42". */
  label: string;
  orderType: PosOrderType;
  tableId: string | null;
  lines: PosTicketLine[];
  discount: PosDiscount | null;
  note: string | null;
  heldAt: ISODate;
}

/** A completed, immutable sale record — the POS equivalent of an Order. */
export interface PosSale extends BaseEntity {
  /** Human-facing reference, e.g. "POS-8F3A21". */
  saleNumber: string;
  vendorId: string;
  orderType: PosOrderType;
  /** Snapshot of the table label for dine-in, else null. */
  tableLabel: string | null;
  lines: PosTicketLine[];
  pricing: PosPricing;
  payment: PosPayment;
  cashierName: string;
  soldAt: ISODate;
}
