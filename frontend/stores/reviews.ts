"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Review } from "@/frontend/types";
import type { ReviewContext } from "@/frontend/services/reviews";
import { useMerchant } from "./merchant";

/**
 * reviews store — what this browser has said about its orders (Phase C22).
 *
 * It persists three things, and each one maps onto a table Phase E will own:
 * the reviews written here (`reviews`), the reviews found useful (`helpful` — a
 * `review_votes` row keyed on review + user), and the ones flagged (`reported`).
 * Nothing about a *catalogue* review is copied in: the corpus, its aggregate and
 * its status always come from `services/reviews`, so a restaurant's rating can
 * never go stale in a customer's localStorage.
 *
 * Deletions are soft (`deletedAt`), because the row is what proves an order has
 * already been reviewed — dropping it would let the same order be rated twice.
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */
interface ReviewsState {
  reviews: Review[];
  /** Review ids this device voted helpful. */
  helpful: string[];
  /** Review ids this device reported. */
  reported: string[];
  hydrated: boolean;

  /** Commit a newly written review (and, when rated, the courier's copy). */
  addReview: (...reviews: Review[]) => void;
  /** Replace an edited review in place. */
  replaceReview: (review: Review) => void;
  /** Withdraw a review — soft, so the order stays "already reviewed". */
  removeReview: (reviewId: string, deletedAt: string) => void;
  toggleHelpful: (reviewId: string) => void;
  markReported: (reviewId: string) => void;
  setHydrated: () => void;
}

export const useReviews = create<ReviewsState>()(
  persist(
    (set) => ({
      reviews: [],
      helpful: [],
      reported: [],
      hydrated: false,

      addReview: (...incoming) =>
        set((s) => ({
          reviews: [
            ...incoming.filter((r) => !s.reviews.some((existing) => existing.id === r.id)),
            ...s.reviews,
          ],
        })),

      replaceReview: (review) =>
        set((s) => ({
          reviews: s.reviews.map((r) => (r.id === review.id ? review : r)),
        })),

      removeReview: (reviewId, deletedAt) =>
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === reviewId ? { ...r, deletedAt, updatedAt: deletedAt } : r,
          ),
        })),

      toggleHelpful: (reviewId) =>
        set((s) => ({
          helpful: s.helpful.includes(reviewId)
            ? s.helpful.filter((id) => id !== reviewId)
            : [...s.helpful, reviewId],
        })),

      markReported: (reviewId) =>
        set((s) =>
          s.reported.includes(reviewId) ? {} : { reported: [...s.reported, reviewId] },
        ),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-reviews",
      partialize: (s) => ({
        reviews: s.reviews,
        helpful: s.helpful,
        reported: s.reported,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * The `ReviewContext` every call into `services/reviews` takes.
 *
 * The merchant's replies live in the *merchant* store (they are a vendor-desk
 * write, alongside the 86-list and the coupon book), but a reply is public — the
 * customer reading the storefront has to see it. Joining the two here, once,
 * is what keeps both surfaces reading the same review; the alternative is every
 * component remembering to merge two stores, and one of them forgetting.
 *
 * Returned memoised so it can be an effect dependency: a new reply or a new vote
 * changes the identity and the surface refetches, nothing else does.
 *
 * With a backend the reply is a column on the row and this joins nothing.
 */
export function useReviewContext(): ReviewContext {
  const own = useReviews((s) => s.reviews);
  const helpful = useReviews((s) => s.helpful);
  const replies = useMerchant((s) => s.reviewReplies);
  return useMemo(() => ({ own, replies, helpful }), [own, replies, helpful]);
}
