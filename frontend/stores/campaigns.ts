"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon } from "@/types";
import type { PlatformCampaignContext } from "@/services/coupons";
import { buildCampaignDeskSeed } from "@/lib/mock/coupons";

/**
 * campaigns store — what the platform desk has done to the coupon catalogue
 * (Phase 12, G28).
 *
 * It holds three things and nothing else, and each maps onto a column Phase E
 * will own on the `coupons` table: the campaigns created here (`created`), the
 * ones deactivated (`paused` → `paused_at`) and the ones ended early
 * (`endedAt` → an `UPDATE … SET ends_at = now()`).
 *
 * What it deliberately does **not** hold is any campaign's performance. How many
 * times a code was redeemed, what it discounted and what it brought in are
 * derived on every read by `services/coupons.getPlatformCampaigns` from the
 * campaign's own live days — so there is no cached total that can drift from the
 * redemptions behind it, which is §5.4 for this surface.
 *
 * Nor does it hold the *catalogue*. A seeded campaign is never copied in here;
 * only the desk's decision about it is, keyed on the coupon id — the same rule
 * `stores/coupons` follows for claims and `stores/customers` follows for managed
 * accounts. A pause therefore survives a change to the campaign's terms, and the
 * terms always come from one place.
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */

const STORE_VERSION = 1;

interface CampaignsState {
  /** Campaigns issued from `/admin/coupons`. */
  created: Coupon[];
  /** Coupon id → when the desk deactivated it. */
  paused: Record<string, string>;
  /** Coupon id → when the desk ended it early. */
  endedAt: Record<string, string>;
  hydrated: boolean;
  seeded: boolean;

  /** Commit a campaign the seam has already validated. */
  addCampaign: (coupon: Coupon) => void;
  /** Deactivate (`pausedAt` set) or reactivate (`null`) a campaign. */
  setPaused: (couponId: string, pausedAt: string | null) => void;
  /** Close a campaign's window now. Not reversible — the row stays readable. */
  endCampaign: (couponId: string, endedAt: string) => void;

  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

export const useCampaigns = create<CampaignsState>()(
  persist(
    (set, get) => ({
      created: [],
      paused: {},
      endedAt: {},
      hydrated: false,
      seeded: false,

      addCampaign: (coupon) =>
        set((s) =>
          s.created.some((c) => c.id === coupon.id)
            ? {}
            : { created: [coupon, ...s.created] },
        ),

      setPaused: (couponId, pausedAt) =>
        set((s) => {
          const paused = { ...s.paused };
          // Reactivating *removes* the row rather than writing a null: the
          // absence of a decision is what "running" means, and a table of nulls
          // would be a second way to say the same thing.
          if (pausedAt === null) delete paused[couponId];
          else paused[couponId] = pausedAt;
          return { paused };
        }),

      endCampaign: (couponId, endedAt) =>
        set((s) => ({ endedAt: { ...s.endedAt, [couponId]: endedAt } })),

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const demo = buildCampaignDeskSeed(now);
        set((s) => ({
          // Merged rather than replaced, so a decision this device made before
          // the store was ever seeded is not thrown away by the seed.
          paused: { ...demo.paused, ...s.paused },
          seeded: true,
        }));
      },

      resetDemo: (now = Date.now()) =>
        set({ created: [], paused: buildCampaignDeskSeed(now).paused, endedAt: {}, seeded: true }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-campaigns",
      version: STORE_VERSION,
      partialize: (s) => ({
        created: s.created,
        paused: s.paused,
        endedAt: s.endedAt,
        seeded: s.seeded,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

/**
 * The `PlatformCampaignContext` every call into `services/coupons` takes.
 *
 * Joined here, once, for the same reason `useReviewContext` (C22) exists: the
 * alternative is every coupon surface remembering to assemble the desk's three
 * fields, and one of them forgetting — at which point a deactivated campaign
 * would still be spendable at checkout.
 *
 * Returned memoised so it can be an effect dependency: a new campaign or a new
 * pause changes the identity and the surface refetches, nothing else does.
 */
export function useCampaignDesk(): PlatformCampaignContext {
  const created = useCampaigns((s) => s.created);
  const paused = useCampaigns((s) => s.paused);
  const endedAt = useCampaigns((s) => s.endedAt);
  return useMemo(() => ({ created, paused, endedAt }), [created, paused, endedAt]);
}

/** How many campaigns the desk has deactivated — the board's headline number. */
export function pausedCampaignCount(paused: Record<string, string>): number {
  return Object.keys(paused).length;
}
