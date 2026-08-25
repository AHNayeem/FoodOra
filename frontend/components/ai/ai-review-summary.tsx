"use client";

import { useEffect, useState } from "react";
import type { AiReviewSummary as Summary } from "@/types";
import { getReviewSummary } from "@/services/ai";
import { useReviewContext, useReviews } from "@/stores/reviews";
import { useReviewModeration } from "@/stores/review-moderation";
import { ReviewSummaryBody } from "./assistant-blocks";
import { AskAssistantButton } from "./assistant-mount";

/**
 * AiReviewSummary — the band above a restaurant's reviews (spec: AI Review
 * Summary).
 *
 * A client component for the same reason `VendorReviews` is one: it reads the
 * *same* corpus through the *same* seam, including the reviews written on this
 * device and the replies the merchant left in the dashboard. A server-rendered
 * summary would have been simpler and would have quietly described a different
 * set of reviews than the list directly beneath it.
 *
 * It renders nothing until it has an answer and nothing at all for a restaurant
 * with too few reviews to summarise — three reviews do not have themes, and
 * inventing some is exactly the failure this phase is written against.
 */
export function AiReviewSummary({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const ctx = useReviewContext();
  const hydrated = useReviews((s) => s.hydrated);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    useReviews.persist.rehydrate();
    // Phase 13: so a review the platform took down is not counted here.
    void useReviewModeration.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    void getReviewSummary(vendorId, ctx).then(({ data }) => {
      if (live && data) setSummary(data);
    });
    return () => {
      live = false;
    };
  }, [vendorId, ctx, hydrated]);

  if (!summary || summary.reviewCount < 5) return null;

  return (
    <section className="mt-10 rounded-panel border border-line bg-surface p-4 sm:p-5">
      <ReviewSummaryBody summary={summary} vendorName={vendorName} />
      <div className="mt-4">
        <AskAssistantButton vendorId={vendorId} />
      </div>
    </section>
  );
}
