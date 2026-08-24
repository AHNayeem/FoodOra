import type { CustomerRecord } from "@/types";

/**
 * customer-search.ts — asking the customer directory a question (Phase 11, G15).
 *
 * The sibling of `lib/order-search`, built the same way and for the same reason:
 * the filtering is one pure predicate over the derived directory rather than a
 * page full of `filter` chains, so the same query object can be serialised into a
 * URL, replayed in a test, or handed to a `WHERE` clause when Phase E moves this
 * server-side. Everything here is data and functions — no clock (callers pass
 * `now`), no store, no i18n.
 *
 * The segments are chosen to be *questions a desk actually asks*, not a
 * re-listing of the fields. "Who have we stopped", "who has stopped ordering",
 * "who keeps complaining" are the three that open a conversation; a filter for
 * every column would answer none of them faster.
 */

/** No order in this long and they have gone quiet. */
export const LAPSED_DAYS = 30;

/** Orders before somebody counts as a returning customer rather than a trial. */
export const REPEAT_ORDERS = 2;

export type CustomerSegment =
  /** Everyone. */
  | "all"
  /** Allowed to order. */
  | "active"
  /** Stopped by the platform. */
  | "blocked"
  /** Ordered more than once — the ones worth keeping. */
  | "repeat"
  /** Has ordered, but not lately. */
  | "lapsed"
  /** Nothing has verified their phone or email. */
  | "unverified"
  /** Has raised a dispute. */
  | "disputes";

export const CUSTOMER_SEGMENTS: readonly CustomerSegment[] = [
  "all",
  "active",
  "blocked",
  "repeat",
  "lapsed",
  "unverified",
  "disputes",
];

/** How the list is ordered. */
export type CustomerSort =
  /** Most recent order first — the directory's own order. */
  | "recent"
  /** Biggest net spender first. */
  | "spend"
  /** Most orders first. */
  | "orders"
  /** Longest-standing first. */
  | "joined"
  | "name";

export const CUSTOMER_SORTS: readonly CustomerSort[] = [
  "recent",
  "spend",
  "orders",
  "joined",
  "name",
];

/** One question about the directory. A fresh query matches everything. */
export interface CustomerQuery {
  /** Free text over the name, phone, email and customer reference. */
  text: string;
  segment: CustomerSegment;
  sort: CustomerSort;
}

export const EMPTY_CUSTOMER_QUERY: CustomerQuery = {
  text: "",
  segment: "all",
  sort: "recent",
};

/** Is anything actually being filtered? Drives the "clear filters" affordance. */
export function isEmptyCustomerQuery(query: CustomerQuery): boolean {
  return (
    query.text.trim() === "" && query.segment === "all" && query.sort === "recent"
  );
}

/** Does this person belong to a segment? */
export function inSegment(
  record: CustomerRecord,
  segment: CustomerSegment,
  now: number,
): boolean {
  const { customer, stats } = record;
  switch (segment) {
    case "all":
      return true;
    case "active":
      return customer.status === "active";
    case "blocked":
      return customer.status === "blocked";
    case "repeat":
      return stats.orders >= REPEAT_ORDERS;
    case "lapsed":
      // Somebody who has *never* ordered has not lapsed — they never started, and
      // lumping the two together would hide a real churn number behind sign-ups.
      return (
        stats.lastOrderAt != null &&
        now - Date.parse(stats.lastOrderAt) > LAPSED_DAYS * 24 * 60 * 60_000
      );
    case "unverified":
      return !customer.isVerified;
    case "disputes":
      return stats.tickets > 0;
  }
}

/**
 * Everything a search term is matched against.
 *
 * The phone is in here because it is what a caller quotes, and the reference is
 * because it is what a colleague pastes into chat. Nothing is matched that the
 * desk cannot legitimately see.
 */
function haystack(record: CustomerRecord): string {
  const { customer, stats } = record;
  return [
    customer.name,
    customer.phone,
    customer.email ?? "",
    customer.id,
    customer.city ?? "",
    stats.lastArea ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Does this person match a free-text term? Empty term matches everything. */
export function matchesCustomerText(record: CustomerRecord, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  // Every word has to appear somewhere, so "banani nabila" is an intersection —
  // which is how a person expects two words to behave.
  return q.split(/\s+/).every((word) => haystack(record).includes(word));
}

function compare(a: CustomerRecord, b: CustomerRecord, sort: CustomerSort): number {
  switch (sort) {
    case "spend":
      return b.stats.netSpend - a.stats.netSpend;
    case "orders":
      return b.stats.orders - a.stats.orders;
    case "joined":
      return Date.parse(a.customer.joinedAt || "0") - Date.parse(b.customer.joinedAt || "0");
    case "name":
      return a.customer.name.localeCompare(b.customer.name);
    case "recent": {
      const at = a.stats.lastOrderAt ? Date.parse(a.stats.lastOrderAt) : 0;
      const bt = b.stats.lastOrderAt ? Date.parse(b.stats.lastOrderAt) : 0;
      return bt - at;
    }
  }
}

/** Apply a query. */
export function filterCustomers(
  records: CustomerRecord[],
  query: CustomerQuery,
  now: number,
): CustomerRecord[] {
  return records
    .filter(
      (record) =>
        inSegment(record, query.segment, now) && matchesCustomerText(record, query.text),
    )
    // Name is the tie-break on every sort, so a list of people with the same
    // spend (commonly zero) does not shuffle between renders.
    .sort(
      (a, b) => compare(a, b, query.sort) || a.customer.name.localeCompare(b.customer.name),
    );
}

/**
 * How many people each segment holds, over the *text search only* — the counts on
 * the chips have to move with the search box (a chip reading "Blocked 4" while the
 * search is scoped to one person is a lie) but must not move with the segment
 * selection itself, or picking one would zero the others.
 */
export function countBySegment(
  records: CustomerRecord[],
  query: CustomerQuery,
  now: number,
): Record<CustomerSegment, number> {
  const scoped = records.filter((record) => matchesCustomerText(record, query.text));
  const counts = {} as Record<CustomerSegment, number>;
  for (const segment of CUSTOMER_SEGMENTS) {
    counts[segment] = scoped.filter((record) => inSegment(record, segment, now)).length;
  }
  return counts;
}
