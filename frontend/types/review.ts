import type { BaseEntity, ISODate } from "./common";

/**
 * review.ts — ratings and reviews (Phase C22).
 *
 * A review is the **customer's half of a finished order**: the order is the
 * proof of purchase, the review is what they made of it. That relationship is
 * the model's spine — `orderId` is what makes a review `verified`, what stops
 * the same order being reviewed twice, and what lets the merchant answer a real
 * customer rather than an anonymous star.
 *
 * Three things are deliberately *not* stored:
 *
 *  - **The aggregate.** `ReviewSummary` (average, histogram, aspect averages,
 *    top tags) is computed in `lib/reviews.ts`, never written down. A vendor's
 *    `rating` / `reviewCount` in the catalogue are the denormalised counters a
 *    backend keeps beside the table, and the seam re-derives everything else
 *    from them plus the corpus — the C15 / C16 / C21 "derive, never store"
 *    convention.
 *  - **The reply as a second review.** A merchant answering is an *attribute of*
 *    the review (`reply`), because it can never exist without one and is never
 *    listed on its own. In Phase E that is a `review_replies` row with a unique
 *    index on `review_id`.
 *  - **Helpfulness as a boolean.** `helpfulCount` is a count; who voted lives on
 *    the device (`stores/reviews`), exactly as a `review_votes` table would key
 *    on (review_id, user_id).
 *
 * Free text is DATA, not copy: a comment is written by a person in their own
 * words and is never translated (the same rule vendor taglines and testimonial
 * quotes follow). Only the fixed vocabularies — aspects and quick tags — are
 * keys, so the UI chrome around a review localises while the review itself does
 * not.
 */

/** What is being reviewed. Vendors and riders are rated by the same form. */
export type ReviewSubject = "vendor" | "rider";

/**
 * The scored dimensions of an order, beyond the overall star.
 *
 * Kept small on purpose: each one has to be something the customer can answer
 * without thinking, and something a merchant could actually act on.
 */
export type ReviewAspect = "food" | "delivery" | "packaging" | "value";

/** Aspect → 1–5. Partial: a pickup order has nothing to say about delivery. */
export type ReviewAspects = Partial<Record<ReviewAspect, number>>;

/**
 * The quick tags offered under the stars. A closed vocabulary rather than free
 * tagging, because these are counted (`ReviewSummary.topTags`), filtered on and
 * translated — three things loose tags do badly. Keys resolve to
 * `reviews.tag.<tag>`.
 */
export type ReviewTag =
  // positive
  | "tasty"
  | "generous"
  | "hot-on-arrival"
  | "fast-delivery"
  | "well-packaged"
  | "good-value"
  | "friendly-rider"
  | "will-reorder"
  // negative
  | "late"
  | "arrived-cold"
  | "small-portion"
  | "wrong-item"
  | "pricey"
  | "poor-packaging";

/** Star values, largest first wherever a histogram is rendered. */
export type StarValue = 1 | 2 | 3 | 4 | 5;

/**
 * A photo or video attached to a review (spec: Photo Review / Video Review).
 * One shape for both — a video only differs by needing a poster frame, which a
 * photo already carries as its own `thumbnail`.
 */
export interface ReviewMedia {
  id: string;
  kind: "photo" | "video";
  url: string;
  /** Poster / grid thumbnail. Same as `url` for a photo. */
  thumbnail: string;
}

/** The merchant's public answer. One per review, never listed on its own. */
export interface ReviewReply {
  body: string;
  /** Who signed it — the restaurant's name, not the staff member's. */
  authorName: string;
  repliedAt: ISODate;
}

export interface Review extends BaseEntity {
  subject: ReviewSubject;
  /** FK → `ven_*` or `rid_*`, depending on `subject`. */
  subjectId: string;
  /**
   * The vendor this review belongs to *commercially* — the same as `subjectId`
   * for a vendor review, and the restaurant the trip served for a rider one.
   * Denormalised so the merchant board is one filter rather than a join through
   * orders.
   */
  vendorId: string;
  /** The order being reviewed. Null only for imported/legacy rows. */
  orderId: string | null;
  orderNumber: string | null;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  /** Overall, 1–5. The only required score. */
  rating: number;
  aspects: ReviewAspects;
  /** The customer's own words. Never translated. */
  comment: string;
  tags: ReviewTag[];
  /** Dishes the review is about (FK → `fd_*`), for the "most loved" strip. */
  dishIds: string[];
  media: ReviewMedia[];
  /** How many people found it useful. Who voted lives on the device. */
  helpfulCount: number;
  reply: ReviewReply | null;
  /** Backed by an order this account actually placed. */
  verified: boolean;
}

/** One tag and how often it appears in a corpus. */
export interface ReviewTagCount {
  tag: ReviewTag;
  count: number;
}

/**
 * The aggregate over a corpus — derived on every read, never persisted.
 *
 * `count` is the number of reviews behind it, which for a vendor is the
 * catalogue's `reviewCount` (thousands) rather than the length of the page being
 * rendered: the histogram describes the whole table, the list is one page of it.
 */
export interface ReviewSummary {
  average: number;
  count: number;
  /** Reviews per star. `distribution[5]` is the number of five-star reviews. */
  distribution: Record<StarValue, number>;
  /** Average per aspect; 0 where nobody scored it. */
  aspects: Record<ReviewAspect, number>;
  /** Share rating 4★ or better, 0–1 — the "would order again" line. */
  recommend: number;
  /** Reviews carrying at least one photo or video. */
  withMedia: number;
  /** Reviews tied to a real order. */
  verified: number;
  /** Most-used tags, commonest first. */
  topTags: ReviewTagCount[];
}

/** How a list of reviews is ordered. */
export type ReviewSort = "recent" | "helpful" | "highest" | "lowest";

/** What a reader has narrowed the list to. */
export interface ReviewFilter {
  /** Only this star value, or null for all. */
  stars: StarValue | null;
  withMedia: boolean;
  verifiedOnly: boolean;
  /** Merchant board only: reviews the vendor has not answered. */
  unansweredOnly: boolean;
}

/** What the write/edit form collects. Everything else is stamped by the seam. */
export interface ReviewDraft {
  rating: number;
  aspects: ReviewAspects;
  comment: string;
  tags: ReviewTag[];
  dishIds: string[];
  media: ReviewMedia[];
  /** Optional separate score for the courier; null when there was none. */
  riderRating: number | null;
}

/** One month of a vendor's rating history (dashboard trend chart). */
export interface RatingPoint {
  /** Month key, "YYYY-MM" — plain local keys, never `toISOString`. */
  month: string;
  average: number;
  count: number;
}

/** A dish the corpus rates highly, resolved for the "most loved" strip. */
export interface LovedDish {
  foodId: string;
  name: string;
  image: string;
  /** How many reviews called it out. */
  mentions: number;
  average: number;
}

// ---------------------------------------------------------------------------
// Moderation (Phase 13, G29)
// ---------------------------------------------------------------------------

/**
 * Why a review was reported — and, when the desk acts, the grounds it cites.
 *
 * One closed vocabulary for both halves on purpose: the whole value of a
 * moderation queue is being able to ask "how often is a report of this kind
 * upheld", and that question cannot be asked if the reporter picks from one list
 * and the moderator from another. The prose beside it (`ReviewReport.body`,
 * `ReviewModerationEvent.body`) is where the specifics go.
 */
export type ReviewReportReason =
  /** Abuse, slurs, threats. */
  | "offensive"
  /** Advertising, a link, a repeated paste. */
  | "spam"
  /** Not about the food or the order — a complaint about the app, say. */
  | "off-topic"
  /** Names a rider, a phone number, an address. */
  | "personal-info"
  /** No order behind it, or a competitor talking down a rival. */
  | "fake"
  /** Blames this restaurant for another one's order. */
  | "wrong-order"
  | "other";

/** Who raised a report. A restaurant flagging abuse is the commonest source. */
export type ReviewReporterRole = "customer" | "vendor" | "platform";

/**
 * One report against one review. Append-only: a review with four reports has
 * four rows, because "how many people objected" is exactly what decides whether
 * a moderator looks at it today.
 */
export interface ReviewReport {
  id: string;
  reason: ReviewReportReason;
  /** What the reporter wrote. Prose a human typed, so it is never translated. */
  body: string | null;
  /** A display label — a restaurant's name, a customer's name, "Trust & Safety". */
  by: string;
  byRole: ReviewReporterRole;
  at: ISODate;
}

/**
 * Where a reported review stands.
 *
 * `hidden` and `removed` are both invisible to readers and are **not** the same
 * decision: hiding is reversible and is what a borderline review gets while it
 * is argued about; removal is the end of the argument. `lib/review-moderation`
 * refuses to restore a removed review for that reason, and the surface confirms
 * before removing.
 */
export type ReviewModerationStatus = "pending" | "approved" | "hidden" | "removed";

/** What happened to a review. `report` is included so the log reads in order. */
export type ReviewModerationAction =
  | "report"
  | "approve"
  | "hide"
  | "remove"
  | "restore"
  | "note";

/**
 * One thing that happened to a review. Append-only, oldest first — the same
 * contract as an order's event log (Phase 1) and a customer's (Phase 11), and
 * for the same reason: a status can say a review is hidden but never who hid it,
 * when, or on what grounds, which is precisely what is asked for when the author
 * or the restaurant disputes it.
 */
export interface ReviewModerationEvent {
  id: string;
  action: ReviewModerationAction;
  /** The grounds cited (`hide`/`remove`) or claimed (`report`); null otherwise. */
  reason: ReviewReportReason | null;
  /** What the moderator or reporter wrote. Never translated. */
  body: string | null;
  by: string;
  at: ISODate;
}

/**
 * The moderation record for one review — created by the first report, never
 * before.
 *
 * It is deliberately a **row beside the review, not a field on it**. The corpus a
 * vendor page renders is synthesised from the catalogue (`lib/mock/reviews`) and
 * a customer's own reviews live in their browser; neither can carry a platform
 * decision. Keying the decision on `reviewId` means the desk can act on a review
 * it does not own, which is the whole job, and means a review with no record has
 * simply never been reported — no backfill, no default column, nothing to
 * migrate.
 */
export interface ReviewModerationRecord {
  reviewId: string;
  /** Denormalised from the review so the queue can resolve without a scan. */
  subject: ReviewSubject;
  subjectId: string;
  vendorId: string;
  status: ReviewModerationStatus;
  reports: ReviewReport[];
  /** Grounds behind the standing decision; null while pending or approved. */
  reason: ReviewReportReason | null;
  decidedBy: string | null;
  decidedAt: ISODate | null;
  moderation: ReviewModerationEvent[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** The restaurant a reported review is about, resolved for the queue. */
export interface ReviewQueueVendor {
  id: string;
  slug: string;
  name: string;
  rating: number;
  reviewCount: number;
}

/** The order behind a reported review, when the shared order store still has it. */
export interface ReviewQueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: ISODate;
  total: number;
  currency: string;
}

/**
 * Who wrote the reported review, and what else is known about them.
 *
 * `customerId` is present only when the order behind the review is one this
 * prototype still holds — the join is the normalised phone, exactly as Phase 11
 * defined it — so the queue can link to `/admin/customers/…` when it honestly
 * can and say nothing when it cannot.
 */
export interface ReviewQueueAuthor {
  id: string;
  name: string;
  avatar: string | null;
  /** Backed by an order the platform can see. */
  verified: boolean;
  /** Reviews this author has left for this restaurant. */
  reviewsHere: number;
  /** Their reviews that have ever been reported. */
  reported: number;
  /** Their reviews that were hidden or removed. */
  actioned: number;
  customerId: string | null;
  phone: string | null;
}

/** One row of the moderation queue: the review, the decision, and the context. */
export interface ReviewQueueRow {
  review: Review;
  record: ReviewModerationRecord;
  vendor: ReviewQueueVendor | null;
  order: ReviewQueueOrder | null;
  author: ReviewQueueAuthor;
}

/** How the queue is narrowed. `all` is every review with a record. */
export type ReviewQueueSegment = "pending" | "approved" | "hidden" | "removed" | "all";

/** How the queue is ordered. */
export type ReviewQueueSort = "reports" | "recent" | "lowest";
