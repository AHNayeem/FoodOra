"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryJob, RiderRemittance, RiderWithdrawal } from "@/types";

/**
 * rider store — the delivery partner's device state (Phase C18).
 *
 * Everything a rider *does* lands here, because there is no backend to send it
 * to: whether they are on shift, the trip they took and how far through it they
 * are, the offers they turned down, the cash they handed in and the money they
 * cashed out. All of it is fed back into `services/delivery` as `RiderContext`,
 * so earnings, the wallet and the offer pool account for it.
 *
 * The active trip is stored **in full** rather than by id: offers are synthesised
 * from a rolling time bucket, so the record has to be captured at the moment it is
 * accepted or it would evaporate at the next refresh. That is also why the trip
 * screen reads the job from here rather than re-fetching it.
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate in the shell, gated on `hydrated`, so SSR and the first client render
 * never disagree. With the Phase E backend this shrinks to a cache of
 * server-owned records and `declined` disappears entirely.
 */
interface RiderState {
  /** On shift and available for offers. */
  online: boolean;
  /** When this shift started — the home screen's "online since". */
  shiftStartedAt: string | null;
  /** The trip in progress, captured whole on accept. */
  activeJob: DeliveryJob | null;
  /** Trips finished on this device, newest first. */
  completed: DeliveryJob[];
  /** Offer ids turned down, so the pool stops offering them. */
  declined: string[];
  remittances: RiderRemittance[];
  withdrawals: RiderWithdrawal[];
  hydrated: boolean;
  setOnline: (online: boolean, at: string | null) => void;
  /** Take a trip (or replace it with an advanced copy from the seam). */
  setActiveJob: (job: DeliveryJob) => void;
  /** Finish the active trip: move it into this device's history. */
  finishJob: (job: DeliveryJob) => void;
  /** Give the trip back without completing it. */
  clearActiveJob: () => void;
  decline: (jobId: string) => void;
  addRemittance: (remittance: RiderRemittance) => void;
  addWithdrawal: (withdrawal: RiderWithdrawal) => void;
  setHydrated: () => void;
}

export const useRider = create<RiderState>()(
  persist(
    (set) => ({
      online: false,
      shiftStartedAt: null,
      activeJob: null,
      completed: [],
      declined: [],
      remittances: [],
      withdrawals: [],
      hydrated: false,
      setOnline: (online, at) => set({ online, shiftStartedAt: at }),
      setActiveJob: (job) => set({ activeJob: job }),
      finishJob: (job) =>
        set((s) => ({
          activeJob: null,
          completed: [job, ...s.completed.filter((j) => j.id !== job.id)],
        })),
      clearActiveJob: () => set({ activeJob: null }),
      decline: (jobId) =>
        set((s) =>
          s.declined.includes(jobId) ? {} : { declined: [...s.declined, jobId] },
        ),
      addRemittance: (remittance) =>
        set((s) => ({ remittances: [remittance, ...s.remittances] })),
      addWithdrawal: (withdrawal) =>
        set((s) => ({ withdrawals: [withdrawal, ...s.withdrawals] })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-rider",
      partialize: (s) => ({
        online: s.online,
        shiftStartedAt: s.shiftStartedAt,
        activeJob: s.activeJob,
        completed: s.completed,
        declined: s.declined,
        remittances: s.remittances,
        withdrawals: s.withdrawals,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
