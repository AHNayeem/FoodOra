"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Reservation, ReservationStatus } from "@/types";
import { reservationNotifications } from "@/lib/notifications";
import { emitNotifications } from "./notifications";

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
/**
 * Tell both sides a booking moved (C25). Called after the write commits, never
 * inside the updater — the same rule the wallet follows.
 */
function announce(reservation: Reservation) {
  emitNotifications(
    reservationNotifications(reservation, reservation.updatedAt ?? new Date().toISOString()),
  );
}

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
      add: (reservation) => {
        set((s) => ({ reservations: [reservation, ...s.reservations] }));
        announce(reservation);
      },
      replace: (reservation) => {
        const before = get().reservations.find((r) => r.id === reservation.id);
        set((s) => ({
          reservations: s.reservations.map((r) =>
            r.id === reservation.id ? reservation : r,
          ),
        }));
        // Only a *changed* status is news. A note edited on an existing booking
        // is the guest talking to the venue, not the venue answering.
        if (before?.status !== reservation.status) announce(reservation);
      },
      override: (id, status) => {
        const owned = get().reservations.find((r) => r.id === id);
        if (owned) {
          if (owned.status === status) return;
          const next = { ...owned, status, updatedAt: new Date().toISOString() };
          set((s) => ({
            reservations: s.reservations.map((r) => (r.id === id ? next : r)),
          }));
          announce(next);
          return;
        }
        // A booking the guest does not own is part of the synthesised book, so
        // the change is an override — and nobody on this device is waiting to
        // hear about it.
        set((s) => ({ statusOverrides: { ...s.statusOverrides, [id]: status } }));
      },
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
