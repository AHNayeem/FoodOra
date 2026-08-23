import type {
  Order,
  OrderCommission,
  OrderFinancials,
  OrderRiderEarning,
  PayoutMethod,
  PlatformFinancials,
  RiderPayout,
  RiderSettlement,
  SettlementAdjustment,
  SettlementPayout,
  SettlementStatus,
  SettlementTotals,
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
 *  - **`buildVendorSettlements` / `buildRiderSettlements` / `platformFinancials`
 *    derive.** They aggregate those stored records on demand. Nothing is stored
 *    that can be derived, so a settlement can never drift from the orders it is
 *    made of. Phase 8 added the rider half and the payout records that mark a
 *    period paid; both sides of a week are now built by the same rules from the
 *    same orders.
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
// Rider settlements — the other half of the same week
// ---------------------------------------------------------------------------

/** Deterministic rider settlement id, so a recomputed period keeps its identity. */
export function riderSettlementId(riderId: string, periodRef: string): string {
  return `rst_${riderId}_${periodRef}`;
}

export interface RiderSettlementInputs {
  now?: number;
  payouts?: RiderPayout[];
}

/**
 * Group completed orders into one settlement per rider per week (Phase 8, G17).
 *
 * The vendor's twin, and deliberately written to the same rules: bucketed by the
 * `settlementRef` **stored on the order** so a period cannot silently move, keyed
 * deterministically so a recomputation is the same row, and `paid` only because a
 * payout record says so.
 *
 * The one real difference is what it aggregates. A vendor line adds up commission
 * records; a rider line adds up the `OrderRiderEarning` the same order carries —
 * which is the record Phase 3 filled from `computePayout`, the same formula the
 * rider's own wallet reads. So the payout run cannot pay a courier a different
 * number from the one their app has been showing them all week.
 *
 * Orders with no rider earning contribute nothing: a pickup order has no courier,
 * and a synthesised dashboard order has no trip behind it. Those are absences, not
 * zeroes, and counting them would invent trips.
 */
export function buildRiderSettlements(
  orders: Order[],
  { now = Date.now(), payouts = [] }: RiderSettlementInputs = {},
): RiderSettlement[] {
  const currentRef = weekRef(new Date(now));
  const buckets = new Map<
    string,
    { riderId: string; riderName: string; periodRef: string; orders: Order[] }
  >();

  for (const order of settledOrders(orders)) {
    const financials = order.lifecycle.financials!;
    const earning = financials.riderEarning;
    if (!earning) continue;
    const key = `${earning.riderId}|${financials.settlementRef}`;
    const bucket = buckets.get(key) ?? {
      riderId: earning.riderId,
      riderName: earning.riderName,
      periodRef: financials.settlementRef,
      orders: [],
    };
    bucket.orders.push(order);
    buckets.set(key, bucket);
  }

  const settlements = [...buckets.values()].map((bucket) => {
    const first = bucket.orders[0]!.lifecycle.financials!.riderEarning!;
    const currency = first.currency;
    const round = (n: number) => roundMoney(n, currency);
    const start = weekRefStart(bucket.periodRef) ?? new Date(now);

    const totals = bucket.orders.reduce(
      (sum, order) => {
        const e = order.lifecycle.financials!.riderEarning!;
        return {
          base: sum.base + e.payout.baseFare,
          distance: sum.distance + e.payout.distanceFee,
          peak: sum.peak + e.payout.peakBonus,
          batch: sum.batch + e.payout.batchBonus,
          tips: sum.tips + e.payout.tip,
          earned: sum.earned + e.payout.total,
          cash: sum.cash + e.cashCollected,
        };
      },
      { base: 0, distance: 0, peak: 0, batch: 0, tips: 0, earned: 0, cash: 0 },
    );

    const payout =
      payouts.find(
        (p) => p.riderId === bucket.riderId && p.periodRef === bucket.periodRef,
      ) ?? null;

    const status: SettlementStatus = payout
      ? "paid"
      : bucket.periodRef === currentRef
        ? "open"
        : "pending";

    return {
      id: riderSettlementId(bucket.riderId, bucket.periodRef),
      riderId: bucket.riderId,
      riderName: bucket.riderName,
      currency,
      periodRef: bucket.periodRef,
      periodStart: startOfWeek(start).toISOString(),
      periodEnd: endOfWeek(start).toISOString(),
      orderIds: bucket.orders.map((o) => o.id),
      tripCount: bucket.orders.length,
      baseFare: round(totals.base),
      distanceFee: round(totals.distance),
      peakBonus: round(totals.peak),
      batchBonus: round(totals.batch),
      tips: round(totals.tips),
      earnedAmount: round(totals.earned),
      cashCollected: round(totals.cash),
      netPayable: round(totals.earned - totals.cash),
      status,
      paidAt: payout?.paidAt ?? null,
      payoutRef: payout?.payoutRef ?? null,
    } satisfies RiderSettlement;
  });

  return settlements.sort((a, b) => b.periodRef.localeCompare(a.periodRef));
}

/** The settlements owed to one rider, newest period first. */
export function settlementsForRider(
  settlements: RiderSettlement[],
  riderId: string,
): RiderSettlement[] {
  return settlements.filter((s) => s.riderId === riderId);
}

// ---------------------------------------------------------------------------
// Totals over a list of settlements
// ---------------------------------------------------------------------------

/**
 * The bottom line under a list of settlements, whichever side they pay.
 *
 * Takes the rows the caller is showing, so a filtered payout list totals what is
 * filtered. The three buckets are the same distinction `vendorBalance` draws and
 * for the same reason: money still accruing, money payable today, and money
 * already gone are three different answers to "what do we owe", and a payout desk
 * needs the middle one.
 */
export function settlementTotals(
  settlements: ReadonlyArray<Pick<VendorSettlement, "currency" | "status" | "netPayable">>,
  currency = settlements[0]?.currency ?? "BDT",
): SettlementTotals {
  const round = (n: number) => roundMoney(n, currency);
  const totals = { pending: 0, available: 0, paid: 0, netPayable: 0 };

  for (const s of settlements) {
    if (s.status === "open") totals.pending += s.netPayable;
    else if (s.status === "paid") totals.paid += s.netPayable;
    else totals.available += s.netPayable;
    totals.netPayable += s.netPayable;
  }

  return {
    currency,
    count: settlements.length,
    pending: round(totals.pending),
    available: round(totals.available),
    paid: round(totals.paid),
    netPayable: round(totals.netPayable),
  };
}

/**
 * Is this settlement payable right now?
 *
 * One question, one answer, asked by the payout screen to decide whether to offer
 * the button and by `stores/payouts` to decide whether to accept the run — so the
 * two cannot disagree. An open period is not payable (it is still collecting
 * orders), a paid one is done, and a line that nets to nothing or less has nothing
 * to transfer.
 */
export function isPayable(
  settlement: Pick<VendorSettlement, "status" | "netPayable">,
): boolean {
  return settlement.status !== "open" && settlement.status !== "paid" && settlement.netPayable > 0;
}

// ---------------------------------------------------------------------------
// Payout records — the one stored thing Phase 8 adds
// ---------------------------------------------------------------------------

/** What a payout run can refuse to do. Keys, so callers can translate them. */
export type PayoutError =
  | "errors.settlementNotPayable"
  | "errors.settlementAlreadyPaid"
  | "errors.amountRequired"
  /** A correction to a week the money has already left for. */
  | "errors.periodAlreadyPaid";

/**
 * A human-quotable reference, derived from what it is paying and when.
 *
 * Deterministic in both, so the same run producing the same row twice produces the
 * same reference — which is what lets the store's duplicate guard be about the
 * period rather than about the string. A counter would need state that survives a
 * reload; a random suffix would make a reference nobody can reproduce.
 */
function payoutRef(prefix: string, key: string, now: number): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const chunk = (n: number) => (n % 46_656).toString(36).toUpperCase().padStart(3, "0");
  return `${prefix}-${chunk(now)}${chunk(hash)}`;
}

export interface PayoutInput {
  now?: number;
  /** The admin account running it. */
  by: string;
  method?: PayoutMethod;
}

/**
 * The payout record for one vendor settlement.
 *
 * Refuses anything `isPayable` refuses, so the button on the screen and the write
 * in the store are gated by one rule rather than two that could drift — the same
 * arrangement `lib/order-machine` has with `adminActions`. The amount is the
 * settlement's own `netPayable` and is never passed in: a payout run that could be
 * told what to transfer is a payout run that can disagree with the statement it
 * is paying.
 */
export function createVendorPayout(
  settlement: VendorSettlement,
  { now = Date.now(), by, method = "bank-transfer" }: PayoutInput,
): { payout: SettlementPayout | null; error: PayoutError | null } {
  if (settlement.status === "paid") {
    return { payout: null, error: "errors.settlementAlreadyPaid" };
  }
  if (!isPayable(settlement)) {
    return { payout: null, error: "errors.settlementNotPayable" };
  }
  const at = new Date(now).toISOString();
  return {
    payout: {
      id: `pay_${settlement.id}`,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      payoutRef: payoutRef("PAY", settlement.id, now),
      vendorId: settlement.vendorId,
      periodRef: settlement.periodRef,
      amount: settlement.netPayable,
      currency: settlement.currency,
      paidAt: at,
      paidBy: by,
      method,
    },
    error: null,
  };
}

/** The payout record for one rider settlement. Same rules, other payee. */
export function createRiderPayout(
  settlement: RiderSettlement,
  { now = Date.now(), by, method = "mobile-wallet" }: PayoutInput,
): { payout: RiderPayout | null; error: PayoutError | null } {
  if (settlement.status === "paid") {
    return { payout: null, error: "errors.settlementAlreadyPaid" };
  }
  if (!isPayable(settlement)) {
    return { payout: null, error: "errors.settlementNotPayable" };
  }
  const at = new Date(now).toISOString();
  return {
    payout: {
      id: `pay_${settlement.id}`,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      payoutRef: payoutRef("RPY", settlement.id, now),
      riderId: settlement.riderId,
      periodRef: settlement.periodRef,
      amount: settlement.netPayable,
      currency: settlement.currency,
      paidAt: at,
      paidBy: by,
      method,
    },
    error: null,
  };
}

/**
 * A manual correction to a vendor's period.
 *
 * Signed, and deliberately unclamped: a chargeback that takes a week negative is a
 * real outcome, and a correction that silently floors at zero is a correction the
 * finance desk cannot reconcile. `buildVendorSettlements` folds it into
 * `netPayable`, so the adjustment and the settlement can never be out of step.
 */
export function createAdjustment({
  vendorId,
  periodRef,
  label,
  amount,
  reason = null,
  by,
  now = Date.now(),
}: {
  vendorId: string;
  periodRef: string;
  label: string;
  amount: number;
  reason?: string | null;
  by: string;
  now?: number;
}): { adjustment: SettlementAdjustment | null; error: PayoutError | null } {
  if (!Number.isFinite(amount) || amount === 0 || !label.trim()) {
    return { adjustment: null, error: "errors.amountRequired" };
  }
  const at = new Date(now).toISOString();
  return {
    adjustment: {
      id: `adj_${vendorId}_${periodRef}_${now.toString(36)}`,
      vendorId,
      periodRef,
      label: label.trim(),
      amount,
      reason: reason?.trim() || null,
      createdAt: at,
      createdBy: by,
    },
    error: null,
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
