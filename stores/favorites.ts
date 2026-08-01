"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * favorites store — the customer's saved vendors and dishes (Phase C23).
 *
 * Ids only: the store never holds a copy of the vendor or dish, so a renamed
 * restaurant or a repriced dish is never stale here. `services/favorites.ts`
 * resolves the ids back to entities, which is exactly the join a real backend
 * would do against a `favorites` table.
 *
 * Newest-first: toggling on unshifts, so the account page shows the most
 * recently saved item at the top without needing a `savedAt` timestamp (which
 * would mean reading the clock in a component — see the clock convention).
 *
 * A real backend scopes favorites to the signed-in user; here the set is
 * per-browser, and the toggle is gated on a session so the model still reads
 * "you must be signed in to save".
 *
 * Mirrors the auth/addresses/wallet stores: `skipHydration` + explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */
interface FavoritesState {
  vendorIds: string[];
  foodIds: string[];
  hydrated: boolean;
  toggleVendor: (id: string) => void;
  toggleFood: (id: string) => void;
  removeVendor: (id: string) => void;
  removeFood: (id: string) => void;
  clear: () => void;
  setHydrated: () => void;
}

/** Add to the front, or drop if already present. */
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set) => ({
      vendorIds: [],
      foodIds: [],
      hydrated: false,
      toggleVendor: (id) => set((s) => ({ vendorIds: toggle(s.vendorIds, id) })),
      toggleFood: (id) => set((s) => ({ foodIds: toggle(s.foodIds, id) })),
      removeVendor: (id) => set((s) => ({ vendorIds: s.vendorIds.filter((x) => x !== id) })),
      removeFood: (id) => set((s) => ({ foodIds: s.foodIds.filter((x) => x !== id) })),
      clear: () => set({ vendorIds: [], foodIds: [] }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-favorites",
      partialize: (s) => ({ vendorIds: s.vendorIds, foodIds: s.foodIds }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
