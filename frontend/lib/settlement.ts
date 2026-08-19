import type {
  Order,
  OrderCommission,
  OrderFinancials,
  OrderRiderEarning,
  PlatformFinancials,
  SettlementAdjustment,
  SettlementPayout,
  SettlementStatus,
  Vendor,
  VendorSettlement,
  VendorType,
} from "@/types";
import { roundMoney } from "./checkout";
import { endOfWeek, startOfWeek, weekRef, weekRefStart } from "./dates";

/**
 * settlement.ts — the one place the platform's money is worked out.
 *
 * The prototype could deliver food and then had nothing to say about who owed
 * whom what: `completed` set no commission, no vendor was ever owed anything and
 * the marketing copy's "commission is published, payouts land weekly" was
 * unimplemented (G01, G02).
 *
 * Everything financial now goes through here, for the same reason every
 * lifecycle move goes through `order-machine.ts`: four surfaces ask money
 * questions — the restaurant's earnings, the admin's payout run, the rider's
 * wallet, platform analytics — and four surfaces doing their own sums is exactly
 * how a dashboard ends up disagreeing with an invoice.
 *
 * Two halves, deliberately different:
 *
 *  - **`commissionFor` / `settleOrder` produce stored records.** They are called
 *    once per order, by the `completed` transition, and their output is stamped
 *    onto `order.lifecycle.financials` and never recomputed. The rate is
 *    snapshotted with them: a renegotiation changes future orders, not history.
 *  - **`buildVendorSettlements` / `platformFinancials` derive.** They aggregate
 *    those stored records on demand. Nothing is stored that can be derived, so a
 *    settlement can never drift from the orders it is made of.
 *
 * Pure and side-effect free, like the rest of `lib/`: no clock, no storage, no
 * mock imports. Callers pass `now` and the data (`services/finance` injects the
 * orders and the vendor list, exactly as `stores/orders` injects `riders` into
 * `dispatchRider`). Phase E replaces those inputs with queries and every
 * function below stays as it is.
 */

// ---------------------------------------------------------------------------
// Commission rates
// ---------------------------------------------------------------------------

/**
 * Standard commission by vendor type, 0–1.
 *
 * Rates differ by type because the platform's cost of serving them differs: a
 * cloud kitchen exists only through the platform and pays the most, a home chef
 * on a handful of orders a week pays the least. Data rather than a single
 * constant so the difference is inspectable, and so onboarding (Phase 6) has
 * something to quote a new vendor.
 */
export const PLATFORM_COMMISSION_RATES: Record<VendorType, number> = {
  restaurant: 0.15,
  cafe: 0.15,
  "cloud-kitchen": 0.2,
  "home-chef": 0.12,
  catering: 0.1,
};

/** Fallback for a vendor whose type is somehow unknown. */
export const DEFAULT_COMMISSION_RATE = 0.15;

/**
 * The rate that applies to a vendor: their negotiated rate if they have one,
 * otherwise the standard rate for their type.
 *
 * Always resolve through here rather than reading `vendor.commissionRate`, which
 * is null for most vendors — a caller that reads the field directly gets `null`
 * and invents its own default, which is the drift this module exists to prevent.
 */
export function commissionRateFor(
  vendor: Pick<Vendor, "type" | "commissionRate">,
): number {
  return (
    vendor.commissionRate ??
    PLATFORM_COMMISSION_RATES[vendor.type] ??
    DEFAULT_COMMISSION_RATE
  );
}

// ---------------------------------------------------------------------------
// Per-order commission
// ---------------------------------------------------------------------------

/**
 * What the platform charged on one order.
 *
 * Commission is charged on the food only — the subtotal less any discount — and
 * not on the delivery fee (the platform's own), the tip (the rider's) or the tax
 * (the state's). Charging commission on a delivery fee the vendor never received
 * would be the kind of number a vendor notices.
 *
 * A discount reduces the commissionable base, which is the honest reading of a
 * platform-funded promotion: both sides give something up.
 */
export function commissionFor(order: Order, rate = order.commissionRate): OrderCommission {
  const { currency, subtotal, discount, deliveryFee, tax, tip, total } = order.pricing;
  const round = (n: number) => roundMoney(n, currency);

  const commissionableAmount = round(Math.max(0, subtotal - discount));
  const commissionAmount = round(commissionableAmount * rate);

  return {
    currency,
    rate,
    grossAmount: round(total),
    commissionableAmount,
    commissionAmount,
    vendorNetAmount: round(commissionableAmount - commissionAmount),
    platformAmount: round(commissionAmount + deliveryFee),
    deliveryFee: round(deliveryFee),
    tax: round(tax),
    tip: round(tip),
  };
}

/**
 * The financial record a completed order carries.
 *
 * Called by the `completed` transition and nowhere else — completion is the
 * moment the money becomes real, and putting the stamp inside the machine is
 * what stops a surface having to remember to do it. Deterministic: the same
 * order and the same instant always produce the same record.
 *
 * `riderEarning` is passed in rather than computed here because the payout needs
 * trip geometry (route distance, zone, peak hour) that lives with the delivery
 * unit, not on the order. Until the rider job model is unified (G04) it is null
 * on every order, and the rider's money still comes from their own trip records.
 */
export function settleOrder(
  order: Order,
  {
    now = Date.now(),
    rate = order.commissionRate,
    riderEarning = null,
  }: { now?: number; rate?: number; riderEarning?: OrderRiderEarning | null } = {},
): OrderFinancials {
  const at = new Date(now);
  return {
    settledAt: at.toISOString(),
    settlementRef: weekRef(at),
    commission: commissionFor(order, rate),
    riderEarning,
  };
}

/** Has this order's money already been worked out? The idempotency question. */
export function isSettled(order: Order): boolean {
  return order.lifecycle.financials != null;
}

/** Completed orders carrying a financial record, i.e. everything settleable. */
export function settledOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.status === "completed" && o.lifecycle.financials != null);
}

// ---------------------------------------------------------------------------
// Vendor settlements — derived aggregates
// ---------------------------------------------------------------------------

/** Deterministic settlement id, so a recomputed settlement keeps its identity. */
export function settlementId(vendorId: string, periodRef: string): string {
  return `stl_${vendorId}_${periodRef}`;
}

export interface SettlementInputs {
  /** "Now" — decides which period is still open. */
  now?: number;
  /** Manual corrections, matched on `vendorId` + `periodRef`. */
  adjustments?: SettlementAdjustment[];
  /** Payout runs, which is what makes a settlement `paid`. */
  payouts?: SettlementPayout[];
}

/**
 * Group completed orders into one settlement per vendor per week.
 *
 * Orders are bucketed by the `settlementRef` **stored on the order**, not by
 * recomputing the week from a timestamp: the reference was fixed when the order
 * completed, and re-deriving it would silently move an order between periods if
 * the bucketing rule ever changed.
 *
 * Newest period first, so a statement page reads top-down without sorting again.
 */
export function buildVendorSettlements(
  orders: Order[],
  { now = Date.now(), adjustments = [], payouts = [] }: SettlementInputs = {},
): VendorSettlement[] {
  const currentRef = weekRef(new Date(now));
  const buckets = new Map<string, { vendorId: string; vendorName: string; periodRef: string; orders: Order[] }>();

  for (const order of settledOrders(orders)) {
    const periodRef = order.lifecycle.financials!.settlementRef;
    const key = `${order.vendor.id}|${periodRef}`;
    const bucket = buckets.get(key) ?? {
      vendorId: order.vendor.id,
      vendorName: order.vendor.name,
      periodRef,
      orders: [],
    };
    bucket.orders.push(order);
    buckets.set(key, bucket);
  }

  const settlements = [...buckets.values()].map((bucket) => {
    const currency = bucket.orders[0]!.pricing.currency;
    const round = (n: number) => roundMoney(n, currency);
    const start = weekRefStart(bucket.periodRef) ?? new Date(now);

    const totals = bucket.orders.reduce(
      (sum, order) => {
        const c = order.lifecycle.financials!.commission;
        return {
          gross: sum.gross + c.grossAmount,
          commissionable: sum.commissionable + c.commissionableAmount,
          commission: sum.commission + c.commissionAmount,
          net: sum.net + c.vendorNetAmount,
        };
      },
      { gross: 0, commissionable: 0, commission: 0, net: 0 },
    );

    const mine = adjustments.filter(
      (a) => a.vendorId === bucket.vendorId && a.periodRef === bucket.periodRef,
    );
    const adjustmentTotal = round(mine.reduce((sum, a) => sum + a.amount, 0));
    const payout =
      payouts.find(
        (p) => p.vendorId === bucket.vendorId && p.periodRef === bucket.periodRef,
      ) ?? null;

    const status: SettlementStatus = payout
      ? "paid"
      : bucket.periodRef === currentRef
        ? "open"
        : "pending";

    return {
      id: settlementId(bucket.vendorId, bucket.periodRef),
      vendorId: bucket.vendorId,
      vendorName: bucket.vendorName,
      currency,
      periodRef: bucket.periodRef,
      periodStart: startOfWeek(start).toISOString(),
      periodEnd: endOfWeek(start).toISOString(),
      orderIds: bucket.orders.map((o) => o.id),
      orderCount: bucket.orders.length,
      grossAmount: round(totals.gross),
      commissionableAmount: round(totals.commissionable),
      commissionAmount: round(totals.commission),
      adjustments: mine,
      adjustmentTotal,
      netPayable: round(totals.net + adjustmentTotal),
      status,
      paidAt: payout?.paidAt ?? null,
      payoutRef: payout?.payoutRef ?? null,
    } satisfies VendorSettlement;
  });

  return settlements.sort((a, b) => b.periodRef.localeCompare(a.periodRef));
}

/** The settlements owed to one vendor, newest period first. */
export function settlementsForVendor(
  settlements: VendorSettlement[],
  vendorId: string,
): VendorSettlement[] {
  return settlements.filter((s) => s.vendorId === vendorId);
}

/**
 * A vendor's two balances, which must never be confused — the same distinction
 * the rider wallet already draws:
 *
 *  - `pending` is money from the period still running. It exists but is not yet
 *    payable, because the period it belongs to has not closed.
 *  - `available` is money from closed, unpaid periods. That is what a payout run
 *    would pay today.
 */
export interface VendorBalance {
  currency: string;
  pending: number;
  available: number;
  paid: number;
  /** Lifetime gross, commission and net across every settled period. */
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  orderCount: number;
}

export function vendorBalance(
  settlements: VendorSettlement[],
  currency: string,
): VendorBalance {
  const round = (n: number) => roundMoney(n, currency);
  const balance: VendorBalance = {
    currency,
    pending: 0,
    available: 0,
    paid: 0,
    grossAmount: 0,
    commissionAmount: 0,
    netAmount: 0,
    orderCount: 0,
  };

  for (const s of settlements) {
    if (s.status === "open") balance.pending += s.netPayable;
    else if (s.status === "paid") balance.paid += s.netPayable;
    else balance.available += s.netPayable;
    balance.grossAmount += s.grossAmount;
    balance.commissionAmount += s.commissionAmount;
    balance.netAmount += s.netPayable;
    balance.orderCount += s.orderCount;
  }

  return {
    ...balance,
    pending: round(balance.pending),
    available: round(balance.available),
    paid: round(balance.paid),
    grossAmount: round(balance.grossAmount),
    commissionAmount: round(balance.commissionAmount),
    netAmount: round(balance.netAmount),
  };
}

// ---------------------------------------------------------------------------
// Platform totals
// ---------------------------------------------------------------------------

/**
 * Platform-wide money over a window, from the stored per-order records.
 *
 * `from`/`to` filter on the moment the order *completed*, not when it was
 * placed: revenue is recognised when the order closes, which is also the only
 * date the financial record has.
 *
 * Refunds are counted separately rather than netted off, because "we took
 * ৳100,000 and gave ৳4,000 back" and "we took ৳96,000" are different facts and
 * an operations desk needs the first one.
 */
export function platformFinancials(
  orders: Order[],
  { from, to, currency = "BDT" }: { from?: number; to?: number; currency?: string } = {},
): PlatformFinancials {
  const round = (n: number) => roundMoney(n, currency);
  const within = (iso: string) => {
    const at = Date.parse(iso);
    if (from != null && at < from) return false;
    if (to != null && at > to) return false;
    return true;
  };

  const totals: PlatformFinancials = {
    currency,
    orderCount: 0,
    gmv: 0,
    commissionableAmount: 0,
    commissionAmount: 0,
    vendorNetAmount: 0,
    deliveryFees: 0,
    tips: 0,
    tax: 0,
    platformAmount: 0,
    refundedAmount: 0,
    refundedCount: 0,
  };

  for (const order of orders) {
    const financials = order.lifecycle.financials;
    if (financials && order.status === "completed" && within(financials.settledAt)) {
      const c = financials.commission;
      totals.orderCount += 1;
      totals.gmv += c.grossAmount;
      totals.commissionableAmount += c.commissionableAmount;
      totals.commissionAmount += c.commissionAmount;
      totals.vendorNetAmount += c.vendorNetAmount;
      totals.deliveryFees += c.deliveryFee;
      totals.tips += c.tip;
      totals.tax += c.tax;
      totals.platformAmount += c.platformAmount;
    }
    // Refunds are dated by the order's last update — the refund is the last
    // thing that happened to a refunded order.
    if (order.lifecycle.refundAmount > 0 && within(order.updatedAt)) {
      // Money *out*, not money agreed to. Phase 5 split those two facts apart:
      // `approved` is a decision the provider has not acted on yet, so counting it
      // here would report a refund the customer has not received.
      const settled =
        order.payment.status === "refunded" || order.lifecycle.refund === "refunded";
      if (settled) {
        totals.refundedAmount += order.lifecycle.refundAmount;
        totals.refundedCount += 1;
      }
    }
  }

  return {
    ...totals,
    gmv: round(totals.gmv),
    commissionableAmount: round(totals.commissionableAmount),
    commissionAmount: round(totals.commissionAmount),
    vendorNetAmount: round(totals.vendorNetAmount),
    deliveryFees: round(totals.deliveryFees),
    tips: round(totals.tips),
    tax: round(totals.tax),
    platformAmount: round(totals.platformAmount),
    refundedAmount: round(totals.refundedAmount),
  };
}
