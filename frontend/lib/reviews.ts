import type {
  Order,
  RatingPoint,
  Review,
  ReviewAspect,
  ReviewDraft,
  ReviewFilter,
  ReviewSort,
  ReviewSummary,
  ReviewTag,
  ReviewTagCount,
  StarValue,
} from "@/frontend/types";
import { timeOf } from "./order-lifecycle";

/**
 * reviews.ts — the rating rules engine (Phase C22). Pure: nothing here reads the
 * clock, touches a store or hits a service; reviews and a `nowMs` go in, verdicts
 * and aggregates come out.
 *
 * Two ideas do most of the work.
 *
 * **The aggregate is derived, never stored.** `summarise()` is the only place a
 * histogram, an average or an aspect score is calculated, and the storefront,
 * the merchant board and the account page all call it — so the number under the
 * vendor's name and the number on their dashboard cannot drift apart. This is
 * the same convention as a self-expiring pause (C15), a completed sitting (C16)
 * and a spent coupon (C21).
 *
 * **The catalogue's counter is the truth for the whole table.** A vendor carries
 * `rating` and `reviewCount` — the denormalised columns a backend keeps beside
 * the reviews table, because nobody wants `AVG()` over 3,410 rows on every page
 * view. The prototype cannot ship 3,410 rows either, so
 * `distributionFromAggregate()` reconstructs the histogram those two numbers
 * imply, and `mergeReviews()` folds in the handful of reviews written on this
 * device. In Phase E the reconstruction is deleted and replaced by one
 * `GROUP BY rating` — every caller keeps its signature.
 */

/** Stars, highest first — the order a histogram is always rendered in. */
export const STAR_VALUES: readonly StarValue[] = [5, 4, 3, 2, 1];

/** The scored dimensions, in the order the form asks for them. */
export const REVIEW_ASPECTS: readonly ReviewAspect[] = [
  "food",
  "delivery",
  "packaging",
  "value",
];

/** Tags offered when the customer is happy (4★+). */
export const POSITIVE_TAGS: readonly ReviewTag[] = [
  "tasty",
  "generous",
  "hot-on-arrival",
  "fast-delivery",
  "well-packaged",
  "good-value",
  "friendly-rider",
  "will-reorder",
];

/** Tags offered when they are not (3★ and below). */
export const NEGATIVE_TAGS: readonly ReviewTag[] = [
  "late",
  "arrived-cold",
  "small-portion",
  "wrong-item",
  "pricey",
  "poor-packaging",
];

/** How long after the food arrives a review can still be written. */
export const REVIEW_WINDOW_DAYS = 30;

/** How long the author may keep editing — until the merchant answers, at most. */
export const EDIT_WINDOW_DAYS = 7;

/** Ceiling on attachments per review, enforced by the seam. */
export const MAX_REVIEW_MEDIA = 4;

/** Shortest comment we will accept once someone starts writing one. */
export const MIN_COMMENT_LENGTH = 10;

export const MAX_COMMENT_LENGTH = 600;

/** Shortest useful merchant reply. */
export const MIN_REPLY_LENGTH = 10;

export const MAX_REPLY_LENGTH = 400;

const DAY_MS = 86_400_000;

/**
 * Which tags to offer for a score. A one-star review has no business being
 * offered "will reorder", and a five-star one should not be nudged towards
 * "arrived cold" — the vocabulary follows the sentiment the customer already
 * expressed with the stars.
 */
export function tagsForRating(rating: number): readonly ReviewTag[] {
  if (rating >= 4) return POSITIVE_TAGS;
  if (rating <= 2) return NEGATIVE_TAGS;
  // Three stars is genuinely mixed — offer both halves, positives first.
  return [...POSITIVE_TAGS.slice(0, 4), ...NEGATIVE_TAGS.slice(0, 4)];
}

/** A word for a score — `reviews.band.<key>` copy under the star picker. */
export function ratingBandKey(rating: number): string {
  if (rating >= 5) return "excellent";
  if (rating >= 4) return "good";
  if (rating >= 3) return "okay";
  if (rating >= 2) return "poor";
  return "bad";
}

/** An empty histogram — the starting point for every count. */
export function emptyDistribution(): Record<StarValue, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Clamp to a whole star in 1–5; anything unusable reads as the middle. */
export function toStar(rating: number): StarValue {
  const n = Math.round(rating);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as StarValue;
}

/** Total reviews behind a histogram. */
export function distributionTotal(dist: Record<StarValue, number>): number {
  return STAR_VALUES.reduce((n, star) => n + dist[star], 0);
}

/** Sum of every review's stars — the numerator behind the average. */
function starSum(dist: Record<StarValue, number>): number {
  return STAR_VALUES.reduce((sum, star) => sum + star * dist[star], 0);
}

/** The mean a histogram implies; 0 when it is empty. */
export function distributionAverage(dist: Record<StarValue, number>): number {
  const total = distributionTotal(dist);
  return total === 0 ? 0 : starSum(dist) / total;
}

/**
 * Reconstruct the histogram a stored `(average, count)` pair implies.
 *
 * Shape first, then correction. The shape is a bell centred on the average — a
 * 4.8-star restaurant is mostly fives with a tail, not a uniform spread — with a
 * small floor under every bucket, because a vendor with a thousand reviews has
 * *some* one-stars and rendering a zero there looks fabricated. The correction
 * then moves whole reviews between adjacent buckets until the histogram's own
 * mean matches the stored average, so the bars and the headline number can never
 * disagree.
 *
 * Deterministic by construction: same inputs, same bars, every render.
 */
export function distributionFromAggregate(
  average: number,
  count: number,
): Record<StarValue, number> {
  const dist = emptyDistribution();
  if (count <= 0) return dist;

  const mean = Math.min(5, Math.max(1, average));
  // Tighter than a natural spread: real rating distributions are J-shaped, so a
  // narrow bell plus the floor below lands closer than a wide one.
  const sigma = 0.72;
  const weights = STAR_VALUES.map((star) => {
    const bell = Math.exp(-((star - mean) ** 2) / (2 * sigma * sigma));
    return { star, weight: bell + 0.012 };
  });
  const totalWeight = weights.reduce((n, w) => n + w.weight, 0);

  let assigned = 0;
  for (const { star, weight } of weights) {
    const n = Math.floor((count * weight) / totalWeight);
    dist[star] = n;
    assigned += n;
  }
  // Rounding remainder goes to the bucket nearest the average, which is where a
  // real distribution's mass sits anyway.
  dist[toStar(mean)] += count - assigned;

  balanceToMean(dist, mean, count);
  return dist;
}

/**
 * Shuffle reviews between adjacent buckets until the histogram's mean matches
 * `target`. Each move is one review one star, so the number of moves needed is
 * known up front and the loop is bounded by it.
 */
function balanceToMean(
  dist: Record<StarValue, number>,
  target: number,
  count: number,
): void {
  // Compare the star *sums*, not the means: one move is worth exactly one, so
  // the gap is a whole number of moves and the loop cannot overshoot.
  let delta = Math.round(target * count) - starSum(dist);

  // Moving up: take from the lowest-but-one bucket first so the tail thins
  // before the body does.
  while (delta > 0) {
    const from = ([1, 2, 3, 4] as StarValue[]).find((s) => dist[s] > 0);
    if (from === undefined) break;
    const move = Math.min(dist[from], delta);
    dist[from] -= move;
    dist[(from + 1) as StarValue] += move;
    delta -= move;
  }
  while (delta < 0) {
    const from = ([5, 4, 3, 2] as StarValue[]).find((s) => dist[s] > 0);
    if (from === undefined) break;
    const move = Math.min(dist[from], -delta);
    dist[from] -= move;
    dist[(from - 1) as StarValue] += move;
    delta += move;
  }
}

/** How often each tag appears, commonest first. */
export function tagCounts(reviews: Review[], limit = 6): ReviewTagCount[] {
  const counts = new Map<ReviewTag, number>();
  for (const review of reviews) {
    for (const tag of review.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Mean score per aspect across a corpus; 0 where nobody answered. */
export function aspectAverages(reviews: Review[]): Record<ReviewAspect, number> {
  const out = { food: 0, delivery: 0, packaging: 0, value: 0 };
  for (const aspect of REVIEW_ASPECTS) {
    let sum = 0;
    let n = 0;
    for (const review of reviews) {
      const score = review.aspects[aspect];
      if (typeof score === "number") {
        sum += score;
        n += 1;
      }
    }
    out[aspect] = n === 0 ? 0 : sum / n;
  }
  return out;
}

/** Share of a histogram at 4★ or better, 0–1. */
export function recommendShare(dist: Record<StarValue, number>): number {
  const total = distributionTotal(dist);
  if (total === 0) return 0;
  return (dist[4] + dist[5]) / total;
}

/**
 * Aggregate a corpus. Used whole for a rider (whose reviews are all present) and
 * as the corpus half of a vendor summary, where the histogram comes from the
 * catalogue counter instead — see `summariseVendor`.
 */
export function summarise(reviews: Review[]): ReviewSummary {
  const distribution = emptyDistribution();
  for (const review of reviews) distribution[toStar(review.rating)] += 1;

  return {
    average: distributionAverage(distribution),
    count: reviews.length,
    distribution,
    aspects: aspectAverages(reviews),
    recommend: recommendShare(distribution),
    withMedia: reviews.filter((r) => r.media.length > 0).length,
    verified: reviews.filter((r) => r.verified).length,
    topTags: tagCounts(reviews),
  };
}

/**
 * A vendor's summary: the whole table's shape from the catalogue counter, the
 * texture (aspects, tags, photo share) from the reviews actually on hand, and
 * anything written on this device folded into both.
 *
 * The split is deliberate and is what a real page does too — `count` and
 * `average` come from a counter, the page of reviews comes from a query, and
 * only the counter can speak for rows nobody has fetched.
 */
export function summariseVendor(
  storedAverage: number,
  storedCount: number,
  corpus: Review[],
  own: Review[] = [],
): ReviewSummary {
  const distribution = distributionFromAggregate(storedAverage, storedCount);
  for (const review of own) distribution[toStar(review.rating)] += 1;

  const count = storedCount + own.length;
  const average =
    count === 0
      ? 0
      : (storedAverage * storedCount + own.reduce((n, r) => n + r.rating, 0)) / count;

  const sample = [...own, ...corpus];
  return {
    average,
    count,
    distribution,
    aspects: aspectAverages(sample),
    recommend: recommendShare(distribution),
    withMedia: sample.filter((r) => r.media.length > 0).length,
    verified: sample.filter((r) => r.verified).length,
    topTags: tagCounts(sample),
  };
}

/** Does a review pass the reader's narrowing? */
export function matchesFilter(review: Review, filter: ReviewFilter): boolean {
  if (filter.stars !== null && toStar(review.rating) !== filter.stars) return false;
  if (filter.withMedia && review.media.length === 0) return false;
  if (filter.verifiedOnly && !review.verified) return false;
  if (filter.unansweredOnly && review.reply !== null) return false;
  return true;
}

/** The no-op filter — everything through. */
export function allReviews(): ReviewFilter {
  return { stars: null, withMedia: false, verifiedOnly: false, unansweredOnly: false };
}

export function filterReviews(reviews: Review[], filter: ReviewFilter): Review[] {
  return reviews.filter((review) => matchesFilter(review, filter));
}

/**
 * Order a list. `recent` is the default everywhere: a two-year-old five-star
 * review says less about a kitchen than last week's three-star one. Ties always
 * fall back to recency so the order is total and stable across renders.
 */
export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  const byDate = (a: Review, b: Review) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return [...reviews].sort((a, b) => {
    switch (sort) {
      case "helpful":
        return b.helpfulCount - a.helpfulCount || byDate(a, b);
      case "highest":
        return b.rating - a.rating || byDate(a, b);
      case "lowest":
        return a.rating - b.rating || byDate(a, b);
      case "recent":
        return byDate(a, b);
    }
  });
}

/** Month key for a timestamp — plain local parts, never `toISOString`. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Average rating per month over the last `months`, oldest first — the merchant's
 * trend line. Months with no reviews are kept with a zero count so the chart has
 * an even x-axis rather than a gap that reads as a dip.
 */
export function ratingTrend(reviews: Review[], nowMs: number, months = 6): RatingPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  const anchor = new Date(nowMs);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const key = monthKey(d.getTime());
    keys.push(key);
    buckets.set(key, { sum: 0, count: 0 });
  }

  for (const review of reviews) {
    const bucket = buckets.get(monthKey(Date.parse(review.createdAt)));
    if (!bucket) continue;
    bucket.sum += review.rating;
    bucket.count += 1;
  }

  return keys.map((month) => {
    const { sum, count } = buckets.get(month)!;
    return { month, average: count === 0 ? 0 : sum / count, count };
  });
}

/** Dishes called out by a corpus, most-mentioned first. Names are joined by the seam. */
export function dishMentions(
  reviews: Review[],
): { foodId: string; mentions: number; average: number }[] {
  const byDish = new Map<string, { mentions: number; sum: number }>();
  for (const review of reviews) {
    for (const foodId of review.dishIds) {
      const entry = byDish.get(foodId) ?? { mentions: 0, sum: 0 };
      entry.mentions += 1;
      entry.sum += review.rating;
      byDish.set(foodId, entry);
    }
  }
  return [...byDish.entries()]
    .map(([foodId, { mentions, sum }]) => ({ foodId, mentions, average: sum / mentions }))
    .sort((a, b) => b.average - a.average || b.mentions - a.mentions);
}

// ---------------------------------------------------------------------------
// Who may review what, and until when
// ---------------------------------------------------------------------------

/**
 * When the customer got their food — the instant the review window opens.
 *
 * Read from the event log rather than `updatedAt`, because a later transition
 * (settling the payment, a refund) must not extend the window. Null while the
 * order is still in flight or ended without a handover.
 */
export function orderClosedAt(order: Order): number | null {
  return timeOf(order, "delivered") ?? timeOf(order, "completed");
}

/** Whole days left to review; 0 once the window has shut. */
export function reviewDaysLeft(order: Order, nowMs: number): number {
  const closed = orderClosedAt(order);
  if (closed === null) return 0;
  const left = closed + REVIEW_WINDOW_DAYS * DAY_MS - nowMs;
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/**
 * Can this order still be reviewed?
 *
 * Three conditions, in the order a person would check them: the food actually
 * arrived (nobody rates a rejected order), the window is still open, and they
 * have not already said their piece. The seam re-runs this at the moment of
 * submission — a form can sit open past midnight.
 */
export function canReviewOrder(order: Order, nowMs: number, reviewed = false): boolean {
  if (reviewed) return false;
  if (order.status !== "delivered" && order.status !== "completed") return false;
  return reviewDaysLeft(order, nowMs) > 0;
}

/**
 * Can the author still change it?
 *
 * A merchant's public answer locks the review it answers — editing the question
 * after the answer is published would misrepresent both sides. Otherwise the
 * author has a week, which is long enough to fix a typo and short enough that a
 * review cannot be quietly rewritten years later.
 */
export function canEditReview(review: Review, nowMs: number): boolean {
  if (review.reply) return false;
  return nowMs - Date.parse(review.createdAt) <= EDIT_WINDOW_DAYS * DAY_MS;
}

/** True once the review has been touched after it was written. */
export function wasEdited(review: Review): boolean {
  return Date.parse(review.updatedAt) - Date.parse(review.createdAt) > 1000;
}

/** An empty draft — what the write form opens on. */
export function emptyDraft(): ReviewDraft {
  return {
    rating: 0,
    aspects: {},
    comment: "",
    tags: [],
    dishIds: [],
    media: [],
    riderRating: null,
  };
}
