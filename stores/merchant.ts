"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon } from "@/types";

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
  hydrated: boolean;
  setOnline: (online: boolean) => void;
  toggleItem: (foodId: string) => void;
  addCoupon: (coupon: Coupon) => void;
  endCoupon: (couponId: string, endedAt: string) => void;
  setHydrated: () => void;
}

export const useMerchant = create<MerchantState>()(
  persist(
    (set) => ({
      online: true,
      unavailable: [],
      coupons: [],
      couponEndedAt: {},
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
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-merchant",
      partialize: (s) => ({
        online: s.online,
        unavailable: s.unavailable,
        coupons: s.coupons,
        couponEndedAt: s.couponEndedAt,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
