"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon, ReviewReply } from "@/types";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * merchant store — the vendor desk's local, simulated control state (Phase C10).
 *
 * The prototype has no backend, so the writes a merchant makes from the
 * dashboard — flipping the storefront online/offline, marking a menu item
 * temporarily unavailable, and (Phase C21) issuing or ending a coupon — are
 * persisted here rather than sent to a server.
 * They overlay the read-only mock (a hidden item stays hidden across reloads),
 * exactly as an optimistic client cache would over the Phase E API.
 *
 * Same hydration contract as the other stores: `skipHydration` + an explicit
 * rehydrate in the dashboard shell, gated on `hydrated`, so SSR and the first
 * client render never disagree.
 */
interface MerchantState {
  /** Whether the storefront is accepting orders. */
  online: boolean;
  /** Food ids the merchant has toggled off (86'd) from the live menu. */
  unavailable: string[];
  /** Coupons issued from the dashboard (Phase C21). */
  coupons: Coupon[];
  /**
   * Coupon id → the instant the merchant ended it early. Ending closes the
   * window rather than deleting the row, so the campaign stays readable and its
   * performance still counts — the UPDATE a backend would run.
   */
  couponEndedAt: Record<string, string>;
  /**
   * Public answers to customer reviews (Phase C22): review id → reply. Kept
   * here because replying is a vendor-desk write, and read back by the
   * storefront through `useReviewContext` — a reply the customer cannot see
   * would not be a reply.
   */
  reviewReplies: Record<string, ReviewReply>;
  hydrated: boolean;
  setOnline: (online: boolean) => void;
  toggleItem: (foodId: string) => void;
  addCoupon: (coupon: Coupon) => void;
  endCoupon: (couponId: string, endedAt: string) => void;
  addReviewReply: (reviewId: string, reply: ReviewReply) => void;
  setHydrated: () => void;
}

export const useMerchant = create<MerchantState>()(
  persist(
    (set) => ({
      online: true,
      unavailable: [],
      coupons: [],
      couponEndedAt: {},
      reviewReplies: {},
      hydrated: false,
      setOnline: (online) => set({ online }),
      toggleItem: (foodId) =>
        set((s) => ({
          unavailable: s.unavailable.includes(foodId)
            ? s.unavailable.filter((id) => id !== foodId)
            : [...s.unavailable, foodId],
        })),
      addCoupon: (coupon) => set((s) => ({ coupons: [coupon, ...s.coupons] })),
      endCoupon: (couponId, endedAt) =>
        set((s) => ({ couponEndedAt: { ...s.couponEndedAt, [couponId]: endedAt } })),
      addReviewReply: (reviewId, reply) =>
        set((s) => ({ reviewReplies: { ...s.reviewReplies, [reviewId]: reply } })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-merchant",
      partialize: (s) => ({
        online: s.online,
        unavailable: s.unavailable,
        coupons: s.coupons,
        couponEndedAt: s.couponEndedAt,
        reviewReplies: s.reviewReplies,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * Rehydrate this store when another window writes to it (Phase 18, G42) — one
 * surface accepting, blocking or paying changes what the surface in the next tab
 * is looking at, without a reload.
 */
syncAcrossWindows("foodora-merchant", () => void useMerchant.persist.rehydrate());
