"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReviewPage } from "@/services/reviews";
import { getRiderReviews } from "@/services/reviews";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import { formatRating } from "@/lib/format";
import { Stars } from "@/components/reviews/stars";
import { ReviewCard } from "@/components/reviews/review-card";

/**
 * RiderFeedback — what customers said about this courier (Phase C22).
 *
 * The rider is rated on the same form as the restaurant — one order, two
 * subjects — so these are ordinary `Review` rows with `subject: "rider"`, read
 * through the same seam and rendered with the same card. A courier scored on a
 * delivery in the customer app therefore turns up here, which is the whole point
 * of keeping one review model across the three actors.
 */
export function RiderFeedback({ riderId }: { riderId: string }) {
  const t = useTranslations("reviews");
  const ctx = useReviewContext();
  const [page, setPage] = useState<ReviewPage | null>(null);

  useEffect(() => {
    useReviews.persist.rehydrate();
    // Phase 13: so a review the platform took down is not counted here.
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    let live = true;
    getRiderReviews(riderId, ctx, 3).then((next) => live && setPage(next));
    return () => {
      live = false;
    };
  }, [riderId, ctx]);

  if (!page || page.items.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{t("riderFeedbackTitle")}</h2>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          {formatRating(page.summary.average)}
          <Stars value={page.summary.average} size="sm" />
          <span className="font-normal text-muted">
            {t("basedOn", { count: page.total })}
          </span>
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {page.items.map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} nowMs={page.nowMs} className="p-4" />
          </li>
        ))}
      </ul>
    </section>
  );
}
