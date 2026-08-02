"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CustomerSettings } from "@/frontend/types";

/**
 * settings store — the customer's account settings (Phase C28).
 *
 * Seeds once from the mock service, then holds the edits so they survive a
 * refresh. `apply` takes the object the service echoed back, keeping the store a
 * cache of the server's answer rather than a second source of truth — when the
 * Phase E backend lands only `services/settings.ts` changes.
 *
 * Mirrors the auth/addresses/wallet stores: `skipHydration` + explicit
 * rehydrate, gated on `hydrated`.
 */
interface SettingsState {
  settings: CustomerSettings | null;
  hydrated: boolean;
  /** True once seeded from the service, so we never re-seed over user edits. */
  seeded: boolean;
  seed: (settings: CustomerSettings) => void;
  apply: (settings: CustomerSettings) => void;
  reset: () => void;
  setHydrated: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      hydrated: false,
      seeded: false,
      seed: (settings) => set((s) => (s.seeded ? {} : { settings, seeded: true })),
      apply: (settings) => set({ settings }),
      reset: () => set({ settings: null, seeded: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-settings",
      partialize: (s) => ({ settings: s.settings, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
