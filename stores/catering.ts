"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CateringQuote, QuoteStatus } from "@/types";

/**
 * catering store — the client-side quotation history (Phase C17). In the
 * prototype this persisted store is the "database" of submitted quotes:
 * `requestQuote` returns a quote, the builder commits it here, and the
 * confirmation/status page reads it back by id. When the Phase E backend arrives
 * this becomes a thin cache of server-owned quotes — the read API stays
 * identical.
 *
 * Mirrors the auth/cart/orders stores: `skipHydration` + explicit rehydrate so
 * SSR and the first client render agree, gated on a `hydrated` flag.
 */
interface CateringState {
  quotes: CateringQuote[];
  hydrated: boolean;
  addQuote: (quote: CateringQuote) => void;
  getById: (id: string) => CateringQuote | undefined;
  updateStatus: (id: string, status: QuoteStatus) => void;
  setHydrated: () => void;
}

export const useCatering = create<CateringState>()(
  persist(
    (set, get) => ({
      quotes: [],
      hydrated: false,
      addQuote: (quote) => set((s) => ({ quotes: [quote, ...s.quotes] })),
      getById: (id) => get().quotes.find((q) => q.id === id),
      updateStatus: (id, status) =>
        set((s) => ({
          quotes: s.quotes.map((q) =>
            q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q,
          ),
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-catering-quotes",
      partialize: (s) => ({ quotes: s.quotes }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
