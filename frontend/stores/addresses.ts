"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SavedAddress } from "@/frontend/types";

/**
 * addresses store — the customer's address book (Phase C3). In the prototype
 * this persisted store is the source of truth: it seeds once from the mock
 * service (`getAddressBook`) and is edited in the account app, so adds/edits
 * made there also show up at checkout (C8 reads the same store). When the
 * Phase E backend arrives this becomes a thin cache and the CRUD actions call
 * real endpoints — the read shape stays identical.
 *
 * Mirrors the auth/cart/orders stores: `skipHydration` + explicit rehydrate so
 * SSR and the first client render agree, gated on a `hydrated` flag.
 */
interface AddressesState {
  addresses: SavedAddress[];
  hydrated: boolean;
  /** True once seeded from the service, so we never re-seed over user edits. */
  seeded: boolean;
  seed: (list: SavedAddress[]) => void;
  addAddress: (address: SavedAddress) => void;
  updateAddress: (id: string, patch: Partial<SavedAddress>) => void;
  removeAddress: (id: string) => void;
  setDefault: (id: string) => void;
  setHydrated: () => void;
}

/** Keep exactly one default: the given id wins, everything else is cleared. */
function withSingleDefault(list: SavedAddress[], defaultId: string): SavedAddress[] {
  return list.map((a) => ({ ...a, isDefault: a.id === defaultId }));
}

/** Ensure the book always has one default (falls back to the first entry). */
function ensureDefault(list: SavedAddress[]): SavedAddress[] {
  if (list.length === 0 || list.some((a) => a.isDefault)) return list;
  return withSingleDefault(list, list[0].id);
}

export const useAddresses = create<AddressesState>()(
  persist(
    (set) => ({
      addresses: [],
      hydrated: false,
      seeded: false,
      seed: (list) =>
        set((s) => (s.seeded ? {} : { addresses: ensureDefault(list), seeded: true })),
      addAddress: (address) =>
        set((s) => {
          const next = [...s.addresses, address];
          return {
            addresses: ensureDefault(
              address.isDefault ? withSingleDefault(next, address.id) : next,
            ),
          };
        }),
      updateAddress: (id, patch) =>
        set((s) => {
          const next = s.addresses.map((a) => (a.id === id ? { ...a, ...patch } : a));
          return {
            addresses: ensureDefault(patch.isDefault ? withSingleDefault(next, id) : next),
          };
        }),
      removeAddress: (id) =>
        set((s) => ({ addresses: ensureDefault(s.addresses.filter((a) => a.id !== id)) })),
      setDefault: (id) => set((s) => ({ addresses: withSingleDefault(s.addresses, id) })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-addresses",
      partialize: (s) => ({ addresses: s.addresses, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
