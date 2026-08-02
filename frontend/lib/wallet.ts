import type { WalletTransaction, WalletTransactionType } from "@/frontend/types";

/**
 * wallet.ts — the wallet rules, in one place (Phase C19).
 *
 * The wallet stopped being a read-only ledger in C19: it pays for orders and is
 * paid back when they fail. That makes three questions load-bearing — *can this
 * balance cover this basket?*, *what has moved lately?*, *has this order already
 * been settled?* — and all three are asked from more than one surface (the
 * account wallet, the checkout tender, the orders store). They live here so the
 * answers cannot drift apart, exactly as `lib/coupons.ts` does for coupons.
 *
 * Everything below is pure. Money only ever moves in `stores/wallet.ts`, and
 * only by appending a signed transaction — these helpers describe a ledger, they
 * never mutate one.
 */

/** Top-up amounts offered as one-tap buttons. */
export const TOP_UP_PRESETS = [500, 1000, 2000, 5000] as const;

/** Bounds on a simulated top-up — a real gateway has both. */
export const MIN_TOP_UP = 100;
export const MAX_TOP_UP = 50_000;

/** How a top-up is funded. Simulated: no gateway, no stored instrument. */
export type TopUpMethod = "card" | "mobile-banking";
export const TOP_UP_METHODS: readonly TopUpMethod[] = ["card", "mobile-banking"];

/** Below this the wallet nudges the customer to top up before checkout. */
export const LOW_BALANCE_THRESHOLD = 300;

/** Ledger filters the account view offers, in tab order. */
export type WalletFilter = "all" | WalletTransactionType;
export const WALLET_FILTERS: readonly WalletFilter[] = [
  "all",
  "top-up",
  "payment",
  "refund",
  "reward",
];

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

/** Can this balance pay this total outright? The wallet does not part-pay. */
export function coversAmount(balance: number, amount: number): boolean {
  return balance >= amount;
}

/** How much more is needed to cover `amount`; 0 when the balance is enough. */
export function shortfall(balance: number, amount: number): number {
  return Math.max(0, amount - balance);
}

/** Worth nudging about — enough to order today, not enough for much longer. */
export function isLowBalance(balance: number): boolean {
  return balance < LOW_BALANCE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Reading a ledger
// ---------------------------------------------------------------------------

/**
 * Has this order already produced a transaction of this type?
 *
 * The idempotency guard. A refund is credited by the orders store as a side
 * effect of a status change, and a persisted store can replay that change (two
 * tabs, a rehydrate, the demo autopilot) — without this, the same order could
 * pay out twice.
 */
export function isSettled(
  transactions: WalletTransaction[],
  orderNumber: string,
  type: WalletTransactionType,
): boolean {
  return transactions.some((t) => t.orderNumber === orderNumber && t.type === type);
}

export interface WalletSummary {
  /** Credits in the window (top-ups, refunds, rewards). */
  in: number;
  /** Debits in the window, as a positive number. */
  out: number;
}

/** Money in / money out since `sinceIso` — drives the balance card's two stats. */
export function summarise(
  transactions: WalletTransaction[],
  sinceIso: string,
): WalletSummary {
  return transactions.reduce<WalletSummary>(
    (acc, t) => {
      if (t.occurredAt < sinceIso) return acc;
      if (t.amount >= 0) acc.in += t.amount;
      else acc.out += -t.amount;
      return acc;
    },
    { in: 0, out: 0 },
  );
}

/** The ISO instant `days` before `now` — the window `summarise` reads. */
export function windowStart(days: number, now = Date.now()): string {
  return new Date(now - days * 86_400_000).toISOString();
}

export function filterTransactions(
  transactions: WalletTransaction[],
  filter: WalletFilter,
): WalletTransaction[] {
  return filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
}

export interface WalletMonth {
  /** First instant of the month, ISO — the view formats it for the locale. */
  month: string;
  transactions: WalletTransaction[];
}

/**
 * Group a newest-first ledger into newest-first months. A statement reads by
 * month; a flat list of forty rows does not.
 */
export function groupByMonth(transactions: WalletTransaction[]): WalletMonth[] {
  const months: WalletMonth[] = [];
  for (const txn of transactions) {
    const d = new Date(txn.occurredAt);
    const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    const last = months[months.length - 1];
    if (last && last.month === month) last.transactions.push(txn);
    else months.push({ month, transactions: [txn] });
  }
  return months;
}
