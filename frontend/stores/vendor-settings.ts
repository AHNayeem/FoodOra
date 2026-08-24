"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  VendorContact,
  VendorDeliverySettings,
  VendorSettingsDraft,
  WeeklyHours,
} from "@/types";
import type { VendorProfilePatch, VendorLocationPatch } from "@/types";
import {
  emptySettingsDraft,
  saveContact,
  saveDelivery,
  saveHours,
  saveProfile,
  type SettingsError,
} from "@/lib/vendor-settings";

/**
 * vendor-settings store — what each restaurant has changed about itself
 * (Phase 10, G18).
 *
 * The catalog is a read-only seed (and, behind `LIVE.catalog`, a server-owned
 * table), so an edited profile has to live somewhere else. It lives here as a
 * *diff* per vendor — expressed in the listing's own fields — which is the same
 * arrangement `stores/menu` uses for an authored menu and `stores/merchant.unavailable`
 * has always used for availability. `lib/vendor-settings.effectiveVendor` folds it
 * back over the catalog, and that fold is the only reader.
 *
 * Three rules, matching the other stores:
 *
 *  1. **Every mutation goes through `lib/vendor-settings`.** The domain validates
 *     and stamps; nothing here writes a field or decides what is acceptable. So a
 *     form cannot save a rota the storefront could not read.
 *  2. **One draft per vendor.** Keyed by vendor id rather than a single global
 *     draft, because a settings edit is only ever applied to the restaurant it
 *     belongs to and a collision between two listings would be silent.
 *  3. **Branches are not here.** They live on `VendorApplication.branches`, edited
 *     through `stores/onboarding.editVendor` so the change lands in the audit log a
 *     reviewer reads. A copy here would be a second answer to how many outlets a
 *     restaurant has — which is the duplication Phases 6–7 avoided by declining to
 *     mint a listing per branch.
 *
 * Phase E replays these patches as catalog mutations; the draft becomes an
 * optimistic cache and the action signatures stay put.
 */

const STORE_VERSION = 1;

interface VendorSettingsState {
  /** Vendor id → that restaurant's draft. */
  drafts: Record<string, VendorSettingsDraft>;
  hydrated: boolean;

  // -- reads -------------------------------------------------------------
  /** The draft for a vendor, or an empty one. Never null, so callers need no guard. */
  draftFor: (vendorId: string) => VendorSettingsDraft;

  // -- writes ------------------------------------------------------------
  saveProfile: (
    vendorId: string,
    input: VendorProfilePatch & VendorLocationPatch,
  ) => { errors: Record<string, SettingsError> };
  saveContact: (
    vendorId: string,
    input: VendorContact,
  ) => { errors: Record<string, SettingsError> };
  saveHours: (
    vendorId: string,
    hours: WeeklyHours,
  ) => { errors: Record<string, SettingsError> };
  saveDelivery: (
    vendorId: string,
    delivery: VendorDeliverySettings,
  ) => { errors: Record<string, SettingsError> };

  // -- lifecycle ---------------------------------------------------------
  /** Throw one restaurant's edits away and go back to the published listing. */
  resetVendor: (vendorId: string) => void;
  resetDemo: () => void;
  setHydrated: () => void;
}

export const useVendorSettings = create<VendorSettingsState>()(
  persist(
    (set, get) => ({
      drafts: {},
      hydrated: false,

      draftFor: (vendorId) => get().drafts[vendorId] ?? emptySettingsDraft(vendorId),

      saveProfile: (vendorId, input) => {
        const result = saveProfile(get().draftFor(vendorId), input, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        commit(set, result.draft);
        return { errors: {} };
      },

      saveContact: (vendorId, input) => {
        const result = saveContact(get().draftFor(vendorId), input, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        commit(set, result.draft);
        return { errors: {} };
      },

      saveHours: (vendorId, hours) => {
        const result = saveHours(get().draftFor(vendorId), hours, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        commit(set, result.draft);
        return { errors: {} };
      },

      saveDelivery: (vendorId, delivery) => {
        const result = saveDelivery(get().draftFor(vendorId), delivery, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        commit(set, result.draft);
        return { errors: {} };
      },

      /**
       * Discard a restaurant's edits.
       *
       * The draft is dropped rather than emptied, for the reason
       * `stores/menu.resetVendor` drops one: an empty draft and no draft have to
       * fold to the same listing, and dropping it is the version that cannot be
       * wrong.
       */
      resetVendor: (vendorId) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[vendorId];
          return { drafts };
        }),

      resetDemo: () => set({ drafts: {} }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-vendor-settings",
      version: STORE_VERSION,
      partialize: (s) => ({ drafts: s.drafts }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** One write path, so no action forgets to key the draft by its vendor. */
function commit(
  set: (fn: (s: VendorSettingsState) => Partial<VendorSettingsState>) => void,
  draft: VendorSettingsDraft,
) {
  set((s) => ({ drafts: { ...s.drafts, [draft.vendorId]: draft } }));
}
