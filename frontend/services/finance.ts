import type {
  Order,
  PlatformFinancials,
  RiderPayout,
  RiderSettlement,
  SettlementAdjustment,
  SettlementPayout,
  SettlementTotals,
  VendorSettlement,
} from "@/types";
import { buildVendorOrders, vendorById, vendors } from "@/lib/mock";
import {
  buildRiderSettlements,
  buildVendorSettlements,
  commissionRateFor,
  platformFinancials,
  settledOrders,
  settlementTotals,
  settlementsForVendor,
  vendorBalance,
  type VendorBalance,
} from "@/lib/settlement";
import { mockDelay } from "./http";

/**
 * finance.ts — the read seam for money (Phase 8, G16/G17).
 *
 * Phase 2 deliberately did not create this module: its two readouts consumed
 * `lib/settlement` directly, and adding a service with no second consumer would
 * have been a read path nobody used. Phase 8 brings the two consumers the seam
 * was waiting for — the restaurant's earnings page and the admin's payout run —
 * and they need exactly the same thing: a *set of orders*, bucketed into weekly
 * settlements, with the payout records that mark a period paid.
 *
 * Which set of orders is the whole question, and it is answered once here rather
 * than by each screen:
 *
 *  - **A restaurant's own money** is its synthesised week (the prototype has no
 *    backend and no real trailing week) merged with everything live on this
 *    device. That is already what the overview's KPI cards and its earnings panel
 *    read, so the earnings page reads the same set through the same function —
 *    `vendorOrderBook` — and the two cannot disagree.
 *  - **The platform's payout run** is every vendor's book, unioned. So a
 *    settlement on the admin's screen is *the same row* the restaurant is looking
 *    at, which is what makes "pay this" mean anything. It costs one synthesis pass
 *    over the catalog per load; that is why these functions are async and
 *    `mockDelay`-shaped like every other service, and why the pass happens here
 *    rather than in a component's render.
 *
 * Nothing in this file does arithmetic. Every number comes from `lib/settlement`,
 * which is also where the vendor dashboard and platform analytics get theirs — the
 * spec's "do not invent separate financial numbers", enforced by there being
 * nowhere else to invent them. Phase E replaces the two order-book resolvers with
 * queries and every function below keeps its signature.
 */

// ---------------------------------------------------------------------------
// Order books
// ---------------------------------------------------------------------------

/**
 * Merge a synthesised order window with the live store, live winning.
 *
 * A live order is the real one: it was placed on this device, it has been through
 * the real machine, and if the synthesiser happens to have produced a record with
 * the same id then the persisted one is the truth. Deduped by id rather than
 * concatenated, because an order counted twice is a settlement that is wrong by
 * exactly one order and looks plausible.
 */
export function mergeOrders(synthesised: Order[], live: Order[]): Order[] {
  const ids = new Set(live.map((o) => o.id));
  return [...live, ...synthesised.filter((o) => !ids.has(o.id))];
}

/** One restaurant's book: its synthesised week plus everything live. */
export function vendorOrderBook(vendorId: string, live: Order[], now: number): Order[] {
  return mergeOrders(
    buildVendorOrders(vendorId, now),
    live.filter((o) => o.vendor.id === vendorId),
  );
}

/**
 * The platform's book: every vendor's, unioned with the live store.
 *
 * The live orders are passed whole rather than per vendor, so an order placed
 * against a listing this device minted (Phase 6) still counts even though the
 * synthesiser has never heard of it.
 */
function platformOrderBook(live: Order[], now: number): Order[] {
  const synthesised = vendors
    .filter((v) => !v.deletedAt)
    .flatMap((v) => buildVendorOrders(v.id, now));
  return mergeOrders(synthesised, live);
}

// ---------------------------------------------------------------------------
// The restaurant's own earnings (G16)
// ---------------------------------------------------------------------------

/**
 * One settlement period with the orders behind it — the spec's "commission
 * statement".
 *
 * The orders are carried rather than just counted because that is the difference
 * between a statement and a claim: a restaurant that disagrees with a number needs
 * to see which orders made it, and `VendorSettlement.orderIds` exists so this join
 * is possible without storing the line items twice.
 */
export interface VendorStatement {
  settlement: VendorSettlement;
  /** The completed orders in the period, newest first. */
  orders: Order[];
}

export interface VendorEarnings {
  vendorId: string;
  currency: string;
  /** The commission rate in force for this vendor today, 0–1. */
  rate: number;
  balance: VendorBalance;
  /** Newest period first — the settlement history. */
  statements: VendorStatement[];
  /** This vendor's payout history, newest first. */
  payouts: SettlementPayout[];
}

/**
 * Everything the restaurant's earnings page renders.
 *
 * `payouts` and `adjustments` are *injected* rather than read from a store, the
 * same seam `getDashboardVendor` uses for admitted listings and `dispatchRider`
 * uses for availability: this module cannot reach a client store, and a resolver
 * that did would be a second answer to "has this been paid".
 */
export async function getVendorEarnings({
  vendorId,
  live,
  payouts = [],
  adjustments = [],
  now = Date.now(),
}: {
  vendorId: string;
  live: Order[];
  payouts?: SettlementPayout[];
  adjustments?: SettlementAdjustment[];
  now?: number;
}): Promise<VendorEarnings | null> {
  const vendor = vendorById.get(vendorId);
  const book = vendorOrderBook(vendorId, live, now);
  // A minted listing has no catalog row and no synthesised week; its currency and
  // rate come off whatever it has actually sold. Falling back to the platform
  // default would quote a rate the vendor was never told.
  const currency = vendor?.currency ?? book[0]?.pricing.currency ?? "BDT";

  const settlements = settlementsForVendor(
    buildVendorSettlements(book, { now, payouts, adjustments }),
    vendorId,
  );
  const completed = settledOrders(book);
  const byId = new Map(completed.map((o) => [o.id, o]));

  return mockDelay(
    {
      vendorId,
      currency,
      rate: vendor ? commissionRateFor(vendor) : (completed[0]?.commissionRate ?? 0),
      balance: vendorBalance(settlements, currency),
      statements: settlements.map((settlement) => ({
        settlement,
        orders: settlement.orderIds
          .map((id) => byId.get(id))
          .filter((o): o is Order => Boolean(o))
          .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)),
      })),
      payouts: payouts
        .filter((p) => p.vendorId === vendorId)
        .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt)),
    },
    350,
  );
}

// ---------------------------------------------------------------------------
// The platform's payout run (G17)
// ---------------------------------------------------------------------------

export interface PlatformPayouts {
  currency: string;
  /** Every vendor settlement, newest period first. */
  vendors: VendorSettlement[];
  /** Every rider settlement, newest period first. */
  riders: RiderSettlement[];
  vendorTotals: SettlementTotals;
  riderTotals: SettlementTotals;
  /** Platform-wide money over the same book, for the header strip. */
  platform: PlatformFinancials;
}

/**
 * Both sides of the payout run.
 *
 * The two lists are built from *one* order book, so the platform's take, what the
 * restaurants are owed and what the couriers are owed are three readings of the
 * same set rather than three queries that might have run at different instants.
 *
 * Rider settlements come out much shorter than vendor ones, and that is honest
 * rather than a bug: a synthesised dashboard order carries a commission record but
 * no `riderEarning`, because no courier ever rode it. Only real deliveries — the
 * seeded working set and anything this device has driven — put a courier on the
 * payout list.
 */
export async function getPlatformPayouts({
  live,
  payouts = [],
  riderPayouts = [],
  adjustments = [],
  now = Date.now(),
}: {
  live: Order[];
  payouts?: SettlementPayout[];
  riderPayouts?: RiderPayout[];
  adjustments?: SettlementAdjustment[];
  now?: number;
}): Promise<PlatformPayouts> {
  const book = platformOrderBook(live, now);
  const currency = book[0]?.pricing.currency ?? "BDT";

  const vendorLines = buildVendorSettlements(book, { now, payouts, adjustments });
  const riderLines = buildRiderSettlements(book, { now, payouts: riderPayouts });

  return mockDelay(
    {
      currency,
      vendors: vendorLines,
      riders: riderLines,
      vendorTotals: settlementTotals(vendorLines, currency),
      riderTotals: settlementTotals(riderLines, currency),
      platform: platformFinancials(book, { currency }),
    },
    450,
  );
}

/**
 * One settlement and the orders behind it — what `/admin/payouts/[id]` renders.
 *
 * The id carries which side it belongs to (`stl_` for a vendor, `rst_` for a
 * rider), because `lib/settlement` mints both deterministically. Reading the kind
 * off the id rather than passing it as a second parameter means a link cannot
 * arrive with the two disagreeing.
 */
export type PayoutStatement =
  | {
      kind: "vendor";
      settlement: VendorSettlement;
      orders: Order[];
      payout: SettlementPayout | null;
    }
  | {
      kind: "rider";
      settlement: RiderSettlement;
      orders: Order[];
      payout: RiderPayout | null;
    };

export async function getPayoutStatement({
  settlementId,
  live,
  payouts = [],
  riderPayouts = [],
  adjustments = [],
  now = Date.now(),
}: {
  settlementId: string;
  live: Order[];
  payouts?: SettlementPayout[];
  riderPayouts?: RiderPayout[];
  adjustments?: SettlementAdjustment[];
  now?: number;
}): Promise<PayoutStatement | null> {
  const kind = settlementId.startsWith("rst_")
    ? "rider"
    : settlementId.startsWith("stl_")
      ? "vendor"
      : null;
  if (!kind) return mockDelay(null, 200);

  const book = platformOrderBook(live, now);
  const byId = new Map(settledOrders(book).map((o) => [o.id, o]));
  const ordersOf = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((o): o is Order => Boolean(o))
      .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));

  if (kind === "rider") {
    const settlement =
      buildRiderSettlements(book, { now, payouts: riderPayouts }).find(
        (s) => s.id === settlementId,
      ) ?? null;
    if (!settlement) return mockDelay(null, 200);
    return mockDelay(
      {
        kind: "rider" as const,
        settlement,
        orders: ordersOf(settlement.orderIds),
        payout:
          riderPayouts.find(
            (p) =>
              p.riderId === settlement.riderId && p.periodRef === settlement.periodRef,
          ) ?? null,
      },
      350,
    );
  }

  const settlement =
    buildVendorSettlements(book, { now, payouts, adjustments }).find(
      (s) => s.id === settlementId,
    ) ?? null;
  if (!settlement) return mockDelay(null, 200);
  return mockDelay(
    {
      kind: "vendor" as const,
      settlement,
      orders: ordersOf(settlement.orderIds),
      payout:
        payouts.find(
          (p) => p.vendorId === settlement.vendorId && p.periodRef === settlement.periodRef,
        ) ?? null,
    },
    350,
  );
}
