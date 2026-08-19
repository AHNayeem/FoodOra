"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * fleet store — who is actually available to deliver (G40).
 *
 * Shift state used to live only in `stores/rider`, which is the *device's* store:
 * it knew whether the rider looking at this browser was on shift, and nothing
 * else could read it. Dispatch is in `stores/orders`, so it could — and did —
 * hand a real order to a rider who had gone home, while that rider's own app was
 * refusing to show them offers. Two answers to one question.
 *
 * This is the single answer. The rider app publishes its shift and its current
 * trip here; dispatch and the admin's fleet board read it. One writer per
 * record (`stores/rider` publishes on every action that changes availability),
 * so this is a projection rather than a second copy to keep in step.
 *
 * What it deliberately does *not* track is real orders — the orders store already
 * knows who is carrying one, and asking it is better than mirroring it. See
 * `unavailableRiderIds` in `stores/orders`, which unions the two.
 *
 * Persisted because a shift outlives a reload, and shared across tabs for the
 * same reason the orders store is: the demo is several surfaces side by side.
 * Phase E replaces this with a `rider_shifts` table and the readers stay put.
 */
export interface RiderShift {
  riderId: string;
  /** On shift and accepting work. */
  online: boolean;
  /** When the shift started; null when off shift. */
  since: string | null;
  /** The synthesised trip in progress, if any — a rider on one is not free. */
  activeJobId: string | null;
  updatedAt: string;
}

interface FleetState {
  /** Keyed by rider id. A rider with no entry has never opened the app here. */
  shifts: Record<string, RiderShift>;
  hydrated: boolean;
  /** Publish what changed about one rider's availability. */
  publish: (riderId: string, patch: Partial<Omit<RiderShift, "riderId">>) => void;
  setHydrated: () => void;
}

export const useFleet = create<FleetState>()(
  persist(
    (set) => ({
      shifts: {},
      hydrated: false,
      publish: (riderId, patch) =>
        set((s) => {
          const current: RiderShift =
            s.shifts[riderId] ??
            {
              riderId,
              online: false,
              since: null,
              activeJobId: null,
              updatedAt: new Date().toISOString(),
            };
          return {
            shifts: {
              ...s.shifts,
              [riderId]: { ...current, ...patch, updatedAt: new Date().toISOString() },
            },
          };
        }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-fleet",
      partialize: (s) => ({ shifts: s.shifts }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** What the board knows about one rider, or null if they have never signed on. */
export function shiftFor(
  shifts: Record<string, RiderShift>,
  riderId: string,
): RiderShift | null {
  return shifts[riderId] ?? null;
}

/**
 * Can dispatch give this rider work?
 *
 * A rider with no shift record is treated as available. That is a deliberate
 * prototype rule, not an oversight: only one rider has a device in this demo, so
 * holding the rest of the seeded fleet to a shift they can never clock into would
 * leave dispatch with nobody to pick. A rider who *has* signed on is held to what
 * they said — going offline in the rider app takes them out of the pool, which is
 * the behaviour the spec asks for.
 */
export function isAvailableForDispatch(shift: RiderShift | null): boolean {
  if (!shift) return true;
  return shift.online && !shift.activeJobId;
}

/** Riders the board says cannot take work right now. */
export function offShiftRiderIds(shifts: Record<string, RiderShift>): Set<string> {
  const ids = new Set<string>();
  for (const shift of Object.values(shifts)) {
    if (!isAvailableForDispatch(shift)) ids.add(shift.riderId);
  }
  return ids;
}
