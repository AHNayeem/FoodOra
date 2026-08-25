"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Flag,
  Loader2,
  MessageSquare,
  MessageSquareReply,
  Star,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import type { Review, ReviewSort, StarValue } from "@/types";
import type { VendorReviewBoard } from "@/services/reviews";
import { getVendorReviewBoard, replyToReview } from "@/services/reviews";
import { MAX_REPLY_LENGTH } from "@/lib/reviews";
import { formatRating } from "@/lib/format";
import { useMerchant } from "@/stores/merchant";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RatingSummary } from "@/components/reviews/rating-summary";
import { ReviewCard } from "@/components/reviews/review-card";
import { ReportReviewDialog } from "@/components/reviews/report-review-dialog";
import { Stars } from "@/components/reviews/stars";
import { useDashboard } from "../dashboard-context";
import { StatCard } from "../stat-card";
import { RatingTrendChart } from "./rating-trend-chart";

type Tab = "all" | "unanswered" | "critical" | "photos";
const TABS: readonly Tab[] = ["all", "unanswered", "critical", "photos"];
const SORTS: readonly ReviewSort[] = ["recent", "lowest", "highest", "helpful"];
const PAGE_SIZE = 8;

/**
 * ReviewBoard — the merchant's reviews (`/dashboard/reviews`, Phase C22).
 *
 * It reads the *same* corpus and the *same* summary the storefront does, through
 * the same seam call — so the rating a merchant sees on their dashboard is
 * literally the number their customers see under their name. The only thing this
 * surface adds is the ability to answer.
 *
 * The default tab is "needs a reply", because that is the only thing on this
 * page a restaurant can actually do something about today. A reply is one per
 * review and permanent: the seam refuses a second one, and the customer's own
 * review locks once it exists (`lib/reviews.canEditReview`).
 */
export function ReviewBoard() {
  const t = useTranslations("reviews");
  /** Moderation refusals come back as `moderation.errors.*` keys. */
  const tm = useTranslations("moderation");
  const { vendor } = useDashboard();
  const ctx = useReviewContext();
  const addReviewReply = useMerchant((s) => s.addReviewReply);
  /**
   * Phase 13: a restaurant is the party most likely to be libelled by a review,
   * and until now it had no way to say so — the flag existed only on the customer
   * side. Reporting from here puts the row in the platform's queue with
   * `byRole: "vendor"`, which is how a moderator knows who is objecting.
   */
  const reportToModeration = useReviewModeration((s) => s.report);
  const reportedIds = useReviews((s) => s.reported);
  const markReported = useReviews((s) => s.markReported);

  const [board, setBoard] = useState<VendorReviewBoard | null>(null);
  const [tab, setTab] = useState<Tab>("unanswered");
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [star, setStar] = useState<StarValue | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Review | null>(null);

  useEffect(() => {
    useReviews.persist.rehydrate();
    useMerchant.persist.rehydrate();
    // Without this the board's first render would count a review the platform
    // has already taken down (Phase 13).
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    let live = true;
    getVendorReviewBoard(vendor.id, ctx, {
      sort,
      page: pageNo,
      pageSize: PAGE_SIZE,
      filter: {
        stars: star,
        unansweredOnly: tab === "unanswered",
        withMedia: tab === "photos",
      },
    }).then((next) => {
      if (!live) return;
      // The critical tab is a rating band, not a single star — filtered here
      // rather than adding a fifth field to `ReviewFilter` that only one surface
      // would ever set.
      setBoard(
        tab === "critical"
          ? { ...next, items: next.items.filter((r) => r.rating <= 2) }
          : next,
      );
    });
    return () => {
      live = false;
    };
  }, [vendor.id, ctx, sort, star, tab, pageNo]);

  function narrow(next: Tab) {
    setTab(next);
    setPageNo(1);
    setReplyingTo(null);
  }

  if (!board) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("boardTitle")}</h1>
        <p className="text-sm text-muted">{t("boardSubtitle", { vendor: vendor.name })}</p>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("kpiAverage")}
          value={formatRating(board.summary.average)}
          icon={Star}
          hint={t("basedOn", { count: board.summary.count })}
        />
        <StatCard
          label={t("kpiUnanswered")}
          value={String(board.totals.unanswered)}
          icon={MessageSquare}
          hint={t("kpiReplyRate", { percent: Math.round(board.totals.replyRate * 100) })}
        />
        <StatCard
          label={t("kpiThisMonth")}
          value={String(board.totals.thisMonth)}
          icon={ThumbsUp}
          hint={t("kpiThisMonthHint")}
        />
        <StatCard
          label={t("kpiCritical")}
          value={String(board.totals.critical)}
          icon={TriangleAlert}
          hint={t("kpiCriticalHint")}
        />
      </div>

      {/* The aggregate + the trend, side by side */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold text-ink">{t("breakdownTitle")}</h2>
          <RatingSummary summary={board.summary} className="md:grid-cols-1 lg:grid-cols-[minmax(0,200px)_1fr]" />
        </section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold text-ink">{t("trendTitle")}</h2>
          <RatingTrendChart data={board.trend} />
        </section>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t("boardTitle")} className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => narrow(key)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition-colors",
                tab === key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {t(`boardTab.${key}`)}
            </button>
          ))}
        </div>

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

        {star !== null && (
          <button
            type="button"
            onClick={() => {
              setStar(null);
              setPageNo(1);
            }}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      {/* The reviews */}
      {board.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line bg-surface py-16 text-center">
          <MessageSquare className="size-8 text-muted" aria-hidden />
          <p className="font-semibold text-ink">{t(`boardEmpty.${tab}`)}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {board.items.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                nowMs={board.nowMs}
                actions={
                  <>
                    {!review.reply && replyingTo !== review.id && (
                      <Button size="sm" variant="outline" onClick={() => setReplyingTo(review.id)}>
                        <MessageSquareReply className="size-4" aria-hidden />
                        {t("reply")}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setReporting(review)}
                      disabled={reportedIds.includes(review.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Flag className="size-3.5" aria-hidden />
                      {reportedIds.includes(review.id) ? t("reported") : t("report")}
                    </button>
                  </>
                }
              />
              {replyingTo === review.id && (
                <ReplyForm
                  review={review}
                  vendorName={vendor.name}
                  onCancel={() => setReplyingTo(null)}
                  onSubmit={(body) =>
                    replyToReview(vendor.id, review.id, body, ctx).then((res) => {
                      if (!res.data) {
                        toast.error(t(res.error ?? "errors.notFound"));
                        return false;
                      }
                      addReviewReply(res.data.reviewId, res.data.reply);
                      setReplyingTo(null);
                      toast.success(t("replySent"));
                      return true;
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {board.hasMore && tab !== "critical" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setPageNo((n) => n + 1)}>
            {t("loadMore")}
          </Button>
        </div>
      )}

      <ReportReviewDialog
        open={reporting !== null}
        onClose={() => setReporting(null)}
        onConfirm={(reason, note) => {
          if (!reporting) return;
          const written = reportToModeration(reporting, {
            reason,
            note,
            // The restaurant's name, not the staff member's — the same signature a
            // public reply carries, and the dedupe key that stops one vendor
            // objecting twice to the same review.
            by: vendor.name,
            byRole: "vendor",
          });
          if (written.error) {
            toast.error(tm(written.error));
            return;
          }
          markReported(reporting.id);
          setReporting(null);
          toast.success(t("reportThanks"));
        }}
      />
    </div>
  );
}

/** The inline answer box. Opens under the review it answers, never in a modal. */
function ReplyForm({
  review,
  vendorName,
  onCancel,
  onSubmit,
}: {
  review: Review;
  vendorName: string;
  onCancel: () => void;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const t = useTranslations("reviews");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-2 rounded-card border border-line bg-surface-alt p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        onSubmit(body).then((sent) => {
          setBusy(false);
          if (sent) setBody("");
        });
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        {t("replyingTo", { name: review.authorName })}
        <Stars value={review.rating} size="sm" />
      </div>
      <label className="block">
        <span className="sr-only">{t("replyLabel")}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={MAX_REPLY_LENGTH}
          placeholder={t("replyPlaceholder")}
          className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted">{t("replySignature", { vendor: vendorName })}</p>
        <div className="ms-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy || body.trim().length === 0}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("sendReply")}
          </Button>
        </div>
      </div>
    </form>
  );
}
