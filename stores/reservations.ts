"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Reservation, ReservationStatus } from "@/types";

/**
 * reservations store — table bookings held on this device (Phase C16).
 *
 * It holds two different things, for two different people:
 *
 *  - `reservations` — the bookings *this guest* made. In the prototype this is
 *    the database of guest bookings: `createReservation` returns one, the form
 *    commits it here, and `/account/reservations` and the confirmation page
 *    read it back.
 *  - `statusOverrides` — the status changes *the venue* made from the dashboard
 *    book. The rest of the book is synthesised per request and cannot be
 *    written to, so confirming or seating a synthesised party is recorded as an
 *    override keyed by reservation id, exactly as C10's merchant store records
 *    item availability. Bookings the guest owns are updated in place instead.
 *
 * Both are passed back into `services/reservations` as `BookContext`, so
 * availability accounts for them. With a real backend the store shrinks to a
 * cache of server-owned records and the override map disappears entirely.
 *
 * Mirrors the auth/cart/orders stores: `skipHydration` + explicit rehydrate so
 * SSR and the first client render agree, gated on a `hydrated` flag.
 */
interface ReservationState {
  reservations: Reservation[];
  statusOverrides: Record<string, ReservationStatus>;
  hydrated: boolean;
  add: (reservation: Reservation) => void;
  /** Replace a guest-owned booking (cancel, or a venue action on it). */
  replace: (reservation: Reservation) => void;
  /** Record a venue status change on a booking this device does not own. */
  override: (id: string, status: ReservationStatus) => void;
  getById: (id: string) => Reservation | undefined;
  setHydrated: () => void;
}

export const useReservations = create<ReservationState>()(
  persist(
    (set, get) => ({
      reservations: [],
      statusOverrides: {},
      hydrated: false,
      add: (reservation) =>
        set((s) => ({ reservations: [reservation, ...s.reservations] })),
      replace: (reservation) =>
        set((s) => ({
          reservations: s.reservations.map((r) =>
            r.id === reservation.id ? reservation : r,
          ),
        })),
      override: (id, status) =>
        set((s) =>
          // A booking the guest owns is updated for real; anything else is an
          // override on top of the synthesised book.
          s.reservations.some((r) => r.id === id)
            ? {
                reservations: s.reservations.map((r) =>
                  r.id === id
                    ? { ...r, status, updatedAt: new Date().toISOString() }
                    : r,
                ),
              }
            : { statusOverrides: { ...s.statusOverrides, [id]: status } },
        ),
      getById: (id) => get().reservations.find((r) => r.id === id),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-reservations",
      partialize: (s) => ({
        reservations: s.reservations,
        statusOverrides: s.statusOverrides,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
