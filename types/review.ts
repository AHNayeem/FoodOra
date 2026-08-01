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
