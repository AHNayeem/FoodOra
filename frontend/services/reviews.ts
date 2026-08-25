import type {
  FoodItem,
  LovedDish,
  Order,
  RatingPoint,
  Review,
  ReviewDraft,
  ReviewFilter,
  ReviewMedia,
  ReviewModerationRecord,
  ReviewModerationStatus,
  ReviewQueueAuthor,
  ReviewQueueOrder,
  ReviewQueueRow,
  ReviewQueueSegment,
  ReviewQueueVendor,
  ReviewReply,
  ReviewSort,
  ReviewSummary,
} from "@/types";
import {
  SAMPLE_REVIEW_PHOTOS,
  buildRiderReviews,
  buildVendorReviews,
  foodById,
  vendorById,
} from "@/lib/mock";
import { customerIdFor, normalisePhone } from "@/lib/customers";
import {
  EMPTY_QUEUE_QUERY,
  countBySegment,
  filterQueue,
  isReviewVisible,
  type ReviewQueueQuery,
} from "@/lib/review-moderation";
import {
  MAX_COMMENT_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_REVIEW_MEDIA,
  MIN_COMMENT_LENGTH,
  MIN_REPLY_LENGTH,
  allReviews,
  canEditReview,
  canReviewOrder,
  dishMentions,
  filterReviews,
  orderClosedAt,
  ratingTrend,
  reviewDaysLeft,
  sortReviews,
  summarise,
  summariseVendor,
} from "@/lib/reviews";
import { mockDelay, ok, type Result } from "./http";

/**
 * reviews.ts — the review seam (Phase C22).
 *
 * The same three responsibilities every seam in this codebase carries, and which
 * a real backend keeps on the server:
 *
 * 1. **It owns the clock.** Every read stamps the corpus at `Date.now()` and
 *    hands the instant back, so the storefront's "2 days ago", the account
 *    page's "5 days left to review" and the merchant's month bucket are all
 *    measured from one reading.
 * 2. **It owns the rules.** Reviewing an order that never arrived, reviewing it
 *    twice, editing one the restaurant has already answered publicly, voting on
 *    your own review, replying to a review that is not yours — every one of
 *    those is refused *here*, with an i18n key, not by a disabled button. The
 *    verdicts come from `lib/reviews`, the same functions the UI uses to decide
 *    what to offer, so the two cannot disagree.
 * 3. **It resolves the joins.** A review stores ids; this turns them into the
 *    dish names on the "most loved" strip and the vendor on the merchant board.
 *    Ids that no longer resolve are dropped rather than rendered as holes — the
 *    C23 favorites convention.
 *
 * The corpus itself is synthesised (`lib/mock/reviews`) because the catalogue
 * claims thousands of reviews per vendor; see that file for why the sample can
 * never contradict the stored rating. Everything written in this browser lives
 * in `stores/reviews` and is handed back in on every call as `ReviewContext` —
 * the one artefact of having no database, and the parameter Phase E deletes.
 */

/**
 * What this device knows that the catalogue does not. The C16 `BookContext` /
 * C18 `RiderContext` / C21 `VendorCouponContext` pattern: local writes travel
 * *into* the seam so the seam stays the only place that assembles a review.
 */
export interface ReviewContext {
  /** Reviews written on this device. */
  own: Review[];
  /** Merchant replies made from the dashboard: review id → reply. */
  replies: Record<string, ReviewReply>;
  /** Review ids this device voted helpful — worth one point on top of the count. */
  helpful: string[];
  /**
   * Platform moderation decisions, keyed by review id (Phase 13, G29).
   *
   * Joined in once by `stores/reviews.useReviewContext`, which is what makes a
   * hidden review disappear from *every* corpus this file assembles — the
   * storefront, the merchant board, the rider profile and the AI summary — rather
   * than from whichever surface remembered to filter. A review with no record
   * here has simply never been reported.
   */
  moderation: Record<string, ReviewModerationRecord>;
}

export function emptyContext(): ReviewContext {
  return { own: [], replies: {}, helpful: [], moderation: {} };
}

/** Is this review readable by the public right now? (Phase 13.) */
function visible(review: Review, ctx: ReviewContext): boolean {
  return isReviewVisible(ctx.moderation[review.id]);
}

/** One page of reviews about one subject, with the aggregate behind it. */
export interface ReviewPage {
  /** The instant everything was evaluated at — thread it into the cards. */
  nowMs: number;
  summary: ReviewSummary;
  items: Review[];
  /** Reviews matching the filter, across all pages. */
  total: number;
  hasMore: boolean;
  /** Dishes this corpus rates highest, resolved to names and photos. */
  loved: LovedDish[];
}

/** How the caller wants the list cut. */
export interface ReviewQuery {
  sort?: ReviewSort;
  filter?: Partial<ReviewFilter>;
  page?: number;
  pageSize?: number;
}

/** An order still waiting to be rated. */
export interface PendingReview {
  order: Order;
  /** Whole days before the window shuts. */
  daysLeft: number;
}

/** Who is writing — taken from the session, never from the form. */
export interface ReviewAuthor {
  id: string;
  name: string;
  avatar: string | null;
}

const DEFAULT_PAGE_SIZE = 6;

/** Apply this device's local knowledge to a synthesised review. */
function withContext(review: Review, ctx: ReviewContext): Review {
  const reply = ctx.replies[review.id];
  const voted = ctx.helpful.includes(review.id);
  if (!reply && !voted) return review;
  return {
    ...review,
    reply: reply ?? review.reply,
    helpfulCount: review.helpfulCount + (voted ? 1 : 0),
    updatedAt: reply?.repliedAt ?? review.updatedAt,
  };
}

/**
 * The vendor's corpus, split the way the aggregate needs it: what this device
 * wrote (which counts *on top of* the catalogue's counter) and what the
 * catalogue holds (which the counter already counts). `all` is the list the UI
 * renders, own reviews first — you should see your own words at the top.
 */
function vendorCorpus(
  vendorId: string,
  ctx: ReviewContext,
  nowMs: number,
): { all: Review[]; own: Review[]; catalogue: Review[] } {
  const own = ctx.own.filter(
    (r) =>
      r.subject === "vendor" &&
      r.subjectId === vendorId &&
      !r.deletedAt &&
      // Phase 13: a review the platform hid or removed leaves the public corpus,
      // and therefore leaves the aggregate above it as well — a rating that still
      // counted a removed review would be the "second opinion" §5.4 forbids.
      visible(r, ctx),
  );
  const catalogue = buildVendorReviews(vendorId, nowMs).filter(
    // A review written on this device replaces any synthesised row with the same
    // id — that only happens if a seed id is reused, but the guard keeps the
    // merge total rather than "usually fine".
    (r) => !own.some((o) => o.id === r.id) && visible(r, ctx),
  );
  const withCtx = (list: Review[]) => list.map((r) => withContext(r, ctx));
  const [ownResolved, catalogueResolved] = [withCtx(own), withCtx(catalogue)];
  return {
    all: [...ownResolved, ...catalogueResolved],
    own: ownResolved,
    catalogue: catalogueResolved,
  };
}

/** Join dish mentions onto the catalogue. Dishes that no longer exist drop out. */
function lovedDishes(corpus: Review[], limit = 4): LovedDish[] {
  return dishMentions(corpus)
    .filter((entry) => entry.average >= 4 && entry.mentions >= 2)
    .map((entry) => {
      const food = foodById.get(entry.foodId);
      if (!food || food.deletedAt) return null;
      return {
        foodId: food.id,
        name: food.name,
        image: food.image,
        mentions: entry.mentions,
        average: entry.average,
      };
    })
    .filter((d): d is LovedDish => d !== null)
    .slice(0, limit);
}

function pageOf<T>(items: T[], page: number, pageSize: number): { slice: T[]; hasMore: boolean } {
  const end = page * pageSize;
  return { slice: items.slice(0, end), hasMore: items.length > end };
}

// ---- Reads -----------------------------------------------------------------

/**
 * A restaurant's reviews. The summary always describes the *whole* table (the
 * catalogue's counter plus anything written here); `items` is one page of the
 * corpus after the reader's filter and sort — the same split a paginated
 * endpoint returns beside its aggregate.
 */
export async function getVendorReviews(
  vendorId: string,
  ctx: ReviewContext,
  query: ReviewQuery = {},
): Promise<ReviewPage> {
  const nowMs = Date.now();
  const vendor = vendorById.get(vendorId);
  const { all, own, catalogue } = vendorCorpus(vendorId, ctx, nowMs);

  const summary = vendor
    ? summariseVendor(vendor.rating, vendor.reviewCount, catalogue, own)
    : summarise(all);

  const filtered = filterReviews(all, { ...allReviews(), ...query.filter });
  const sorted = sortReviews(filtered, query.sort ?? "recent");
  const { slice, hasMore } = pageOf(
    sorted,
    query.page ?? 1,
    query.pageSize ?? DEFAULT_PAGE_SIZE,
  );

  return mockDelay(
    { nowMs, summary, items: slice, total: filtered.length, hasMore, loved: lovedDishes(all) },
    200,
  );
}

/** A courier's feedback — the same shape, read by the rider app's profile. */
export async function getRiderReviews(
  riderId: string,
  ctx: ReviewContext,
  limit = 5,
): Promise<ReviewPage> {
  const nowMs = Date.now();
  const own = ctx.own.filter(
    (r) => r.subject === "rider" && r.subjectId === riderId && !r.deletedAt,
  );
  const corpus = [...own, ...buildRiderReviews(riderId, nowMs)]
    .filter((r) => visible(r, ctx))
    .map((r) => withContext(r, ctx));
  const sorted = sortReviews(corpus, "recent");

  return mockDelay(
    {
      nowMs,
      summary: summarise(corpus),
      items: sorted.slice(0, limit),
      total: corpus.length,
      hasMore: corpus.length > limit,
      loved: [],
    },
    200,
  );
}

/**
 * Orders still owed a review, newest delivery first — the account page's
 * "rate your last orders" list and the source of the badge on it.
 */
export async function getPendingReviews(
  orders: Order[],
  ctx: ReviewContext,
): Promise<{ nowMs: number; pending: PendingReview[] }> {
  const nowMs = Date.now();
  const reviewed = new Set(ctx.own.map((r) => r.orderId).filter(Boolean));
  const pending = orders
    .filter((order) => canReviewOrder(order, nowMs, reviewed.has(order.id)))
    .map((order) => ({ order, daysLeft: reviewDaysLeft(order, nowMs) }))
    .sort((a, b) => (orderClosedAt(b.order) ?? 0) - (orderClosedAt(a.order) ?? 0));

  return mockDelay({ nowMs, pending }, 150);
}

/**
 * Everything this device has written, newest first.
 *
 * Unlike every other read in this file, this one does **not** drop moderated
 * reviews: they are the author's own words and hiding them from the person who
 * wrote them would leave a review that is invisible everywhere and explained
 * nowhere. The status travels beside the list instead, so the account page can
 * say what happened (Phase 13).
 */
export async function getMyReviews(
  ctx: ReviewContext,
): Promise<{
  nowMs: number;
  reviews: Review[];
  moderation: Record<string, ReviewModerationStatus>;
}> {
  const nowMs = Date.now();
  const reviews = sortReviews(
    ctx.own.filter((r) => !r.deletedAt).map((r) => withContext(r, ctx)),
    "recent",
  );
  const moderation: Record<string, ReviewModerationStatus> = {};
  for (const review of reviews) {
    const record = ctx.moderation[review.id];
    if (record) moderation[review.id] = record.status;
  }
  return mockDelay({ nowMs, reviews, moderation }, 150);
}

/**
 * The photos the write form can attach.
 *
 * A browser prototype has no camera roll worth wiring, so "add a photo" picks
 * from a small library instead of uploading. It goes through the seam rather
 * than reaching into `lib/mock` from a component (the house rule), which also
 * means the real upload endpoint slots in here without touching the form.
 */
export async function getPhotoLibrary(): Promise<ReviewMedia[]> {
  return mockDelay(
    SAMPLE_REVIEW_PHOTOS.map((url, index) => ({
      id: `rvm_lib_${index}`,
      kind: "photo" as const,
      url,
      thumbnail: url,
    })),
    150,
  );
}

/** The dishes on an order, for the "which of these did you love?" picker. */
export async function getReviewableDishes(order: Order): Promise<FoodItem[]> {
  const items = order.lines
    .map((line) => foodById.get(line.foodId))
    .filter((f): f is FoodItem => Boolean(f) && !f!.deletedAt);
  // One order can carry the same dish on two lines (different options).
  const unique = new Map(items.map((f) => [f.id, f]));
  return mockDelay([...unique.values()], 100);
}

// ---- Customer mutations ----------------------------------------------------

/** Shared shape checks — the rules a review's *content* must satisfy. */
function validateDraft(draft: ReviewDraft): string | null {
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) {
    return "errors.ratingRequired";
  }
  const comment = draft.comment.trim();
  if (comment.length > 0 && comment.length < MIN_COMMENT_LENGTH) {
    return "errors.commentTooShort";
  }
  if (comment.length > MAX_COMMENT_LENGTH) return "errors.commentTooLong";
  if (draft.media.length > MAX_REVIEW_MEDIA) return "errors.tooMuchMedia";
  if (draft.riderRating !== null && (draft.riderRating < 1 || draft.riderRating > 5)) {
    return "errors.ratingRequired";
  }
  return null;
}

/** A review and, when the customer scored the courier too, the rider's copy. */
export interface SubmittedReview {
  review: Review;
  riderReview: Review | null;
}

/**
 * Write a review for a finished order.
 *
 * Rating the courier is part of the same submission but a *separate row*: the
 * restaurant should not be judged on a late rider, and the rider should not
 * carry a kitchen's cold food. One form, two subjects — which is exactly why
 * `Review.subject` exists.
 */
export async function submitReview(
  order: Order,
  draft: ReviewDraft,
  author: ReviewAuthor,
  ctx: ReviewContext,
): Promise<Result<SubmittedReview>> {
  await mockDelay(null, 450);
  const nowMs = Date.now();

  const invalid = validateDraft(draft);
  if (invalid) return { data: null, error: invalid };

  if (order.status !== "delivered" && order.status !== "completed") {
    return { data: null, error: "errors.notDelivered" };
  }
  if (ctx.own.some((r) => r.orderId === order.id && r.subject === "vendor" && !r.deletedAt)) {
    return { data: null, error: "errors.alreadyReviewed" };
  }
  if (reviewDaysLeft(order, nowMs) === 0) return { data: null, error: "errors.windowClosed" };

  const iso = new Date(nowMs).toISOString();
  const stamp = nowMs.toString(36);
  const review: Review = {
    id: `rev_${order.id}_${stamp}`,
    subject: "vendor",
    subjectId: order.vendor.id,
    vendorId: order.vendor.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    authorId: author.id,
    authorName: author.name,
    authorAvatar: author.avatar,
    rating: draft.rating,
    aspects: draft.aspects,
    comment: draft.comment.trim(),
    tags: draft.tags,
    dishIds: draft.dishIds,
    media: draft.media.slice(0, MAX_REVIEW_MEDIA),
    helpfulCount: 0,
    reply: null,
    // Written against an order this device actually placed — the definition of
    // a verified review, and the reason the badge means something.
    verified: true,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };

  const rider = order.lifecycle.rider;
  const riderReview: Review | null =
    draft.riderRating !== null && rider
      ? {
          ...review,
          id: `rev_${order.id}_rider_${stamp}`,
          subject: "rider",
          subjectId: rider.id,
          rating: draft.riderRating,
          aspects: { delivery: draft.riderRating },
          // The courier is not answerable for what the kitchen cooked, so the
          // comment and dishes stay with the restaurant's review.
          comment: "",
          tags: [],
          dishIds: [],
          media: [],
        }
      : null;

  return ok({ review, riderReview });
}

/**
 * Change a review already written. Refuses one the restaurant has answered — the
 * public reply is a response to specific words, and rewriting them afterwards
 * would misrepresent both sides (`lib/reviews.canEditReview`).
 */
export async function updateReview(
  reviewId: string,
  draft: ReviewDraft,
  ctx: ReviewContext,
): Promise<Result<Review>> {
  await mockDelay(null, 400);
  const nowMs = Date.now();

  const existing = ctx.own.find((r) => r.id === reviewId && !r.deletedAt);
  if (!existing) return { data: null, error: "errors.notFound" };

  const invalid = validateDraft(draft);
  if (invalid) return { data: null, error: invalid };
  if (!canEditReview(withContext(existing, ctx), nowMs)) {
    return { data: null, error: "errors.editLocked" };
  }

  return ok({
    ...existing,
    rating: draft.rating,
    aspects: draft.aspects,
    comment: draft.comment.trim(),
    tags: draft.tags,
    dishIds: draft.dishIds,
    media: draft.media.slice(0, MAX_REVIEW_MEDIA),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

/**
 * Withdraw a review. Soft-deleted rather than dropped, because the row is what
 * proves the order was already reviewed — a hard delete would let the same order
 * be rated again and again.
 */
export async function deleteReview(
  reviewId: string,
  ctx: ReviewContext,
): Promise<Result<{ reviewId: string; deletedAt: string }>> {
  await mockDelay(null, 300);
  const existing = ctx.own.find((r) => r.id === reviewId && !r.deletedAt);
  if (!existing) return { data: null, error: "errors.notFound" };
  return ok({ reviewId, deletedAt: new Date().toISOString() });
}

/**
 * Vote a review useful. One vote per device per review, and never on your own —
 * both refused here rather than by hiding the button, because a real endpoint
 * has to hold that line for an API client too.
 */
export async function markHelpful(
  reviewId: string,
  ctx: ReviewContext,
): Promise<Result<{ reviewId: string }>> {
  await mockDelay(null, 200);
  if (ctx.helpful.includes(reviewId)) return { data: null, error: "errors.alreadyVoted" };
  // Ownership is what the device wrote — there is no server session to ask, and
  // a review this browser holds is by definition this customer's.
  if (ctx.own.some((r) => r.id === reviewId)) return { data: null, error: "errors.ownReview" };
  return ok({ reviewId });
}

/**
 * Check that a review may be reported before the store writes the report
 * (Phase 13).
 *
 * The report itself is a *moderation* write and goes through
 * `stores/review-moderation`, which runs `lib/review-moderation.reportReviewRecord`
 * — the same function the seeded queue is built with. What is left here is the
 * part that belongs to the seam: the device-local "you already flagged this"
 * guard, and the rule that a review already taken down cannot be reported again
 * because there is nothing further to decide.
 */
export async function reportReview(
  reviewId: string,
  reported: string[],
  ctx: ReviewContext = emptyContext(),
): Promise<Result<{ reviewId: string }>> {
  await mockDelay(null, 350);
  if (reported.includes(reviewId)) return { data: null, error: "errors.alreadyReported" };
  const record = ctx.moderation[reviewId];
  if (record && !isReviewVisible(record)) {
    return { data: null, error: "errors.alreadyModerated" };
  }
  return ok({ reviewId });
}

// ---- Merchant --------------------------------------------------------------

/** The vendor's review desk: the aggregate, the trend and the reviews themselves. */
export interface VendorReviewBoard {
  nowMs: number;
  summary: ReviewSummary;
  items: Review[];
  total: number;
  hasMore: boolean;
  trend: RatingPoint[];
  totals: {
    /** Reviews on hand that carry no reply. */
    unanswered: number;
    /** Share of the corpus answered, 0–1. */
    replyRate: number;
    /** Reviews in the current calendar month. */
    thisMonth: number;
    /** Reviews at 2★ or below — the ones that need a person today. */
    critical: number;
  };
}

/**
 * A restaurant's reviews as the merchant sees them: the same corpus the
 * storefront renders, same summary, same ordering rules — so a merchant reading
 * "4.8 from 1,284" on their dashboard is reading what their customers read.
 */
export async function getVendorReviewBoard(
  vendorId: string,
  ctx: ReviewContext,
  query: ReviewQuery = {},
): Promise<VendorReviewBoard> {
  const nowMs = Date.now();
  const vendor = vendorById.get(vendorId);
  const { all, own, catalogue } = vendorCorpus(vendorId, ctx, nowMs);

  const filtered = filterReviews(all, { ...allReviews(), ...query.filter });
  const sorted = sortReviews(filtered, query.sort ?? "recent");
  const { slice, hasMore } = pageOf(sorted, query.page ?? 1, query.pageSize ?? 8);

  const month = new Date(nowMs);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).getTime();

  return mockDelay({
    nowMs,
    summary: vendor
      ? summariseVendor(vendor.rating, vendor.reviewCount, catalogue, own)
      : summarise(all),
    items: slice,
    total: filtered.length,
    hasMore,
    trend: ratingTrend(all, nowMs),
    totals: {
      unanswered: all.filter((r) => !r.reply).length,
      replyRate: all.length === 0 ? 0 : all.filter((r) => r.reply).length / all.length,
      thisMonth: all.filter((r) => Date.parse(r.createdAt) >= monthStart).length,
      critical: all.filter((r) => r.rating <= 2).length,
    },
  });
}

/**
 * Answer a review publicly. One reply per review (a thread is a support
 * conversation, not a review), and only on a review of your own restaurant.
 */
export async function replyToReview(
  vendorId: string,
  reviewId: string,
  body: string,
  ctx: ReviewContext,
): Promise<Result<{ reviewId: string; reply: ReviewReply }>> {
  await mockDelay(null, 450);
  const nowMs = Date.now();

  const trimmed = body.trim();
  if (trimmed.length < MIN_REPLY_LENGTH) return { data: null, error: "errors.replyTooShort" };
  if (trimmed.length > MAX_REPLY_LENGTH) return { data: null, error: "errors.replyTooLong" };

  const review = vendorCorpus(vendorId, ctx, nowMs).all.find((r) => r.id === reviewId);
  if (!review || review.vendorId !== vendorId) return { data: null, error: "errors.notFound" };
  if (review.reply) return { data: null, error: "errors.alreadyReplied" };

  const vendor = vendorById.get(vendorId);
  return ok({
    reviewId,
    reply: {
      body: trimmed,
      authorName: vendor?.name ?? "",
      repliedAt: new Date(nowMs).toISOString(),
    },
  });
}

// ---- Moderation queue (Phase 13, G29) --------------------------------------

/** The moderation queue at one instant. */
export interface ModerationQueue {
  /** The instant every corpus, status and date was read at. */
  nowMs: number;
  rows: ReviewQueueRow[];
  /** Rows per segment before the segment filter — the counts on the chips. */
  counts: Record<ReviewQueueSegment, number>;
  totals: {
    /** Reviews with a record, whatever their state. */
    reported: number;
    pending: number;
    hidden: number;
    removed: number;
    /** Reports raised across all of them. */
    reports: number;
    /** Restaurants with at least one reported review. */
    vendors: number;
  };
  /**
   * Records whose review can no longer be resolved to a corpus row. Counted
   * rather than rendered as holes (the C23 favorites convention) — it happens if
   * a device-written review is withdrawn after being reported.
   */
  unresolved: number;
}

/** The restaurant behind a reported review, resolved for display. */
function queueVendor(vendorId: string): ReviewQueueVendor | null {
  const vendor = vendorById.get(vendorId);
  if (!vendor || vendor.deletedAt) return null;
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    rating: vendor.rating,
    reviewCount: vendor.reviewCount,
  };
}

/**
 * The order behind a reported review — the moderator's only hard evidence that
 * the reviewer ever bought anything.
 *
 * `orders` is passed in from the shared store rather than looked up here, exactly
 * as the Phase 11 customer directory takes it: the seam has no session and no
 * database, and a component that already holds the orders must not be made to
 * hand over a copy of the whole store twice.
 */
function queueOrder(review: Review, orders: Order[]): { order: ReviewQueueOrder | null; phone: string | null } {
  const match = review.orderId
    ? orders.find((o) => o.id === review.orderId && !o.deletedAt)
    : undefined;
  if (!match) return { order: null, phone: null };
  return {
    order: {
      id: match.id,
      orderNumber: match.orderNumber,
      status: match.status,
      placedAt: match.placedAt,
      total: match.pricing.total,
      currency: match.pricing.currency,
    },
    phone: match.contact.phone,
  };
}

/**
 * Resolve every moderation record into a queue row.
 *
 * The joins are the point of this function, and they are done once per subject
 * rather than once per record: a restaurant's corpus is synthesised, so
 * `buildVendorReviews` is memoised per vendor for the length of the call. A
 * record whose review cannot be found is dropped and counted, never rendered as
 * an empty card.
 */
function resolveQueue(
  ctx: ReviewContext,
  orders: Order[],
  nowMs: number,
): { rows: ReviewQueueRow[]; unresolved: number } {
  const records = Object.values(ctx.moderation);
  const corpora = new Map<string, Review[]>();

  const corpusFor = (record: ReviewModerationRecord): Review[] => {
    const key = `${record.subject}:${record.subjectId}`;
    const cached = corpora.get(key);
    if (cached) return cached;
    const built =
      record.subject === "vendor"
        ? buildVendorReviews(record.subjectId, nowMs)
        : buildRiderReviews(record.subjectId, nowMs);
    corpora.set(key, built);
    return built;
  };

  // Pass one: find the review each record is about.
  const found: { record: ReviewModerationRecord; review: Review }[] = [];
  let unresolved = 0;
  for (const record of records) {
    const own = ctx.own.find((r) => r.id === record.reviewId && !r.deletedAt);
    const review = own ?? corpusFor(record).find((r) => r.id === record.reviewId);
    if (!review) {
      unresolved++;
      continue;
    }
    found.push({ record, review: withContext(review, ctx) });
  }

  // Pass two: the author's history *across the queue*, which needs every record
  // resolved first — "this is their third reported review" is exactly the fact a
  // moderator decides on, and it cannot be counted one row at a time.
  const byAuthor = new Map<string, { reported: number; actioned: number }>();
  for (const { record, review } of found) {
    const tally = byAuthor.get(review.authorId) ?? { reported: 0, actioned: 0 };
    tally.reported++;
    if (record.status === "hidden" || record.status === "removed") tally.actioned++;
    byAuthor.set(review.authorId, tally);
  }

  const rows = found.map(({ record, review }) => {
    const { order, phone } = queueOrder(review, orders);
    const tally = byAuthor.get(review.authorId) ?? { reported: 0, actioned: 0 };
    const normalised = phone ? normalisePhone(phone) : "";
    const author: ReviewQueueAuthor = {
      id: review.authorId,
      name: review.authorName,
      avatar: review.authorAvatar,
      verified: review.verified,
      reviewsHere: corpusFor(record).filter((r) => r.authorId === review.authorId).length,
      reported: tally.reported,
      actioned: tally.actioned,
      // Only when the order behind the review is one the prototype still holds:
      // the join is the normalised phone, the Phase 11 identity, and inventing a
      // customer id from an author name would be a link that goes nowhere.
      customerId: normalised ? customerIdFor(normalised) : null,
      phone: phone ?? null,
    };
    return { review, record, vendor: queueVendor(record.vendorId), order, author };
  });

  return { rows, unresolved };
}

/**
 * The moderation queue: every reported review, with the decision on it and the
 * context to make one (G29).
 *
 * Defaults to `pending`, sorted by how many people objected — the two things that
 * decide what a moderator looks at first. Everything else on the screen is a
 * filter over the same resolved rows, so a count and a list can never disagree.
 */
export async function getModerationQueue(
  ctx: ReviewContext,
  orders: Order[],
  query: Partial<ReviewQueueQuery> = {},
): Promise<ModerationQueue> {
  const nowMs = Date.now();
  const full: ReviewQueueQuery = { ...EMPTY_QUEUE_QUERY, ...query };
  const { rows, unresolved } = resolveQueue(ctx, orders, nowMs);

  return mockDelay(
    {
      nowMs,
      rows: filterQueue(rows, full),
      counts: countBySegment(rows, full),
      totals: {
        reported: rows.length,
        pending: rows.filter((r) => r.record.status === "pending").length,
        hidden: rows.filter((r) => r.record.status === "hidden").length,
        removed: rows.filter((r) => r.record.status === "removed").length,
        reports: rows.reduce((n, r) => n + r.record.reports.length, 0),
        vendors: new Set(rows.map((r) => r.record.vendorId).filter(Boolean)).size,
      },
      unresolved,
    },
    200,
  );
}

/** One reported review, with the same joins the queue resolved — the detail page. */
export async function getModerationRow(
  reviewId: string,
  ctx: ReviewContext,
  orders: Order[],
): Promise<{ nowMs: number; row: ReviewQueueRow | null }> {
  const nowMs = Date.now();
  const { rows } = resolveQueue(ctx, orders, nowMs);
  return mockDelay({ nowMs, row: rows.find((r) => r.review.id === reviewId) ?? null }, 200);
}
