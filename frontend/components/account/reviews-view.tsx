"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, PenLine, Star, Trash2 } from "lucide-react";
import type { Order, Review } from "@/types";
import type { PendingReview } from "@/services/reviews";
import { deleteReview, getMyReviews, getPendingReviews } from "@/services/reviews";
import { useOrders } from "@/stores/orders";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { canEditReview } from "@/lib/reviews";
import { Button } from "@/components/ui/button";
import { ReviewCard, EditReviewButton } from "@/components/reviews/review-card";
import { Stars } from "@/components/reviews/stars";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";

/**
 * ReviewsView — the customer's own reviews (`/account/reviews`, Phase C22).
 *
 * Two lists, because a review page is really two questions: what still owes a
 * review, and what I have already said. The first is the one that gets acted on,
 * so it goes on top and carries the days remaining — a review window that closes
 * silently is a window nobody knew about.
 *
 * Both come from `services/reviews`: which orders are reviewable, whether a
 * review can still be edited and what the deadline is are all the seam's rules,
 * not this component's.
 */
export function ReviewsView() {
  const t = useTranslations("reviews");
  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const reviewsHydrated = useReviews((s) => s.hydrated);
  const ctx = useReviewContext();
  const removeReview = useReviews((s) => s.removeReview);

  const [pending, setPending] = useState<PendingReview[]>([]);
  const [mine, setMine] = useState<Review[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState<{ order: Order; existing: Review | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useReviews.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!ordersHydrated || !reviewsHydrated) return;
    let live = true;
    Promise.all([getPendingReviews(orders, ctx), getMyReviews(ctx)]).then(
      ([pendingRes, mineRes]) => {
        if (!live) return;
        setPending(pendingRes.pending);
        setMine(mineRes.reviews);
        setNowMs(pendingRes.nowMs);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [orders, ordersHydrated, reviewsHydrated, ctx]);

  function withdraw(review: Review) {
    setBusyId(review.id);
    deleteReview(review.id, ctx).then((res) => {
      setBusyId(null);
      if (!res.data) {
        toast.error(t(res.error ?? "errors.notFound"));
        return;
      }
      removeReview(res.data.reviewId, res.data.deletedAt);
      toast.success(t("deleted"));
    });
  }

  /** The order a review was written against, so editing reopens the same form. */
  function orderFor(review: Review): Order | null {
    return orders.find((order) => order.id === review.orderId) ?? null;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Waiting to be rated */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("pendingTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("pendingHint")}</p>
          <ul className="mt-3 space-y-3">
            {pending.map(({ order, daysLeft }) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-5"
              >
                <div className="min-w-0">
                  <Link
                    href={`/restaurants/${order.vendor.slug}`}
                    className="font-semibold text-ink hover:text-primary"
                  >
                    {order.vendor.name}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted">
                    {t("orderRef", { number: order.orderNumber })} ·{" "}
                    {t("daysLeft", { count: daysLeft })}
                  </p>
                  <p className="mt-1 truncate text-sm text-body">
                    {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
                  </p>
                </div>
                <Button size="sm" onClick={() => setWriting({ order, existing: null })}>
                  <Star className="size-4" aria-hidden />
                  {t("rateOrder")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Already written */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          {t("mineTitle")}
        </h2>
        {mine.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-surface py-14 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
              <PenLine className="size-7" aria-hidden />
            </span>
            <p className="text-lg font-semibold text-ink">{t("mineEmptyTitle")}</p>
            <p className="max-w-sm text-body">{t("mineEmptyBody")}</p>
            <Button href="/account/orders" className="mt-2">
              {t("seeOrders")}
            </Button>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {mine.map((review) => {
              const order = orderFor(review);
              const editable = order !== null && canEditReview(review, nowMs);
              return (
                <li key={review.id}>
                  <ReviewCard
                    review={review}
                    nowMs={nowMs}
                    actions={
                      <>
                        {editable && (
                          <EditReviewButton
                            label={t("edit")}
                            onClick={() => setWriting({ order, existing: review })}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => withdraw(review)}
                          disabled={busyId === review.id}
                          aria-label={t("delete")}
                          className="inline-flex size-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                        >
                          {busyId === review.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </button>
                      </>
                    }
                  />
                  {/* Which restaurant, and how the courier scored, live under the
                      card — on a storefront both are obvious from context, here
                      neither is. */}
                  <p className="mt-1 px-5 text-xs text-muted">
                    {review.subject === "rider" ? (
                      t("aboutRider")
                    ) : (
                      <>
                        {t("aboutVendor", { vendor: vendorNameOf(review, orders) })}
                        {review.reply && ` · ${t("editLockedHint")}`}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Average of everything this account has said — a light mirror back */}
      {mine.length > 1 && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          {t("yourAverage")}
          <Stars value={average(mine)} size="sm" />
        </p>
      )}

      {writing && (
        <WriteReviewDialog
          order={writing.order}
          existing={writing.existing}
          open
          onClose={() => setWriting(null)}
        />
      )}
    </div>
  );
}

function average(reviews: Review[]): number {
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

/** The restaurant a review is about, from the order it was written against. */
function vendorNameOf(review: Review, orders: Order[]): string {
  return orders.find((order) => order.id === review.orderId)?.vendor.name ?? "";
}
