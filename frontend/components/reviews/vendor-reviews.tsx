"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, MessageSquare, PenLine, Star } from "lucide-react";
import type { Order, Review, ReviewReportReason, ReviewSort, StarValue } from "@/types";
import type { ReviewPage } from "@/services/reviews";
import {
  getPendingReviews,
  getVendorReviews,
  markHelpful,
  reportReview,
} from "@/services/reviews";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { formatRating } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportReviewDialog } from "./report-review-dialog";
import { RatingSummary } from "./rating-summary";
import { ReviewCard } from "./review-card";
import { WriteReviewDialog } from "./write-review-dialog";

const PAGE_SIZE = 6;
const SORTS: readonly ReviewSort[] = ["recent", "helpful", "highest", "lowest"];

/**
 * VendorReviews — the reviews band on a restaurant page (Phase C22).
 *
 * A client component because everything on it is a question about *this*
 * reader: which star they filtered to, whether they already voted a review
 * helpful, and whether they have an order here that still owes a review. The
 * page around it stays server-rendered.
 *
 * Every read goes back through `services/reviews` rather than being filtered in
 * place, so the summary above the list always describes the same corpus the list
 * came from — including the reviews written on this device and the replies the
 * merchant wrote in the dashboard.
 */
export function VendorReviews({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const t = useTranslations("reviews");
  /** Moderation refusals come back as `moderation.errors.*` keys. */
  const tm = useTranslations("moderation");
  const ctx = useReviewContext();
  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const reviewsHydrated = useReviews((s) => s.hydrated);
  const helpful = useReviews((s) => s.helpful);
  const reported = useReviews((s) => s.reported);
  const toggleHelpful = useReviews((s) => s.toggleHelpful);
  const markReported = useReviews((s) => s.markReported);
  // Phase 13: a report is now a real moderation row rather than a thank-you.
  const reportToModeration = useReviewModeration((s) => s.report);
  const reader = useAuth((s) => s.user);

  const [page, setPage] = useState<ReviewPage | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [star, setStar] = useState<StarValue | null>(null);
  const [withMedia, setWithMedia] = useState(false);
  const [pending, setPending] = useState<Order | null>(null);
  const [writing, setWriting] = useState(false);
  const [reporting, setReporting] = useState<Review | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    useReviews.persist.rehydrate();
    useOrders.persist.rehydrate();
    useAuth.persist.rehydrate();
    // Phase 13: without this the first render would use an empty moderation map
    // and briefly show a review the platform has taken down.
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    let live = true;
    getVendorReviews(vendorId, ctx, {
      sort,
      filter: { stars: star, withMedia },
      page: pageNo,
      pageSize: PAGE_SIZE,
    }).then((next) => {
      if (live) setPage(next);
    });
    return () => {
      live = false;
    };
  }, [vendorId, ctx, sort, star, withMedia, pageNo]);

  // Is there an order from this restaurant still owed a review? That is the
  // difference between a "write a review" button that works and one that opens a
  // form only to be refused by the seam.
  useEffect(() => {
    if (!ordersHydrated || !reviewsHydrated) return;
    let live = true;
    getPendingReviews(orders, ctx).then(({ pending: list }) => {
      if (!live) return;
      setPending(list.find((entry) => entry.order.vendor.id === vendorId)?.order ?? null);
    });
    return () => {
      live = false;
    };
  }, [orders, ordersHydrated, reviewsHydrated, ctx, vendorId]);

  function vote(review: Review) {
    if (helpful.includes(review.id)) {
      toggleHelpful(review.id);
      return;
    }
    markHelpful(review.id, ctx).then((res) => {
      if (res.error) {
        toast.error(t(res.error));
        return;
      }
      toggleHelpful(review.id);
    });
  }

  /**
   * Report a review, with grounds.
   *
   * Two guards, and they are different questions: the **seam** answers "may this
   * device report this review at all" (already flagged here, already taken down),
   * and the **domain** answers "is this a new objection" (the same reporter
   * cannot object twice). Both refusals are shown as they come back rather than
   * hidden behind a disabled button.
   */
  function submitReport(review: Review, reason: ReviewReportReason, note: string) {
    setReportBusy(true);
    reportReview(review.id, reported, ctx).then((res) => {
      if (res.error) {
        setReportBusy(false);
        toast.error(t(res.error));
        return;
      }
      const written = reportToModeration(review, {
        reason,
        note,
        by: reader?.name ?? "A customer",
        byRole: "customer",
      });
      setReportBusy(false);
      if (written.error) {
        toast.error(tm(written.error));
        return;
      }
      markReported(review.id);
      setReporting(null);
      toast.success(t("reportThanks"));
    });
  }

  function narrow(next: { star?: StarValue | null; media?: boolean }) {
    if (next.star !== undefined) setStar(next.star);
    if (next.media !== undefined) setWithMedia(next.media);
    setPageNo(1);
  }

  return (
    <section id="reviews" className="mt-12 scroll-mt-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-h2 text-ink">
          <Star className="size-5 fill-rating text-rating" aria-hidden />
          {t("sectionTitle")}
        </h2>
        {pending && (
          <Button size="sm" onClick={() => setWriting(true)}>
            <PenLine className="size-4" aria-hidden />
            {t("writeCta")}
          </Button>
        )}
      </div>

      {!page ? (
        <div className="mt-6 flex min-h-40 items-center justify-center rounded-panel border border-line bg-surface">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-panel border border-line bg-surface p-5">
            <RatingSummary
              summary={page.summary}
              activeStar={star}
              onSelectStar={(next) => narrow({ star: next })}
            />
          </div>

          {/* Dishes the corpus keeps praising */}
          {page.loved.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
                {t("lovedTitle")}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-3">
                {page.loved.map((dish) => (
                  <li
                    key={dish.foodId}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface p-2 pe-4"
                  >
                    <Image
                      src={dish.image}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 rounded-card object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink">{dish.name}</p>
                      <p className="text-xs text-muted">
                        ★ {formatRating(dish.average)} · {t("mentions", { count: dish.mentions })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Toolbar */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {star !== null && (
              <FilterChip active onClick={() => narrow({ star: null })}>
                {t("starsShort", { count: star })}
              </FilterChip>
            )}
            <FilterChip active={withMedia} onClick={() => narrow({ media: !withMedia })}>
              <Camera className="size-3.5" aria-hidden />
              {t("filterPhotos")}
            </FilterChip>
            {(star !== null || withMedia) && (
              <button
                type="button"
                onClick={() => narrow({ star: null, media: false })}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("clearFilters")}
              </button>
            )}

            <label className="ms-auto flex items-center gap-2 text-sm text-muted">
              {t("sortBy")}
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as ReviewSort);
                  setPageNo(1);
                }}
                className="h-9 rounded-field border border-line bg-surface px-2 text-sm font-semibold text-ink outline-none focus:border-primary"
              >
                {SORTS.map((option) => (
                  <option key={option} value={option}>
                    {t(`sort.${option}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* The list */}
          {page.items.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-panel border border-dashed border-line bg-surface py-12 text-center">
              <MessageSquare className="size-8 text-muted" aria-hidden />
              <p className="font-semibold text-ink">{t("noneTitle")}</p>
              <p className="max-w-sm text-sm text-body">
                {t("noneBody", { vendor: vendorName })}
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {page.items.map((review) => (
                <li key={review.id}>
                  <ReviewCard
                    review={review}
                    nowMs={page.nowMs}
                    voted={helpful.includes(review.id)}
                    onHelpful={() => vote(review)}
                    onReport={() => setReporting(review)}
                    reported={reported.includes(review.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {page.hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setPageNo((n) => n + 1)}>
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      {pending && (
        <WriteReviewDialog
          order={pending}
          open={writing}
          onClose={() => setWriting(false)}
        />
      )}

      <ReportReviewDialog
        open={reporting !== null}
        submitting={reportBusy}
        onClose={() => setReporting(null)}
        onConfirm={(reason, note) => reporting && submitReport(reporting, reason, note)}
      />
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-line text-body hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
