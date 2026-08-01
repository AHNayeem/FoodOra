"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssistantEntities, AssistantMessage, FoodProfile } from "@/types";

/**
 * assistant store — the conversation and the food profile (Phase C24).
 *
 * Two things live here, and the difference between them is the whole design:
 *
 *  - **`messages` are persisted**, because a conversation the customer scrolls
 *    back to tomorrow is the point of having one. They hold ids and i18n keys,
 *    never entities and never prose (see `types/ai.ts`), so a thread restored
 *    next week shows today's prices and — because the assistant's turns are
 *    keys — re-reads itself in Bangla if the locale changed meanwhile.
 *  - **`entities` are not.** They are the rendering cache for those ids,
 *    refilled from `services/ai.resolveEntities` on mount. Persisting them
 *    would be persisting a copy of the catalogue, which is exactly the staleness
 *    the ids-only rule exists to prevent (the C23 favorites convention).
 *
 * `profile` is the assistant's memory — allergies, diet, goal, budget. It is
 * deliberately *not* in `stores/settings` (C28), which is scoped to preferences
 * that need a server to mean anything; this one only changes what the assistant
 * says on this device. Phase E promotes it to the user record.
 *
 * Mirrors the auth/cart/favorites stores: `skipHydration` + explicit rehydrate,
 * gated on `hydrated`, so SSR and the first client render agree.
 */

/** Newest message last; the thread renders top-down and scrolls to the end. */
interface AssistantState {
  open: boolean;
  /** A vendor page the panel was opened from — scopes answers to that menu. */
  scopeVendorId: string | null;
  messages: AssistantMessage[];
  /** Rendering cache for the ids inside `messages`. Never persisted. */
  entities: AssistantEntities;
  profile: FoodProfile;
  /** True while the seam is composing a reply — drives the typing indicator. */
  thinking: boolean;
  hydrated: boolean;

  openPanel: (vendorId?: string | null) => void;
  closePanel: () => void;
  push: (message: AssistantMessage) => void;
  /** Merge entities a reply embedded into the cache. */
  absorb: (entities: AssistantEntities) => void;
  setThinking: (thinking: boolean) => void;
  setProfile: (profile: FoodProfile) => void;
  clear: () => void;
  setHydrated: () => void;
}

/** How much of a thread to keep. Older turns are dropped from the front. */
export const MAX_HISTORY = 40;

function defaultProfile(): FoodProfile {
  return { allergies: [], dietary: [], goal: "balanced", calorieTarget: null, budget: null };
}

export const useAssistant = create<AssistantState>()(
  persist(
    (set) => ({
      open: false,
      scopeVendorId: null,
      messages: [],
      entities: { foods: {}, vendors: {} },
      profile: defaultProfile(),
      thinking: false,
      hydrated: false,

      openPanel: (vendorId = null) => set({ open: true, scopeVendorId: vendorId }),
      closePanel: () => set({ open: false }),
      push: (message) =>
        set((s) => ({ messages: [...s.messages, message].slice(-MAX_HISTORY) })),
      absorb: (entities) =>
        set((s) => ({
          entities: {
            foods: { ...s.entities.foods, ...entities.foods },
            vendors: { ...s.entities.vendors, ...entities.vendors },
          },
        })),
      setThinking: (thinking) => set({ thinking }),
      setProfile: (profile) => set({ profile }),
      clear: () => set({ messages: [], entities: { foods: {}, vendors: {} } }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-assistant",
      // `entities` is a cache and `open`/`thinking` are this tab's business:
      // only the thread and the profile are worth carrying to the next visit.
      partialize: (s) => ({ messages: s.messages, profile: s.profile }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
