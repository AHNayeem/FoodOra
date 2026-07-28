"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * merchant store — the vendor desk's local, simulated control state (Phase C10).
 *
 * The prototype has no backend, so the two "writes" a merchant makes from the
 * dashboard — flipping the storefront online/offline and marking a menu item
 * temporarily unavailable — are persisted here rather than sent to a server.
 * They overlay the read-only mock (a hidden item stays hidden across reloads),
 * exactly as an optimistic client cache would over the Phase E API.
 *
 * Same hydration contract as the other stores: `skipHydration` + an explicit
 * rehydrate in the dashboard shell, gated on `hydrated`, so SSR and the first
 * client render never disagree.
 */
interface MerchantState {
  /** Whether the storefront is accepting orders. */
  online: boolean;
  /** Food ids the merchant has toggled off (86'd) from the live menu. */
  unavailable: string[];
  hydrated: boolean;
  setOnline: (online: boolean) => void;
  toggleItem: (foodId: string) => void;
  setHydrated: () => void;
}

export const useMerchant = create<MerchantState>()(
  persist(
    (set) => ({
      online: true,
      unavailable: [],
      hydrated: false,
      setOnline: (online) => set({ online }),
      toggleItem: (foodId) =>
        set((s) => ({
          unavailable: s.unavailable.includes(foodId)
            ? s.unavailable.filter((id) => id !== foodId)
            : [...s.unavailable, foodId],
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-merchant",
      partialize: (s) => ({ online: s.online, unavailable: s.unavailable }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
