import type { BaseEntity, ISODate } from "./common";
import type { DeliveryPayout } from "./delivery";

/**
 * finance.ts — the money half of the order lifecycle.
 *
 * The prototype could take an order all the way to `delivered` and then had
 * nothing to say about who owed whom what. `lib/mock/pages.ts` markets
 * "commission is published, payouts land weekly" and nothing implemented it.
 * These are the shapes that close that gap.
 *
 * Two different kinds of record live here, and the difference matters:
 *
 *  - **`OrderCommission` / `OrderRiderEarning` / `OrderFinancials` are stored.**
 *    They are stamped onto the order by the `completed` transition and never
 *    recomputed, because the rate that applied is the rate that applied — a
 *    vendor renegotiating tomorrow must not silently restate last week's books.
 *  - **`VendorSettlement` / `PlatformFinancials` are derived.** A settlement is
 *    an aggregate over the completed orders in a period, computed on demand by
 *    `lib/settlement.ts`. Deriving them is what makes the restaurant's earnings
 *    page, the admin's payout run and the platform's analytics agree by
 *    construction rather than by three components doing similar sums.
 *
 * A real backend stores commissions in a `commissions` table and materialises
 * settlements per payout run; the shapes are the same either way, so Phase E
 * swaps `lib/settlement.ts`'s inputs for queries and no consumer changes.
 */

/**
 * What the platform charged on one completed order.
 *
 * Every amount is in `currency` and rounded to its precision, so an itemised
 * statement always adds up to the totals shown beside it.
 *
 * The split follows the money as it actually moves: commission is charged on the
 * food (subtotal less any discount), the vendor keeps the rest of the food
 * money, the delivery fee is the platform's, the tip is the rider's and the tax
 * is the state's. Anything not charged commission is still recorded here so a
 * statement never has to reach back into `order.pricing` and re-derive it.
 */
export interface OrderCommission {
  currency: string;
  /**
   * Commission rate applied, 0–1. Snapshotted at completion rather than read
   * live from the vendor, because rates are renegotiated and history is not.
   */
  rate: number;
  /** What the customer paid, in full — the order's gross value. */
  grossAmount: number;
  /** The part commission is charged on: subtotal less discount. */
  commissionableAmount: number;
  /** The platform's cut of `commissionableAmount`. */
  commissionAmount: number;
  /** What the vendor is owed for the food: commissionable less commission. */
  vendorNetAmount: number;
  /** Total platform take on the order: commission plus the delivery fee. */
  platformAmount: number;
  /** Delivery fee charged to the customer — the platform's, not the vendor's. */
  deliveryFee: number;
  /** Consumption tax collected; remitted, never anybody's earnings. */
  tax: number;
  /** Courier tip collected; passes through to the rider. */
  tip: number;
}

/**
 * What one completed order paid its rider.
 *
 * `payout` is a `DeliveryPayout` — the *same* shape and the same formula
 * (`lib/delivery.computePayout`) the rider app has always used for synthesised
 * trips, so a real order and a synthesised one earn by one set of rules rather
 * than two. `cashCollected` is deliberately separate: money taken at the door is
 * a liability the rider owes the platform, never part of what they earned.
 */
export interface OrderRiderEarning {
  riderId: string;
  riderName: string;
  currency: string;
  payout: DeliveryPayout;
  /** Cash taken at the doorstep on a cash order; 0 for prepaid orders. */
  cashCollected: number;
}

/**
 * The financial consequence of completing an order, stamped once.
 *
 * Presence of this record *is* the idempotency guard: the machine refuses a
 * second `completed` transition, and even a replayed patch finds this field
 * already filled and leaves it alone. So a commission, a settlement line and a
 * rider earning can each exist at most once per order.
 */
export interface OrderFinancials {
  /** When completion stamped this record. */
  settledAt: ISODate;
  /** Weekly settlement period the vendor will be paid in, e.g. `2026-W34`. */
  settlementRef: string;
  commission: OrderCommission;
  /**
   * The rider's side of the same order. Null for pickup orders, and null on a
   * delivery order until the rider job model is unified (G04) — the trip
   * geometry a payout needs is not on the order yet.
   */
  riderEarning: OrderRiderEarning | null;
}

/** Where a vendor settlement has got to. */
export type SettlementStatus =
  /** The period is still running — orders are still landing in it. */
  | "open"
  /** The period has closed and the money is owed. */
  | "pending"
  /** A payout run has picked it up. */
  | "processing"
  /** Paid out. */
  | "paid";

/**
 * A manual correction to a settlement — a goodwill credit, a chargeback, a
 * damaged-order deduction. Signed: negative reduces what the vendor is paid.
 */
export interface SettlementAdjustment {
  id: string;
  vendorId: string;
  /** The period it applies to, e.g. `2026-W34`. */
  periodRef: string;
  label: string;
  /** Signed amount in the settlement currency. */
  amount: number;
  reason: string | null;
  createdAt: ISODate;
  createdBy: string;
}

/**
 * A payout run's record of paying one settlement. Stored (a payout is an event,
 * not a derivation); the settlement's `status`/`paidAt` are projected from it.
 */
export interface SettlementPayout extends BaseEntity {
  /** Human-facing reference, e.g. `PAY-8F3A21`. */
  payoutRef: string;
  vendorId: string;
  periodRef: string;
  amount: number;
  currency: string;
  paidAt: ISODate;
  /** The admin account that ran it. */
  paidBy: string;
  method: "bank-transfer" | "mobile-wallet";
}

/**
 * One vendor's money for one weekly period — derived, never stored.
 *
 * `orderIds` is carried so a statement can link back to the orders that made
 * the number, which is the difference between a report and a claim.
 */
export interface VendorSettlement {
  /** Deterministic: `stl_<vendorId>_<periodRef>`. Stable across recomputation. */
  id: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  /** e.g. `2026-W34`. */
  periodRef: string;
  /** Local Monday 00:00 of the period. */
  periodStart: ISODate;
  /** Local Sunday 23:59:59.999 of the period. */
  periodEnd: ISODate;
  orderIds: string[];
  orderCount: number;
  /** Sum of order gross values. */
  grossAmount: number;
  /** Sum of the parts commission was charged on. */
  commissionableAmount: number;
  commissionAmount: number;
  adjustments: SettlementAdjustment[];
  /** Signed sum of `adjustments`. */
  adjustmentTotal: number;
  /** What the vendor is actually paid: vendor net plus adjustments. */
  netPayable: number;
  status: SettlementStatus;
  paidAt: ISODate | null;
  payoutRef: string | null;
}

/**
 * Platform-wide totals over a window — the numbers the admin's financial views
 * and analytics both read, so they cannot disagree.
 */
export interface PlatformFinancials {
  currency: string;
  /** Completed orders in the window. */
  orderCount: number;
  /** Gross merchandise value: what customers paid on completed orders. */
  gmv: number;
  commissionableAmount: number;
  commissionAmount: number;
  vendorNetAmount: number;
  deliveryFees: number;
  tips: number;
  tax: number;
  /** Total platform take: commission plus delivery fees. */
  platformAmount: number;
  /** Money returned on refunded orders in the same window. */
  refundedAmount: number;
  refundedCount: number;
}
