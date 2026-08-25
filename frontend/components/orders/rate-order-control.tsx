"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Order } from "@/types";
import { useOrders } from "@/stores/orders";
import { useReviews } from "@/stores/reviews";
import { canRateOrder, customerActions, RATING_MAX } from "@/lib/order-machine";
import { StarInput } from "@/components/reviews/stars";
import { Button } from "@/components/ui/button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";

/**
 * RateOrderControl — the customer scoring the meal (Phase 17, G36).
 *
 * `customerActions` has emitted a `rate` action since Phase 1 and no surface has
 * ever rendered it, which is why `Order.lifecycle.rating` had three readers and
 * no writer: the customer's stats, the review surfaces and Phase 16's restaurant
 * league table were all reading a field only the demo seed ever set. This is that
 * action, rendered.
 *
 * **Tapping a star does not publish a review.** Those are two records and two
 * decisions: `lifecycle.rating` is a private score on one order that the platform
 * counts, and a `Review` is a public opinion with a name on it. A five-star tap
 * that silently posted an empty review would misrepresent the customer; a tap
 * that wrote nothing an aggregate reads would be decoration. So the star writes
 * the score, and the invitation to say more is offered next to it — and if they
 * take it, the review form's rating comes back through the *same* store action,
 * so the two numbers cannot diverge.
 */
export function RateOrderControl({ order }: { order: Order }) {
  const t = useTranslations("tracking");
  const rate = useOrders((s) => s.rateOrder);
  const [reviewing, setReviewing] = useState(false);

  // The review form's duplicate guard reads this device's reviews, and the
  // tracker rehydrates neither store. `persist.rehydrate` is idempotent.
  useEffect(() => {
    void useReviews.persist.rehydrate();
  }, []);

  // Asked of the machine rather than of the status, so this control appears
  // exactly where the action list says it should.
  const offered = customerActions(order).some((a) => a.to === "rate");
  const rating = order.lifecycle.rating;

  if (!offered && rating === null) return null;

  function score(value: number) {
    if (!canRateOrder(order)) return;
    const result = rate(order.id, value);
    if (result.error) return;
    toast.success(t("ratingSaved"));
    // A low score is where the detail actually matters, so the form is opened
    // rather than merely offered — the customer who is unhappy is the one worth
    // asking why.
    if (value <= 3) setReviewing(true);
  }

  return (
    <>
      <div className="animate-pop-in mt-4 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">
            {rating === null ? t("rateTitle", { vendor: order.vendor.name }) : t("ratedTitle")}
          </p>
          <p className="mt-0.5 text-sm text-body">
            {rating === null
              ? t("rateHint")
              : t("ratedHint", { rating, max: RATING_MAX })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StarInput
            value={rating ?? 0}
            onChange={score}
            name={`rate-${order.id}`}
            label={t("rateAria", { vendor: order.vendor.name })}
            size="md"
            disabled={rating !== null}
          />
          <Button variant="outline" size="sm" onClick={() => setReviewing(true)}>
            {t("writeReview")}
          </Button>
        </div>
      </div>

      <WriteReviewDialog
        order={order}
        open={reviewing}
        onClose={() => setReviewing(false)}
      />
    </>
  );
}
