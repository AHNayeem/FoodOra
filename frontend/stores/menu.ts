"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FoodItem, MenuDraft, MenuSection, MenuSectionWithItems } from "@/types";
import {
  adjustStock,
  buildMenuBoard,
  createItem,
  createSection,
  editItem,
  emptyMenuDraft,
  moveSection,
  patchSection,
  removeItem,
  removeSection,
  restoreItem,
  restoreSection,
  setSectionEnabled,
  setStock,
  untrackStock,
  type MenuError,
  type MenuItemDraft,
} from "@/lib/menu";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * menu store — what each restaurant has changed about its menu (Phase 9, G19–G21).
 *
 * The catalog is a read-only seed (and, behind `LIVE.catalog`, a server-owned
 * table), so an authored menu has to live somewhere else. It lives here as a *diff*
 * per vendor — created rows, field patches, removals, ordering, stock — expressed in
 * the catalog's own types, which is the same arrangement `stores/merchant.unavailable`
 * has always used for availability. `lib/menu.buildMenuBoard` folds it back over the
 * catalog, and that fold is the only reader.
 *
 * Three rules, matching the other stores:
 *
 *  1. **Every mutation goes through `lib/menu`.** The domain validates, mints ids
 *     and decides whether a change is a patch or an edit-in-place; nothing here
 *     writes a field. So the dialogs cannot accept what the fold would mangle.
 *  2. **One draft per vendor.** Keyed by vendor id rather than a single global
 *     draft, because a menu edit is only ever applied to the menu it belongs to and
 *     an id collision between two restaurants would be silent.
 *  3. **Availability is not stored here.** The 86 switch stays in
 *     `stores/merchant.unavailable`, where the POS terminal already reads it, and
 *     the automatic out-of-stock state is *derived* from the count. A boolean
 *     written beside a count is how a menu ends up with an item that is in stock and
 *     unavailable at the same time.
 *
 * Phase E replays these patches as mutations against the catalog service; the draft
 * becomes an optimistic cache and the action signatures stay put.
 */

const STORE_VERSION = 1;

interface MenuState {
  /** Vendor id → that restaurant's draft. */
  drafts: Record<string, MenuDraft>;
  hydrated: boolean;

  // -- reads -------------------------------------------------------------
  /** The draft for a vendor, or an empty one. Never null, so callers need no guard. */
  draftFor: (vendorId: string) => MenuDraft;

  // -- writes: sections --------------------------------------------------
  addSection: (
    vendorId: string,
    existing: MenuSection[],
    name: string,
  ) => { section: MenuSection | null; error: MenuError | null };
  renameSection: (
    vendorId: string,
    sectionId: string,
    name: string,
  ) => { error: MenuError | null };
  reorderSection: (
    vendorId: string,
    sections: MenuSection[],
    sectionId: string,
    direction: "up" | "down",
  ) => { error: MenuError | null };
  toggleSection: (vendorId: string, sectionId: string, enabled: boolean) => void;
  deleteSection: (vendorId: string, sectionId: string, itemIds: string[]) => void;
  undeleteSection: (vendorId: string, sectionId: string) => void;

  // -- writes: items -----------------------------------------------------
  addItem: (
    vendorId: string,
    input: MenuItemDraft,
  ) => { item: FoodItem | null; errors: Record<string, MenuError> };
  saveItem: (
    vendorId: string,
    itemId: string,
    input: MenuItemDraft,
  ) => { errors: Record<string, MenuError> };
  deleteItem: (vendorId: string, itemId: string) => void;
  undeleteItem: (vendorId: string, itemId: string) => void;

  // -- writes: inventory -------------------------------------------------
  trackStock: (
    vendorId: string,
    foodId: string,
    input: { quantity: number; lowStockThreshold: number },
  ) => { error: MenuError | null };
  changeStock: (
    vendorId: string,
    foodId: string,
    delta: number,
  ) => { error: MenuError | null };
  stopTracking: (vendorId: string, foodId: string) => void;

  // -- lifecycle ---------------------------------------------------------
  /** Throw away one restaurant's edits and go back to the published menu. */
  resetVendor: (vendorId: string) => void;
  resetDemo: () => void;
  setHydrated: () => void;
}

export const useMenu = create<MenuState>()(
  persist(
    (set, get) => ({
      drafts: {},
      hydrated: false,

      draftFor: (vendorId) => get().drafts[vendorId] ?? emptyMenuDraft(vendorId),

      // -- sections -------------------------------------------------------

      addSection: (vendorId, existing, name) => {
        const result = createSection(get().draftFor(vendorId), existing, name, Date.now());
        if (result.error) return { section: null, error: result.error };
        commit(set, result.draft);
        return { section: result.section, error: null };
      },

      renameSection: (vendorId, sectionId, name) => {
        const result = patchSection(get().draftFor(vendorId), sectionId, { name });
        if (result.error) return { error: result.error };
        commit(set, result.draft);
        return { error: null };
      },

      reorderSection: (vendorId, sections, sectionId, direction) => {
        const result = moveSection(get().draftFor(vendorId), sections, sectionId, direction);
        if (result.error) return { error: result.error };
        commit(set, result.draft);
        return { error: null };
      },

      toggleSection: (vendorId, sectionId, enabled) =>
        commit(set, setSectionEnabled(get().draftFor(vendorId), sectionId, enabled)),

      deleteSection: (vendorId, sectionId, itemIds) =>
        commit(set, removeSection(get().draftFor(vendorId), sectionId, itemIds)),

      undeleteSection: (vendorId, sectionId) =>
        commit(set, restoreSection(get().draftFor(vendorId), sectionId)),

      // -- items ----------------------------------------------------------

      addItem: (vendorId, input) => {
        const result = createItem(get().draftFor(vendorId), input, Date.now());
        if (Object.keys(result.errors).length) return { item: null, errors: result.errors };
        commit(set, result.draft);
        return { item: result.item, errors: {} };
      },

      saveItem: (vendorId, itemId, input) => {
        const result = editItem(get().draftFor(vendorId), itemId, input);
        if (Object.keys(result.errors).length) return { errors: result.errors };
        commit(set, result.draft);
        return { errors: {} };
      },

      deleteItem: (vendorId, itemId) =>
        commit(set, removeItem(get().draftFor(vendorId), itemId)),

      undeleteItem: (vendorId, itemId) =>
        commit(set, restoreItem(get().draftFor(vendorId), itemId)),

      // -- inventory ------------------------------------------------------

      trackStock: (vendorId, foodId, input) => {
        const result = setStock(get().draftFor(vendorId), foodId, input, Date.now());
        if (result.error) return { error: result.error };
        commit(set, result.draft);
        return { error: null };
      },

      changeStock: (vendorId, foodId, delta) => {
        const result = adjustStock(get().draftFor(vendorId), foodId, delta, Date.now());
        if (result.error) return { error: result.error };
        commit(set, result.draft);
        return { error: null };
      },

      stopTracking: (vendorId, foodId) =>
        commit(set, untrackStock(get().draftFor(vendorId), foodId)),

      // -- lifecycle ------------------------------------------------------

      /**
       * Discard a restaurant's edits.
       *
       * The draft is dropped rather than emptied, so the menu goes back to being
       * exactly the published one — an empty draft and no draft have to fold to the
       * same board, and dropping it is the version that cannot be wrong.
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
      name: "foodora-menu",
      version: STORE_VERSION,
      partialize: (s) => ({ drafts: s.drafts }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * Rehydrate this store when another window writes to it (Phase 18, G42) — one
 * surface accepting, blocking or paying changes what the surface in the next tab
 * is looking at, without a reload.
 */
syncAcrossWindows("foodora-menu", () => void useMenu.persist.rehydrate());

/** One write path, so no action forgets to key the draft by its vendor. */
function commit(
  set: (fn: (s: MenuState) => Partial<MenuState>) => void,
  draft: MenuDraft,
) {
  set((s) => ({ drafts: { ...s.drafts, [draft.vendorId]: draft } }));
}

// ---------------------------------------------------------------------------
// Selectors — shared by the builder, the POS grid and the customer surfaces
// ---------------------------------------------------------------------------

/**
 * The menu as it actually is, for one vendor.
 *
 * A thin bind of `buildMenuBoard` to the store, so a component never has to know
 * that a draft might not exist yet. The 86 list is passed in rather than read here:
 * it belongs to `stores/merchant`, and a store reaching into another store is how
 * two hydration gates end up racing.
 */
export function menuBoardFor(
  drafts: Record<string, MenuDraft>,
  vendorId: string,
  base: MenuSectionWithItems[],
  suppressed: readonly string[] = [],
) {
  return buildMenuBoard(base, drafts[vendorId] ?? emptyMenuDraft(vendorId), suppressed);
}
