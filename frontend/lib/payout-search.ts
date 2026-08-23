import type { RiderSettlement, SettlementStatus, VendorSettlement } from "@/types";

/**
 * payout-search.ts — asking the settlement set a question (Phase 8, G17).
 *
 * The third of these modules, written to the same rules as `lib/order-search` and
 * `lib/onboarding-search`: one pure predicate, no clock (the caller passes `now`),
 * no store, no i18n. The payout screen filters vendor settlements and rider
 * settlements with the same controls — text, period, status — so the filter is
 * written once over the fields both sides share rather than twice with a
 * difference nobody notices until a search stops finding riders.
 *
 * Nothing here computes money. `lib/settlement` builds the rows and totals them;
 * this decides which rows are on screen.
 */

/** The statuses a settlement can be filtered to, in the order the chips read. */
export const SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "open",
  "pending",
  "processing",
  "paid",
];

/**
 * One question about the settlement set.
 *
 * `payableOnly` is separate from `status` for the same reason `awaitingOnly` is
 * separate on the onboarding queue: "show me what I can pay today" is the payout
 * desk's most common ask, and it must survive changing the status filter. It is
 * not the same as `status: "pending"` either — a line that nets to zero is pending
 * and not payable.
 */
export interface PayoutQuery {
  /** Free text over the payee, the period and the payout reference. */
  text: string;
  status: SettlementStatus | null;
  /** A single period, e.g. `2026-W34`. Null means every period. */
  periodRef: string | null;
  /** Only closed, unpaid lines with money on them. */
  payableOnly: boolean;
}

/** Matches everything. The starting point for any filter UI. */
export const EMPTY_PAYOUT_QUERY: PayoutQuery = {
  text: "",
  status: null,
  periodRef: null,
  payableOnly: false,
};

export function isEmptyPayoutQuery(query: PayoutQuery): boolean {
  return (
    query.text.trim() === "" &&
    query.status === null &&
    query.periodRef === null &&
    !query.payableOnly
  );
}

/**
 * The shape both settlements share, so the filter can be written once.
 *
 * Deliberately structural rather than a union of the two interfaces: the payout
 * screen only ever filters on these five fields, and naming them here is what
 * keeps a future third payee (a franchise, a marketplace seller) from needing a
 * third copy of this function.
 */
export interface SearchableSettlement {
  periodRef: string;
  status: SettlementStatus;
  netPayable: number;
  payoutRef: string | null;
}

/** Every field a vendor settlement is searched by. */
export function vendorSettlementHaystack(settlement: VendorSettlement): string {
  return [settlement.vendorName, settlement.periodRef, settlement.payoutRef ?? ""]
    .join(" ")
    .toLowerCase();
}

/** Every field a rider settlement is searched by. */
export function riderSettlementHaystack(settlement: RiderSettlement): string {
  return [settlement.riderName, settlement.periodRef, settlement.payoutRef ?? ""]
    .join(" ")
    .toLowerCase();
}

/** Does a haystack match a free-text term? Empty term matches everything. */
export function matchesPayoutText(haystack: string, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  // Every whitespace-separated word has to appear somewhere — two words are an
  // intersection, matching `lib/order-search` and `lib/onboarding-search`.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Is there money to transfer on this line today?
 *
 * The same rule as `lib/settlement.isPayable`, restated over the searchable shape
 * so the filter does not have to widen its input to a full settlement. Kept as one
 * expression in one file rather than inlined at both call sites.
 */
export function isPayableRow(row: SearchableSettlement): boolean {
  return row.status !== "open" && row.status !== "paid" && row.netPayable > 0;
}

/**
 * Apply a query.
 *
 * Ordering is the payout desk's: newest period first, and within a period the
 * biggest amount first. A payout run is worked top-down and the largest transfer
 * is the one worth checking before it goes, which is not true of an alphabetical
 * list of names.
 */
export function filterSettlements<T extends SearchableSettlement>(
  settlements: T[],
  query: PayoutQuery,
  haystackOf: (item: T) => string,
): T[] {
  return settlements
    .filter((row) => {
      if (query.periodRef && row.periodRef !== query.periodRef) return false;
      if (query.status && row.status !== query.status) return false;
      if (query.payableOnly && !isPayableRow(row)) return false;
      return matchesPayoutText(haystackOf(row), query.text);
    })
    .sort(
      (a, b) =>
        b.periodRef.localeCompare(a.periodRef) || b.netPayable - a.netPayable,
    );
}

/**
 * How many lines each status holds, over the query's *text and period only*.
 *
 * The counts on the status chips have to move with the search and the period — a
 * chip reading "Paid 12" while the list is scoped to one week is a lie — but must
 * not move with the status selection itself, or picking one would zero the others.
 * Identical reasoning to `countByStatus` on the onboarding queues.
 */
export function countBySettlementStatus<T extends SearchableSettlement>(
  settlements: T[],
  query: PayoutQuery,
  haystackOf: (item: T) => string,
): Record<string, number> {
  const scoped = filterSettlements(
    settlements,
    { ...query, status: null, payableOnly: false },
    haystackOf,
  );
  const counts: Record<string, number> = {};
  for (const status of SETTLEMENT_STATUSES) {
    counts[status] = scoped.filter((row) => row.status === status).length;
  }
  return counts;
}

/**
 * Every period present in a settlement set, newest first — the period filter's
 * options.
 *
 * Derived from the data rather than generated from the calendar, so the dropdown
 * never offers a week the platform did no business in.
 */
export function settlementPeriods(
  settlements: ReadonlyArray<SearchableSettlement>,
): string[] {
  return [...new Set(settlements.map((s) => s.periodRef))].sort((a, b) =>
    b.localeCompare(a),
  );
}
