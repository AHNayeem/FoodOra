"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon, CouponClaim, CouponRedemption } from "@/types";
import { couponClaimedNotification } from "@/lib/notifications";
import { emitNotifications } from "./notifications";

/**
 * coupons store — the tickets this browser holds (Phase C21).
 *
 * It persists **claims only**: a `couponId`, when it was claimed and what it has
 * been spent on. The coupon's terms, window and status are never copied in here,
 * because they belong to the catalogue — `services/coupons.ts` re-joins them on
 * every read (the C23 favorites convention), so a campaign that changes its end
 * date can never leave a stale ticket sitting in a wallet.
 *
 * Seeded once from the granted coupons the account was issued (welcome gift,
 * referral reward, apology credit), then owned by the client — exactly the shape
 * a `coupon_claims` table would have, with `userId` implied by the browser.
 *
 * Same hydration contract as the other stores: `skipHydration` + an explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */
interface CouponsState {
  claims: CouponClaim[];
  hydrated: boolean;
  seeded: boolean;
  /** Adopt the account's granted coupons — once, on first visit. */
  seed: (claims: CouponClaim[]) => void;
  /**
   * Add a claimed ticket (no-op if already held).
   *
   * The `coupon` is passed alongside the claim rather than looked up, and is
   * used for one thing: the notification. The store still persists ids only
   * (the C23 rule) — a ticket in the wallet is re-joined to the catalogue on
   * every read — but a *notification* is a snapshot of a moment, so the code
   * and title it announces are the ones that were true when it was claimed.
   */
  addClaim: (claim: CouponClaim, coupon: Coupon) => void;
  /** Record a spend against the claim (the usage count is derived from these). */
  recordRedemption: (couponId: string, redemption: CouponRedemption) => void;
  setHydrated: () => void;
}

export const useCoupons = create<CouponsState>()(
  persist(
    (set, get) => ({
      claims: [],
      hydrated: false,
      seeded: false,
      // Merges rather than replaces: a code claimed from the deals page before
      // the wallet was ever opened must survive the account being seeded.
      seed: (incoming) =>
        set((s) =>
          s.seeded
            ? {}
            : {
                claims: [
                  ...s.claims,
                  ...incoming.filter(
                    (i) => !s.claims.some((c) => c.couponId === i.couponId),
                  ),
                ],
                seeded: true,
              },
        ),
      addClaim: (claim, coupon) => {
        if (get().claims.some((c) => c.couponId === claim.couponId)) return;
        set((s) => ({ claims: [claim, ...s.claims] }));
        emitNotifications([couponClaimedNotification(coupon, claim.claimedAt)]);
      },
      recordRedemption: (couponId, redemption) =>
        set((s) => ({
          claims: s.claims.map((c) =>
            c.couponId === couponId
              ? { ...c, redemptions: [redemption, ...c.redemptions] }
              : c,
          ),
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-coupons",
      partialize: (s) => ({ claims: s.claims, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
