"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryJob, RiderRemittance, RiderWithdrawal } from "@/types";
import { useFleet } from "./fleet";

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
 *
 * One thing here is *not* private to the device: whether this rider is available
 * for work. Dispatch has to know, and it cannot read a device store — so every
 * action that changes availability publishes it to `stores/fleet` (G40). That is
 * why `identify` exists: a device store has no idea whose device it is until the
 * shell resolves "me".
 */
interface RiderState {
  /** Whose device this is, once the shell has resolved it; null before that. */
  riderId: string | null;
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
  /** Tell the store which rider it belongs to, and publish their current state. */
  identify: (riderId: string) => void;
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

/**
 * Tell the shared availability board what this device's rider is doing.
 *
 * Called from inside every action that changes it, so there is exactly one write
 * path and the board cannot fall behind. A no-op before the shell has identified
 * the rider — there is nothing to publish under.
 */
function publish(
  riderId: string | null,
  patch: { online?: boolean; since?: string | null; activeJobId?: string | null },
) {
  if (!riderId) return;
  useFleet.getState().publish(riderId, patch);
}

export const useRider = create<RiderState>()(
  persist(
    (set, get) => ({
      riderId: null,
      online: false,
      shiftStartedAt: null,
      activeJob: null,
      completed: [],
      declined: [],
      remittances: [],
      withdrawals: [],
      hydrated: false,
      identify: (riderId) => {
        set({ riderId });
        const { online, shiftStartedAt, activeJob } = get();
        publish(riderId, {
          online,
          since: shiftStartedAt,
          activeJobId: activeJob?.id ?? null,
        });
      },
      setOnline: (online, at) => {
        set({ online, shiftStartedAt: at });
        publish(get().riderId, { online, since: at });
      },
      setActiveJob: (job) => {
        set({ activeJob: job });
        publish(get().riderId, { activeJobId: job.id });
      },
      finishJob: (job) => {
        set((s) => ({
          activeJob: null,
          completed: [job, ...s.completed.filter((j) => j.id !== job.id)],
        }));
        publish(get().riderId, { activeJobId: null });
      },
      clearActiveJob: () => {
        set({ activeJob: null });
        publish(get().riderId, { activeJobId: null });
      },
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
        riderId: s.riderId,
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
