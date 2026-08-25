"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  RiderPayout,
  RiderSettlement,
  SettlementAdjustment,
  SettlementPayout,
  VendorSettlement,
} from "@/types";
import { payoutNotifications } from "@/lib/notifications";
import {
  createAdjustment,
  createRiderPayout,
  createVendorPayout,
  isPayable,
  type PayoutError,
} from "@/lib/settlement";
import { emitNotifications } from "./notifications";
import { sessionCan } from "./auth";
import { recordAudit } from "./audit";

/**
 * payouts store — the money the platform has actually sent, and the corrections
 * it has made (Phase 8, G16/G17).
 *
 * Everything else financial in this application is *derived*: a commission is
 * stamped on an order, and every settlement, balance and total is recomputed from
 * those stamps on demand. This store holds the one financial fact that cannot be
 * derived — that a transfer happened. A payout is an event: it occurred at an
 * instant, a named account ran it, and it has a reference somebody can quote. So
 * it is stored, and the settlement's `paid` status is projected back *from* it by
 * `lib/settlement`, rather than a status being written anywhere.
 *
 * Three rules, the same ones `stores/onboarding` and `stores/orders` follow:
 *
 *  1. **Every write goes through `lib/settlement`.** `createVendorPayout` /
 *     `createRiderPayout` decide whether a line is payable and mint the record;
 *     nothing here computes an amount or invents a reference. A payout run that
 *     could be told what to transfer is a payout run that can disagree with the
 *     statement it is paying.
 *  2. **A period is paid at most once.** Guarded on `vendorId`/`riderId` plus
 *     `periodRef` rather than on the settlement's id, because the settlement is
 *     recomputed every render and a replay (a second tab, a double click, a
 *     rehydrate) must find the period already paid.
 *  3. **Every committed payout emits notifications**, through the same routing
 *     gate as everything else, so money moving cannot be silent to the person
 *     receiving it.
 *
 * Phase E makes this a cache of a server-owned `payouts` table; `payVendor`
 * becomes a mutation call and the signatures stay put.
 */

const STORE_VERSION = 1;

interface PayoutsState {
  /** Vendor transfers, newest first. */
  payouts: SettlementPayout[];
  /** Rider transfers, newest first. */
  riderPayouts: RiderPayout[];
  /** Manual corrections to vendor periods. */
  adjustments: SettlementAdjustment[];
  hydrated: boolean;

  // -- writes ------------------------------------------------------------
  /** Pay one vendor settlement. */
  payVendor: (
    settlement: VendorSettlement,
    by: string,
  ) => { payout: SettlementPayout | null; error: PayoutError | null };
  /** Pay one rider settlement. */
  payRider: (
    settlement: RiderSettlement,
    by: string,
  ) => { payout: RiderPayout | null; error: PayoutError | null };
  /**
   * A payout run: pay every payable line in one go. Returns what it managed —
   * a run is not all-or-nothing, because one unpayable line must not stop the
   * other forty transfers.
   */
  runVendorPayouts: (
    settlements: VendorSettlement[],
    by: string,
  ) => { paid: number; skipped: number; amount: number };
  runRiderPayouts: (
    settlements: RiderSettlement[],
    by: string,
  ) => { paid: number; skipped: number; amount: number };
  /** Record a goodwill credit or a deduction against a vendor's period. */
  adjust: (input: {
    vendorId: string;
    periodRef: string;
    label: string;
    amount: number;
    reason?: string | null;
    by: string;
  }) => { adjustment: SettlementAdjustment | null; error: PayoutError | null };

  // -- lifecycle ---------------------------------------------------------
  resetDemo: () => void;
  setHydrated: () => void;
}

export const usePayouts = create<PayoutsState>()(
  persist(
    (set, get) => ({
      payouts: [],
      riderPayouts: [],
      adjustments: [],
      hydrated: false,

      payVendor: (settlement, by) => {
        // Phase 14: `payouts.view` opens the book, `payouts.manage` moves the
        // money. Guarded on the *transfer* rather than on the run, so a batch
        // cannot get through a right one transfer could not — the run is a loop
        // over this function, which is the reason it was written that way.
        if (!sessionCan("payouts.manage")) {
          return { payout: null, error: "errors.notPermitted" };
        }
        if (vendorPaid(get().payouts, settlement)) {
          return { payout: null, error: "errors.settlementAlreadyPaid" };
        }
        const { payout, error } = createVendorPayout(settlement, { by });
        if (!payout) return { payout: null, error };
        set((s) => ({ payouts: [payout, ...s.payouts] }));
        emitNotifications(
          payoutNotifications({
            audience: "restaurant",
            payeeName: settlement.vendorName,
            payoutRef: payout.payoutRef,
            periodRef: payout.periodRef,
            amount: payout.amount,
            currency: payout.currency,
            at: payout.paidAt,
            href: "/dashboard/earnings",
          }),
        );
        // Phase 15: §6's "payout action". One entry per transfer — a run adds its
        // own summary entry on top, so a batch reads as one decision and forty
        // movements rather than as forty unexplained ones.
        recordAudit({
          action: "payout.paid",
          entity: "settlement",
          entityId: payout.payoutRef,
          metadata: {
            payee: "vendor",
            name: settlement.vendorName,
            vendorId: settlement.vendorId,
            periodRef: payout.periodRef,
            amount: payout.amount,
            currency: payout.currency,
          },
        });
        return { payout, error: null };
      },

      payRider: (settlement, by) => {
        if (!sessionCan("payouts.manage")) {
          return { payout: null, error: "errors.notPermitted" };
        }
        if (riderPaid(get().riderPayouts, settlement)) {
          return { payout: null, error: "errors.settlementAlreadyPaid" };
        }
        const { payout, error } = createRiderPayout(settlement, { by });
        if (!payout) return { payout: null, error };
        set((s) => ({ riderPayouts: [payout, ...s.riderPayouts] }));
        emitNotifications(
          payoutNotifications({
            audience: "rider",
            payeeName: settlement.riderName,
            payoutRef: payout.payoutRef,
            periodRef: payout.periodRef,
            amount: payout.amount,
            currency: payout.currency,
            at: payout.paidAt,
            href: "/delivery/wallet",
          }),
        );
        recordAudit({
          action: "payout.paid",
          entity: "settlement",
          entityId: payout.payoutRef,
          metadata: {
            payee: "rider",
            name: settlement.riderName,
            riderId: settlement.riderId,
            periodRef: payout.periodRef,
            amount: payout.amount,
            currency: payout.currency,
          },
        });
        return { payout, error: null };
      },

      /**
       * The run is a loop over `payVendor`, not a second write path.
       *
       * Tempting to batch the `set` for one render instead of forty; not worth it.
       * A bulk writer would need its own copy of the duplicate guard and its own
       * notification fan-out, and those are exactly the two things that must not
       * exist twice.
       */
      runVendorPayouts: (settlements, by) => {
        let paid = 0;
        let amount = 0;
        for (const settlement of settlements.filter(isPayable)) {
          const result = get().payVendor(settlement, by);
          if (result.payout) {
            paid += 1;
            amount += result.payout.amount;
          }
        }
        recordAudit({
          action: "payout.run",
          entity: "payout-run",
          entityId: `run_vendor_${settlements.length}`,
          metadata: {
            payee: "vendor",
            paid,
            skipped: settlements.length - paid,
            amount,
          },
        });
        return { paid, skipped: settlements.length - paid, amount };
      },

      runRiderPayouts: (settlements, by) => {
        let paid = 0;
        let amount = 0;
        for (const settlement of settlements.filter(isPayable)) {
          const result = get().payRider(settlement, by);
          if (result.payout) {
            paid += 1;
            amount += result.payout.amount;
          }
        }
        recordAudit({
          action: "payout.run",
          entity: "payout-run",
          entityId: `run_rider_${settlements.length}`,
          metadata: {
            payee: "rider",
            paid,
            skipped: settlements.length - paid,
            amount,
          },
        });
        return { paid, skipped: settlements.length - paid, amount };
      },

      /**
       * A correction, and the one guard `lib/settlement` cannot apply itself.
       *
       * `createAdjustment` is pure and cannot see the payout records, so it cannot
       * know whether this week's money has already gone. Adjusting a paid period
       * would silently move its `netPayable` away from the amount the payout record
       * says was transferred — two numbers for one week, which is exactly what the
       * financial domain exists to prevent. A correction after the fact belongs on
       * the *next* period, and the desk is told so rather than quietly allowed.
       */
      adjust: ({ vendorId, periodRef, label, amount, reason, by }) => {
        if (!sessionCan("payouts.manage")) {
          return { adjustment: null, error: "errors.notPermitted" };
        }
        if (vendorPaid(get().payouts, { vendorId, periodRef })) {
          return { adjustment: null, error: "errors.periodAlreadyPaid" };
        }
        const { adjustment, error } = createAdjustment({
          vendorId,
          periodRef,
          label,
          amount,
          reason,
          by,
        });
        if (!adjustment) return { adjustment: null, error };
        set((s) => ({ adjustments: [adjustment, ...s.adjustments] }));
        recordAudit({
          action: "payout.adjusted",
          entity: "settlement",
          entityId: adjustment.id,
          metadata: {
            vendorId,
            periodRef,
            label,
            amount,
            reason: reason?.trim() || null,
          },
        });
        return { adjustment, error: null };
      },

      /**
       * A reset drops every transfer and correction.
       *
       * They only exist because of decisions this device made, and keeping them
       * would leave settlements marked paid with no order book to explain the
       * amount — the same reasoning `stores/onboarding.resetDemo` applies to the
       * listings an approval minted.
       */
      resetDemo: () => set({ payouts: [], riderPayouts: [], adjustments: [] }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-payouts",
      version: STORE_VERSION,
      partialize: (s) => ({
        payouts: s.payouts,
        riderPayouts: s.riderPayouts,
        adjustments: s.adjustments,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

// ---------------------------------------------------------------------------
// Duplicate guards — the period is the key, not the settlement row
// ---------------------------------------------------------------------------

function vendorPaid(
  payouts: SettlementPayout[],
  settlement: Pick<VendorSettlement, "vendorId" | "periodRef">,
): boolean {
  return payouts.some(
    (p) => p.vendorId === settlement.vendorId && p.periodRef === settlement.periodRef,
  );
}

function riderPaid(
  payouts: RiderPayout[],
  settlement: Pick<RiderSettlement, "riderId" | "periodRef">,
): boolean {
  return payouts.some(
    (p) => p.riderId === settlement.riderId && p.periodRef === settlement.periodRef,
  );
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** One vendor's transfers, newest first — the earnings page's payout history. */
export function payoutsForVendor(
  payouts: SettlementPayout[],
  vendorId: string,
): SettlementPayout[] {
  return payouts
    .filter((p) => p.vendorId === vendorId)
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
}

/** Corrections against one vendor, newest first. */
export function adjustmentsForVendor(
  adjustments: SettlementAdjustment[],
  vendorId: string,
): SettlementAdjustment[] {
  return adjustments
    .filter((a) => a.vendorId === vendorId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
