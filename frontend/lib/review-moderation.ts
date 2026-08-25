import type {
  Review,
  ReviewModerationAction,
  ReviewModerationEvent,
  ReviewModerationRecord,
  ReviewModerationStatus,
  ReviewQueueRow,
  ReviewQueueSegment,
  ReviewQueueSort,
  ReviewReport,
  ReviewReportReason,
  ReviewReporterRole,
} from "@/types";

/**
 * review-moderation.ts — the moderation rules for reviews (Phase 13, G29). Pure:
 * nothing here reads the clock, touches a store or hits a service; a record and
 * an input go in, a new record or a refusal comes out.
 *
 * The shape is deliberately the one `lib/customers` (Phase 11) uses for account
 * moderation, because it is the same job on a different subject: every mutation
 * returns `{ record, error }`, refuses rather than throws, appends exactly one
 * event to an append-only log, and never writes a status without also writing
 * who decided it and when. A moderator's decision that cannot be explained
 * afterwards is worse than no decision.
 *
 * Three rules worth reading before the code:
 *
 * 1. **A record exists only once somebody objected.** There is no default row
 *    per review and nothing to backfill; `isReviewVisible` treats "no record" as
 *    visible, which is what keeps twenty thousand synthesised reviews out of the
 *    moderation store.
 * 2. **Hiding is reversible, removal is not.** They are two decisions, not one
 *    with a severity flag — `restoreReview` refuses a removed review, which is
 *    what makes the confirmation on removal mean something.
 * 3. **Grounds *and* prose are both required to take a review down**, exactly as
 *    blocking a customer requires both: the category is what gets counted, the
 *    sentence is what the author and the restaurant are owed if they ask.
 */

/** Everything a moderation call can refuse, as an i18n key under `moderation.*`. */
export type ModerationError =
  | "errors.reviewNotFound"
  | "errors.alreadyReported"
  | "errors.alreadyDecided"
  | "errors.alreadyHidden"
  | "errors.alreadyRemoved"
  | "errors.notHidden"
  | "errors.removedIsFinal"
  | "errors.reasonRequired"
  | "errors.noteRequired";

/** The vocabulary a report claims and a decision cites. */
export const REVIEW_REPORT_REASONS: readonly ReviewReportReason[] = [
  "offensive",
  "spam",
  "off-topic",
  "personal-info",
  "fake",
  "wrong-order",
  "other",
];

export const REVIEW_QUEUE_SEGMENTS: readonly ReviewQueueSegment[] = [
  "pending",
  "approved",
  "hidden",
  "removed",
  "all",
];

export const REVIEW_QUEUE_SORTS: readonly ReviewQueueSort[] = ["reports", "recent", "lowest"];

/**
 * The shortest note that says anything. Same eight characters `lib/customers`
 * demands before an account is blocked — long enough to rule out a full stop,
 * short enough that nobody is taught to pad.
 */
export const MIN_MODERATION_NOTE = 8;

/** The longest note the log keeps; past this it is a support thread, not a note. */
export const MAX_MODERATION_NOTE = 400;

/** Deterministic event id — stable across a re-render, unique per record + time. */
function eventId(reviewId: string, action: ReviewModerationAction, ms: number): string {
  return `rmo_${reviewId}_${action}_${ms.toString(36)}`;
}

function event(
  reviewId: string,
  input: {
    action: ReviewModerationAction;
    reason?: ReviewReportReason | null;
    body?: string | null;
    by: string;
  },
  now: number,
): ReviewModerationEvent {
  return {
    id: eventId(reviewId, input.action, now),
    action: input.action,
    reason: input.reason ?? null,
    body: input.body ?? null,
    by: input.by,
    at: new Date(now).toISOString(),
  };
}

/** Commit one event and stamp the record. Never called with a status it refused. */
function commit(
  record: ReviewModerationRecord,
  ev: ReviewModerationEvent,
  patch: Partial<ReviewModerationRecord>,
): ReviewModerationRecord {
  return {
    ...record,
    ...patch,
    moderation: [...record.moderation, ev],
    updatedAt: ev.at,
  };
}

/**
 * The record a review starts with the moment it is first reported: pending, no
 * decision, an empty log. The subject and vendor are copied off the review so
 * the queue can resolve the review again later without scanning every corpus.
 */
export function newModerationRecord(review: Review, now: number): ReviewModerationRecord {
  const iso = new Date(now).toISOString();
  return {
    reviewId: review.id,
    subject: review.subject,
    subjectId: review.subjectId,
    vendorId: review.vendorId,
    status: "pending",
    reports: [],
    reason: null,
    decidedBy: null,
    decidedAt: null,
    moderation: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Is this review still readable? No record at all means nobody ever objected. */
export function isReviewVisible(record: ReviewModerationRecord | undefined): boolean {
  if (!record) return true;
  return record.status !== "hidden" && record.status !== "removed";
}

/** Reviews the desk has taken down, keyed for a fast `has` in a corpus filter. */
export function hiddenReviewIds(
  records: Record<string, ReviewModerationRecord>,
): Set<string> {
  return new Set(
    Object.values(records)
      .filter((record) => !isReviewVisible(record))
      .map((record) => record.reviewId),
  );
}

/** Reports on a review. The number that decides whether it is looked at today. */
export function reportCount(record: ReviewModerationRecord): number {
  return record.reports.length;
}

/** Reviews waiting on a decision — the admin nav badge. */
export function pendingReviewCount(
  records: Record<string, ReviewModerationRecord>,
): number {
  return Object.values(records).filter((r) => r.status === "pending").length;
}

/**
 * Raise a report against a review.
 *
 * `record` is null the first time anybody objects; the caller passes the review
 * so the record can be minted here rather than in two places. The same reporter
 * cannot report the same review twice — a second flag is not a second objection,
 * and counting it would let one person push a review up the queue.
 *
 * A report on an **approved** review re-opens it: the desk looked once and let it
 * stand, and new objections are a reason to look again. A report on a review
 * already taken down is refused, because there is nothing left to decide.
 */
export function reportReviewRecord(
  record: ReviewModerationRecord | null,
  review: Review,
  input: {
    reason: ReviewReportReason;
    note?: string | null;
    by: string;
    byRole: ReviewReporterRole;
  },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  const base = record ?? newModerationRecord(review, now);

  if (base.status === "hidden") return { record: base, error: "errors.alreadyHidden" };
  if (base.status === "removed") return { record: base, error: "errors.alreadyRemoved" };
  if (!input.reason) return { record: base, error: "errors.reasonRequired" };
  if (base.reports.some((r) => r.by === input.by)) {
    return { record: base, error: "errors.alreadyReported" };
  }

  const body = input.note?.trim().slice(0, MAX_MODERATION_NOTE) || null;
  const at = new Date(now).toISOString();
  const report: ReviewReport = {
    id: `rrp_${review.id}_${now.toString(36)}`,
    reason: input.reason,
    body,
    by: input.by,
    byRole: input.byRole,
    at,
  };
  const ev = event(
    review.id,
    { action: "report", reason: input.reason, body, by: input.by },
    now,
  );

  return {
    record: commit(base, ev, {
      reports: [...base.reports, report],
      // Re-opened rather than left approved — see the note above.
      status: "pending",
      reason: null,
      decidedBy: null,
      decidedAt: null,
    }),
    error: null,
  };
}

/** Shared shape of the three decisions: grounds where required, then prose. */
function decide(
  record: ReviewModerationRecord,
  status: ReviewModerationStatus,
  action: ReviewModerationAction,
  input: { reason?: ReviewReportReason | null; note?: string | null; by: string },
  now: number,
  requireGrounds: boolean,
): { record: ReviewModerationRecord; error: ModerationError | null } {
  if (requireGrounds && !input.reason) {
    return { record, error: "errors.reasonRequired" };
  }
  const note = input.note?.trim() ?? "";
  if (requireGrounds && note.length < MIN_MODERATION_NOTE) {
    return { record, error: "errors.noteRequired" };
  }
  const body = note.slice(0, MAX_MODERATION_NOTE) || null;
  const ev = event(
    record.reviewId,
    { action, reason: input.reason ?? null, body, by: input.by },
    now,
  );
  return {
    record: commit(record, ev, {
      status,
      reason: status === "hidden" || status === "removed" ? input.reason ?? null : null,
      decidedBy: input.by,
      decidedAt: ev.at,
    }),
    error: null,
  };
}

/**
 * Leave the review up. The "approve" half of approve/hide.
 *
 * No grounds and no note are demanded: a review that broke no rule needs no
 * argument, and requiring one would only teach moderators to type a full stop —
 * the same asymmetry `unblockCustomer` follows.
 */
export function approveReview(
  record: ReviewModerationRecord,
  input: { note?: string | null; by: string },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  if (record.status === "approved") return { record, error: "errors.alreadyDecided" };
  if (record.status === "removed") return { record, error: "errors.removedIsFinal" };
  return decide(record, "approved", "approve", input, now, false);
}

/** Take the review off the storefront, reversibly. Grounds and a note required. */
export function hideReview(
  record: ReviewModerationRecord,
  input: { reason: ReviewReportReason; note: string; by: string },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  if (record.status === "hidden") return { record, error: "errors.alreadyHidden" };
  if (record.status === "removed") return { record, error: "errors.removedIsFinal" };
  return decide(record, "hidden", "hide", input, now, true);
}

/**
 * Take the review down for good. Grounds and a note required, and there is no
 * way back — which is why the surface confirms first and why `restoreReview`
 * refuses afterwards.
 */
export function removeReview(
  record: ReviewModerationRecord,
  input: { reason: ReviewReportReason; note: string; by: string },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  if (record.status === "removed") return { record, error: "errors.alreadyRemoved" };
  return decide(record, "removed", "remove", input, now, true);
}

/**
 * Put a hidden review back. It returns to `approved` rather than to `pending`:
 * restoring *is* the decision, and dropping it back into the queue would ask the
 * next moderator to make it again.
 */
export function restoreReview(
  record: ReviewModerationRecord,
  input: { note?: string | null; by: string },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  if (record.status === "removed") return { record, error: "errors.removedIsFinal" };
  if (record.status !== "hidden") return { record, error: "errors.notHidden" };
  return decide(record, "approved", "restore", input, now, false);
}

/** Write something down without changing anything. */
export function noteReviewRecord(
  record: ReviewModerationRecord,
  input: { body: string; by: string },
  now = Date.now(),
): { record: ReviewModerationRecord; error: ModerationError | null } {
  const body = input.body.trim();
  if (body.length < MIN_MODERATION_NOTE) return { record, error: "errors.noteRequired" };
  const ev = event(
    record.reviewId,
    { action: "note", body: body.slice(0, MAX_MODERATION_NOTE), by: input.by },
    now,
  );
  return { record: commit(record, ev, {}), error: null };
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/** What the desk has narrowed the queue to. */
export interface ReviewQueueQuery {
  segment: ReviewQueueSegment;
  sort: ReviewQueueSort;
  /** Free text over the comment, the author, the restaurant and the reference. */
  text: string;
  /** Only reviews at 2★ or below. */
  criticalOnly: boolean;
}

export const EMPTY_QUEUE_QUERY: ReviewQueueQuery = {
  segment: "pending",
  sort: "reports",
  text: "",
  criticalOnly: false,
};

export function isEmptyQueueQuery(query: ReviewQueueQuery): boolean {
  return (
    query.segment === EMPTY_QUEUE_QUERY.segment &&
    query.sort === EMPTY_QUEUE_QUERY.sort &&
    query.text === "" &&
    !query.criticalOnly
  );
}

/** Does this row match the free-text box? Every word has to appear somewhere. */
function matchesText(row: ReviewQueueRow, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    row.review.comment,
    row.review.authorName,
    row.review.orderNumber ?? "",
    row.vendor?.name ?? "",
    ...row.record.reports.map((r) => r.body ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

/**
 * One predicate, used by both the list and the counts, so a chip can never
 * disagree with the rows it reveals (the Phase 11 convention).
 */
export function matchesQueueQuery(row: ReviewQueueRow, query: ReviewQueueQuery): boolean {
  if (query.segment !== "all" && row.record.status !== query.segment) return false;
  if (query.criticalOnly && row.review.rating > 2) return false;
  return matchesText(row, query.text);
}

export function filterQueue(
  rows: ReviewQueueRow[],
  query: ReviewQueueQuery,
): ReviewQueueRow[] {
  return sortQueue(
    rows.filter((row) => matchesQueueQuery(row, query)),
    query.sort,
  );
}

/**
 * Segment counts, taken from the text-and-critical filtered set but **ignoring
 * the chosen segment** — so picking "hidden" never collapses the others to zero
 * and the desk can still see how much is waiting.
 */
export function countBySegment(
  rows: ReviewQueueRow[],
  query: ReviewQueueQuery,
): Record<ReviewQueueSegment, number> {
  const scoped = rows.filter((row) =>
    matchesQueueQuery(row, { ...query, segment: "all" }),
  );
  return REVIEW_QUEUE_SEGMENTS.reduce(
    (acc, segment) => {
      acc[segment] =
        segment === "all"
          ? scoped.length
          : scoped.filter((row) => row.record.status === segment).length;
      return acc;
    },
    {} as Record<ReviewQueueSegment, number>,
  );
}

/**
 * Queue ordering. Every sort ends on the same tie-break — newest report first,
 * then review id — so the order is stable across renders and independent of the
 * order the records happened to be stored in.
 */
export function sortQueue(rows: ReviewQueueRow[], sort: ReviewQueueSort): ReviewQueueRow[] {
  const lastReportAt = (row: ReviewQueueRow) =>
    row.record.reports.length > 0
      ? Date.parse(row.record.reports[row.record.reports.length - 1].at)
      : Date.parse(row.record.createdAt);

  return [...rows].sort((a, b) => {
    if (sort === "reports" && reportCount(b.record) !== reportCount(a.record)) {
      return reportCount(b.record) - reportCount(a.record);
    }
    if (sort === "lowest" && a.review.rating !== b.review.rating) {
      return a.review.rating - b.review.rating;
    }
    const recency = lastReportAt(b) - lastReportAt(a);
    if (recency !== 0) return recency;
    return a.review.id.localeCompare(b.review.id);
  });
}
