"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Subscription } from "@/types";

/**
 * subscriptions store — the customer's live meal-plan commitments (Phase C15).
 * In the prototype this persisted store is the "database": `createSubscription`
 * returns a record, the builder commits it here, and `/account/subscriptions`
 * reads it back — as do the lifecycle mutations, which hand the service the
 * current record and store the updated one it returns. When the Phase E backend
 * arrives this becomes a thin cache of server-owned subscriptions; the read
 * shape stays identical.
 *
 * Mirrors the auth/cart/orders stores: `skipHydration` + explicit rehydrate so
 * SSR and the first client render agree, gated on a `hydrated` flag.
 */
interface SubscriptionsState {
  subscriptions: Subscription[];
  hydrated: boolean;
  add: (subscription: Subscription) => void;
  /** Replace a record with the service's updated copy (skip / pause / cancel). */
  replace: (subscription: Subscription) => void;
  getById: (id: string) => Subscription | undefined;
  setHydrated: () => void;
}

export const useSubscriptions = create<SubscriptionsState>()(
  persist(
    (set, get) => ({
      subscriptions: [],
      hydrated: false,
      add: (subscription) =>
        set((s) => ({ subscriptions: [subscription, ...s.subscriptions] })),
      replace: (subscription) =>
        set((s) => ({
          subscriptions: s.subscriptions.map((existing) =>
            existing.id === subscription.id ? subscription : existing,
          ),
        })),
      getById: (id) => get().subscriptions.find((s) => s.id === id),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-subscriptions",
      partialize: (s) => ({ subscriptions: s.subscriptions }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
