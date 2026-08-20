import type { OnboardingStatus, RiderApplication, VendorApplication } from "@/types";

/**
 * onboarding-search.ts — asking the application set a question (Phases 6–7).
 *
 * The same idea as `lib/order-search`, and written the same way: one pure predicate
 * over the shared store rather than a page full of `filter` chains, no clock (the
 * caller passes `now`), no store, no i18n. The two admin queues need identical
 * filtering — text, status, date window — so it is written once and parameterised by
 * the haystack, rather than twice with a subtle difference nobody notices until a
 * search stops finding riders by phone number.
 */

/** How far back the list looks. Windows are half-open: `[start, now]`. */
export type ApplicationDateRange = "7d" | "30d" | "90d" | "all";

export const APPLICATION_DATE_RANGES: readonly ApplicationDateRange[] = [
  "7d",
  "30d",
  "90d",
  "all",
];

/**
 * One question about the application set.
 *
 * `awaitingOnly` is separate from `status` on purpose: "show me the pending queue"
 * is the operator's most common ask and it must survive changing the status filter,
 * which is what a bare `status: "pending"` would not.
 */
export interface ApplicationQuery {
  /** Free text over the reference, people, business and contact details. */
  text: string;
  status: OnboardingStatus | null;
  /** Only applications waiting on the platform. */
  awaitingOnly: boolean;
  range: ApplicationDateRange;
}

/** Matches everything. The starting point for any filter UI. */
export const EMPTY_APPLICATION_QUERY: ApplicationQuery = {
  text: "",
  status: null,
  awaitingOnly: false,
  range: "all",
};

export function isEmptyApplicationQuery(query: ApplicationQuery): boolean {
  return (
    query.text.trim() === "" &&
    query.status === null &&
    !query.awaitingOnly &&
    query.range === "all"
  );
}

/** Start of a date window in epoch ms, or null for "all time". */
export function applicationRangeStartMs(
  range: ApplicationDateRange,
  now: number,
): number | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now - days * 24 * 60 * 60_000;
}

/**
 * Every field a restaurant application is searched by.
 *
 * The trade licence and the TIN are in here because of who searches: a reviewer
 * with a document in front of them has its number, not the restaurant's name.
 */
export function vendorHaystack(application: VendorApplication): string {
  return [
    application.applicationNumber,
    application.restaurant.name,
    application.owner.name,
    application.owner.email,
    application.owner.phone,
    application.business.legalName,
    application.business.tradeLicence,
    application.business.tin,
    application.restaurant.location.address,
    application.restaurant.location.city,
  ]
    .join(" ")
    .toLowerCase();
}

/** Every field a rider application is searched by. */
export function riderHaystack(application: RiderApplication): string {
  return [
    application.applicationNumber,
    application.personal.name,
    application.personal.nationalId,
    application.personal.area,
    application.contact.phone,
    application.contact.email,
    application.vehicleInfo.plate ?? "",
    application.zoneId,
  ]
    .join(" ")
    .toLowerCase();
}

/** Does a haystack match a free-text term? Empty term matches everything. */
export function matchesApplicationText(haystack: string, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  // Every whitespace-separated word has to appear somewhere — two words are an
  // intersection, which is how a person expects two words to behave.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * The shape both applications share, so the filter can be written once. Anything
 * with a status, a creation date and a searchable text blob can go through it.
 */
interface Searchable {
  status: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  submittedAt: string | null;
}

/**
 * Apply a query.
 *
 * Ordering is the support queue's, for the same reason: the pending half is *work*
 * and is read oldest-first, so the application that has waited longest is the one at
 * the top; everything decided is *history* and is read newest-first like any other
 * log.
 */
export function filterApplications<T extends Searchable>(
  applications: T[],
  query: ApplicationQuery,
  now: number,
  haystackOf: (item: T) => string,
): T[] {
  const from = applicationRangeStartMs(query.range, now);
  const matched = applications.filter((item) => {
    if (item.deletedAt) return false;
    if (from != null && Date.parse(item.createdAt) < from) return false;
    if (query.awaitingOnly && item.status !== "pending") return false;
    if (query.status && item.status !== query.status) return false;
    return matchesApplicationText(haystackOf(item), query.text);
  });

  const waiting = matched.filter((x) => x.status === "pending");
  const rest = matched.filter((x) => x.status !== "pending");
  waiting.sort(
    (a, b) =>
      Date.parse(a.submittedAt ?? a.createdAt) - Date.parse(b.submittedAt ?? b.createdAt),
  );
  rest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return [...waiting, ...rest];
}

/**
 * How many applications each status holds, over the query's *date window and text
 * only*.
 *
 * The counts on the status chips have to move with the search and the date filter —
 * a chip reading "Pending 6" while the list is scoped to one restaurant is a lie —
 * but must not move with the status selection itself, or picking one would zero the
 * others.
 */
export function countByStatus<T extends Searchable>(
  applications: T[],
  query: ApplicationQuery,
  now: number,
  haystackOf: (item: T) => string,
  statuses: readonly OnboardingStatus[],
): Record<string, number> {
  const scoped = filterApplications(
    applications,
    { ...query, status: null, awaitingOnly: false },
    now,
    haystackOf,
  );
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    counts[status] = scoped.filter((x) => x.status === status).length;
  }
  return counts;
}
