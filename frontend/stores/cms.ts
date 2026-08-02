"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CmsAuditEntry, CmsContactMessage, CmsDocument, CmsRevision } from "@/types";
import type { CmsDocPatch } from "@/lib/cms";
import type { CmsContext, CmsMutation } from "@/services/cms";
import { contactMessageNotification } from "@/lib/notifications";
import { useNotifications } from "./notifications";

/**
 * cms store — the editor's desk (Phase C26).
 *
 * The prototype has no backend, so an edit made in `/admin/cms` is persisted
 * here and overlays the read-only seed, exactly as an optimistic client cache
 * would over the Phase E API. It is the same shape as the merchant desk (C10):
 * the seam decides *what* should change and returns a {@link CmsMutation}; this
 * store is the only thing that writes it. Nothing else may touch published
 * values, which is what makes the revision history complete enough to revert.
 *
 * Four things live here:
 * - `patches`   — per-document changes over the seed (draft, published, window)
 * - `created`   — documents that exist in no seed at all
 * - `revisions` — a snapshot of the values every publish replaced
 * - `audit`     — who did what, when (spec: Admin Panel — Audit Logs)
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate in the surface that reads it, gated on `hydrated`, so SSR and the
 * first client render never disagree.
 */
const MAX_REVISIONS = 20;
const MAX_AUDIT = 200;
const MAX_MESSAGES = 40;

interface CmsState {
  patches: Record<string, CmsDocPatch>;
  created: CmsDocument[];
  revisions: Record<string, CmsRevision[]>;
  audit: CmsAuditEntry[];
  /** Messages the contact form took on this device. */
  messages: CmsContactMessage[];
  hydrated: boolean;

  /** The one door in: apply a mutation the seam authorised. */
  commit: (mutation: CmsMutation | CmsMutation[]) => void;
  recordMessage: (message: CmsContactMessage) => void;
  /** Drop every local edit and go back to the seed. */
  resetContent: () => void;
  setHydrated: () => void;
}

function mergePatch(current: CmsDocPatch | undefined, incoming: CmsDocPatch): CmsDocPatch {
  return { ...current, ...incoming };
}

export const useCms = create<CmsState>()(
  persist(
    (set, get) => ({
      patches: {},
      created: [],
      revisions: {},
      audit: [],
      messages: [],
      hydrated: false,

      commit: (mutation) => {
        const mutations = Array.isArray(mutation) ? mutation : [mutation];
        if (mutations.length === 0) return;

        set((s) => {
          const patches = { ...s.patches };
          let created = s.created;
          const revisions = { ...s.revisions };

          for (const m of mutations) {
            if (m.patch) patches[m.documentId] = mergePatch(patches[m.documentId], m.patch);

            if (m.document) {
              const index = created.findIndex((doc) => doc.id === m.document!.id);
              created =
                index === -1
                  ? [...created, m.document]
                  : created.map((doc) => (doc.id === m.document!.id ? m.document! : doc));
            }

            if (m.revision) {
              const history = revisions[m.documentId] ?? [];
              revisions[m.documentId] = [m.revision, ...history].slice(0, MAX_REVISIONS);
            }
          }

          return {
            patches,
            created,
            revisions,
            audit: [...mutations.map((m) => m.audit).reverse(), ...s.audit].slice(0, MAX_AUDIT),
          };
        });
      },

      recordMessage: (message) => {
        set((s) => ({ messages: [message, ...s.messages].slice(0, MAX_MESSAGES) }));
        // After the write commits, never inside the updater — an updater can be
        // replayed and a notification is not idempotent (C25).
        useNotifications.getState().notify([contactMessageNotification(message)]);
      },

      resetContent: () =>
        set({ patches: {}, created: [], revisions: {}, audit: [], messages: get().messages }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-cms",
      partialize: (s) => ({
        patches: s.patches,
        created: s.created,
        revisions: s.revisions,
        audit: s.audit,
        messages: s.messages,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** The context every seam call takes — the device's edits, as data. */
export function cmsContextOf(state: Pick<CmsState, "patches" | "created" | "revisions" | "audit">): CmsContext {
  return {
    patches: state.patches,
    created: state.created,
    revisions: state.revisions,
    audit: state.audit,
  };
}

/**
 * The `CmsContext` every call into `services/cms` takes (the `useReviewContext`
 * pattern, C22). Memoised so it can be an effect dependency: a save changes its
 * identity and the surface refetches, nothing else does.
 */
export function useCmsContext(): CmsContext {
  const patches = useCms((s) => s.patches);
  const created = useCms((s) => s.created);
  const revisions = useCms((s) => s.revisions);
  const audit = useCms((s) => s.audit);
  return useMemo(() => ({ patches, created, revisions, audit }), [patches, created, revisions, audit]);
}

/** True when this device has edited anything — the public hooks' fast path. */
export function hasLocalEdits(ctx: CmsContext): boolean {
  return Object.keys(ctx.patches).length > 0 || ctx.created.length > 0;
}
