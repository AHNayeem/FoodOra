"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PosHeldTicket, PosSale } from "@/frontend/types";

/**
 * pos store — the terminal's local register (Phase C11).
 *
 * In the prototype the "till" is this persisted store: `completeSale` returns a
 * sale, the terminal commits it here (so the receipt + recent-sales strip
 * survive a reload), and parked/held tickets live here too so a cashier can
 * recall them. When the Phase E backend arrives this becomes a thin cache of
 * server-owned sales — the read API (`getSale`) stays identical.
 *
 * Same hydration contract as the other stores: `skipHydration` + an explicit
 * rehydrate on the terminal, gated on `hydrated`, so SSR and the first client
 * render never disagree.
 */
interface PosState {
  /** Completed sales, newest first. */
  sales: PosSale[];
  /** Parked tickets waiting to be recalled. */
  heldTickets: PosHeldTicket[];
  hydrated: boolean;
  addSale: (sale: PosSale) => void;
  getSale: (id: string) => PosSale | undefined;
  holdTicket: (ticket: PosHeldTicket) => void;
  removeHeldTicket: (id: string) => void;
  setHydrated: () => void;
}

export const usePos = create<PosState>()(
  persist(
    (set, get) => ({
      sales: [],
      heldTickets: [],
      hydrated: false,
      addSale: (sale) => set((s) => ({ sales: [sale, ...s.sales] })),
      getSale: (id) => get().sales.find((sale) => sale.id === id),
      holdTicket: (ticket) =>
        set((s) => ({ heldTickets: [ticket, ...s.heldTickets] })),
      removeHeldTicket: (id) =>
        set((s) => ({ heldTickets: s.heldTickets.filter((t) => t.id !== id) })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-pos",
      partialize: (s) => ({ sales: s.sales, heldTickets: s.heldTickets }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
