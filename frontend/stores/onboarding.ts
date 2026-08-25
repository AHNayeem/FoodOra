"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DocumentStatus,
  OnboardingDocumentKind,
  Rider,
  RiderApplication,
  RiderDocumentKind,
  RiderStatus,
  Vendor,
  VendorApplication,
  VendorDocumentKind,
  VendorStatus,
} from "@/types";
import { buildVendorApplications } from "@/lib/mock/vendor-applications";
import { buildRiderApplications } from "@/lib/mock/rider-applications";
import {
  applicationNotifications,
  riderApplicationNotifications,
} from "@/lib/notifications";
import type { OnboardingError } from "@/lib/onboarding";
import {
  createVendorApplication,
  decideVendorApplication,
  editVendorApplication,
  reviewVendorDocument,
  submitVendorApplication,
  vendorFromApplication,
  type VendorApplicationDraft,
  type VendorDecisionInput,
} from "@/lib/vendor-onboarding";
import {
  canDispatchToRider,
  createRiderApplication,
  decideRiderApplication,
  editRiderApplication,
  reviewRiderDocument,
  riderFromApplication,
  submitRiderApplication,
  type RiderApplicationDraft,
  type RiderDecisionInput,
} from "@/lib/rider-onboarding";
import { emitNotifications } from "./notifications";
import { sessionCan } from "./auth";
import { recordAudit } from "./audit";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * onboarding store — every restaurant and rider application, on both sides
 * (Phases 6–7, G08–G13).
 *
 * One store for two entities, deliberately. Onboarding *is* one domain: the same
 * paperwork, the same review queue, the same five reviewer actions, the same
 * append-only log. Splitting it would duplicate every action twice over and give a
 * future permission model two places to gate; keeping the two collections apart
 * inside it costs one field name.
 *
 * Four rules, mirroring `stores/orders` and `stores/support`:
 *
 *  1. **Every mutation goes through `lib/vendor-onboarding` or
 *     `lib/rider-onboarding`.** The graphs refuse an illegal move and each change
 *     appends an event; nothing here writes `status` directly.
 *  2. **This store is the single authority on onboarding state.** `Vendor` and
 *     `Rider` carry no status field, so the marketing page, the dashboard gate,
 *     dispatch and the admin queue all read the same record. There is no default to
 *     fall back to and therefore nothing to disagree with.
 *  3. **Approval mints the record it promises.** An application with no listing (or
 *     no fleet record) gets one at the moment it is approved — otherwise "approved"
 *     would be a status with nothing behind it, and the owner would sign in to a
 *     dashboard that cannot resolve a restaurant.
 *  4. **Every committed change emits notifications**, through the same routing gate
 *     as the order lifecycle, so a new application state cannot ship without
 *     somebody deciding who hears about it.
 */

const STORE_VERSION = 1;

interface OnboardingState {
  vendorApplications: VendorApplication[];
  riderApplications: RiderApplication[];
  /**
   * Listings and fleet records minted by an approval on this device.
   *
   * Kept separately from `lib/mock/vendors` and `lib/mock/riders` because those are
   * the seed and this is what happened afterwards. They are *injected* into the
   * resolvers that need them (`services/vendor.getDashboardVendor`,
   * `services/delivery.getRiderProfile`, `dispatchRider`'s fleet) rather than looked
   * up from `lib/`, which is the same seam Phase 3 used for rider availability.
   */
  admittedVendors: Vendor[];
  admittedRiders: Rider[];
  hydrated: boolean;
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  vendorApplication: (id: string) => VendorApplication | undefined;
  /** The onboarding record governing a catalog listing. */
  vendorApplicationForVendor: (vendorId: string) => VendorApplication | undefined;
  /** The record for an owner account — how the dashboard gate resolves itself. */
  vendorApplicationForOwner: (ownerId: string) => VendorApplication | undefined;
  riderApplication: (id: string) => RiderApplication | undefined;
  riderApplicationForRider: (riderId: string) => RiderApplication | undefined;
  riderApplicationForUser: (userId: string) => RiderApplication | undefined;

  // -- writes: restaurants ----------------------------------------------
  /** Save a draft, or send it for review. Returns the stored application. */
  applyAsVendor: (input: {
    draft: VendorApplicationDraft;
    ownerId: string | null;
    submit: boolean;
    by: string;
  }) => VendorApplication;
  /** Send an existing draft (or a corrected rejection) for review. */
  submitVendor: (
    id: string,
    by: string,
  ) => { application: VendorApplication | null; error: OnboardingError | null };
  /** Approve, reject, suspend or reactivate. Mints the listing on a first approval. */
  decideVendor: (
    id: string,
    input: VendorDecisionInput,
  ) => { application: VendorApplication | null; error: OnboardingError | null };
  /** A reviewer's ruling on one document. */
  reviewVendorDocument: (
    id: string,
    kind: OnboardingDocumentKind,
    status: DocumentStatus,
    by: { authorName: string; note?: string | null },
  ) => { application: VendorApplication | null; error: OnboardingError | null };
  /** The spec's "edit" action, available to the applicant and the reviewer. */
  editVendor: (
    id: string,
    patch: Partial<VendorApplicationDraft>,
    by: { author: "applicant" | "reviewer"; authorName: string; note?: string | null },
  ) => { application: VendorApplication | null; error: OnboardingError | null };

  // -- writes: riders ---------------------------------------------------
  applyAsRider: (input: {
    draft: RiderApplicationDraft;
    userId: string | null;
    submit: boolean;
    by: string;
  }) => RiderApplication;
  submitRider: (
    id: string,
    by: string,
  ) => { application: RiderApplication | null; error: OnboardingError | null };
  decideRider: (
    id: string,
    input: RiderDecisionInput,
  ) => { application: RiderApplication | null; error: OnboardingError | null };
  reviewRiderDocument: (
    id: string,
    kind: OnboardingDocumentKind,
    status: DocumentStatus,
    by: { authorName: string; note?: string | null },
  ) => { application: RiderApplication | null; error: OnboardingError | null };
  editRider: (
    id: string,
    patch: Partial<RiderApplicationDraft>,
    by: { author: "applicant" | "reviewer"; authorName: string; note?: string | null },
  ) => { application: RiderApplication | null; error: OnboardingError | null };

  // -- lifecycle --------------------------------------------------------
  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      vendorApplications: [],
      riderApplications: [],
      admittedVendors: [],
      admittedRiders: [],
      hydrated: false,
      seeded: false,

      vendorApplication: (id) => get().vendorApplications.find((a) => a.id === id),
      vendorApplicationForVendor: (vendorId) =>
        get().vendorApplications.find((a) => a.vendorId === vendorId && !a.deletedAt),
      vendorApplicationForOwner: (ownerId) =>
        get().vendorApplications.find((a) => a.ownerId === ownerId && !a.deletedAt),
      riderApplication: (id) => get().riderApplications.find((a) => a.id === id),
      riderApplicationForRider: (riderId) =>
        get().riderApplications.find((a) => a.riderId === riderId && !a.deletedAt),
      riderApplicationForUser: (userId) =>
        get().riderApplications.find((a) => a.userId === userId && !a.deletedAt),

      // -- restaurants ----------------------------------------------------

      applyAsVendor: ({ draft, ownerId, submit, by }) => {
        // One application per account, refusals included. Somebody who applies
        // twice — or who fixes what was refused and applies again — is continuing
        // the same application, not starting a competing one, which is how a
        // platform ends up with two records of one restaurant. `rejected → pending`
        // is a legal move for exactly this reason.
        const existing = ownerId
          ? get().vendorApplications.find((a) => a.ownerId === ownerId && !a.deletedAt)
          : undefined;
        if (existing) {
          const edited = get().editVendor(existing.id, draft, {
            author: "applicant",
            authorName: by,
          });
          const stored = edited.application ?? existing;
          if (submit && (stored.status === "draft" || stored.status === "rejected")) {
            return get().submitVendor(stored.id, by).application ?? stored;
          }
          return stored;
        }

        const application = createVendorApplication({ draft, ownerId, submit, by });
        set((s) => ({ vendorApplications: [application, ...s.vendorApplications] }));
        emitApplicationEvent(application);
        return application;
      },

      submitVendor: (id, by) => {
        const current = get().vendorApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const result = submitVendorApplication(current, by);
        if (result.error) return { application: null, error: result.error };
        commitVendor(set, result.application);
        emitApplicationEvent(result.application);
        return { application: result.application, error: null };
      },

      /**
       * A reviewer's ruling.
       *
       * The listing is minted *after* the decision is accepted, not before: a
       * refused approval must leave no half-created restaurant behind, and the
       * domain is the only thing that knows whether the approval was legal.
       */
      decideVendor: (id, input) => {
        const current = get().vendorApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        // Phase 14: admitting, refusing or suspending a partner is
        // `restaurants.approve`. Only the admin queue calls this, so unlike
        // `stores/orders.advance` there is no actor to distinguish — every caller
        // is the platform ruling on somebody else's application.
        if (!sessionCan("restaurants.approve")) {
          return { application: null, error: "errors.notPermitted" };
        }

        const result = decideVendorApplication(current, input);
        if (result.error) return { application: null, error: result.error };

        let decided = result.application;
        let minted: Vendor | null = null;
        if (decided.status === "approved" && !decided.vendorId) {
          minted = vendorFromApplication(decided);
          decided = { ...decided, vendorId: minted.id, ownerId: minted.ownerId };
        }

        set((s) => ({
          vendorApplications: s.vendorApplications.map((a) => (a.id === id ? decided : a)),
          admittedVendors: minted ? [...s.admittedVendors, minted] : s.admittedVendors,
        }));
        emitApplicationEvent(decided);
        // Phase 15: §6's "restaurant approval". The minted listing is named in the
        // metadata rather than used as the entity id — the entity is the
        // application, because a rejection mints nothing and still has to be
        // findable in the trail.
        recordAudit({
          action: "restaurant.decided",
          entity: "vendor-application",
          entityId: id,
          metadata: {
            decision: input.decision,
            name: decided.restaurant.name,
            applicationNumber: decided.applicationNumber,
            vendorId: decided.vendorId,
            minted: minted !== null,
            reason: input.note?.trim() || null,
          },
        });
        return { application: decided, error: null };
      },

      reviewVendorDocument: (id, kind, status, by) => {
        const current = get().vendorApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const next = reviewVendorDocument(
          current,
          kind as VendorDocumentKind,
          status,
          by,
        );
        commitVendor(set, next);
        return { application: next, error: null };
      },

      editVendor: (id, patch, by) => {
        const current = get().vendorApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const next = editVendorApplication(current, patch, by);
        commitVendor(set, next);
        return { application: next, error: null };
      },

      // -- riders ---------------------------------------------------------

      applyAsRider: ({ draft, userId, submit, by }) => {
        // One application per account, refusals included — see `applyAsVendor`.
        const existing = userId
          ? get().riderApplications.find((a) => a.userId === userId && !a.deletedAt)
          : undefined;
        if (existing) {
          const edited = get().editRider(existing.id, draft, {
            author: "applicant",
            authorName: by,
          });
          const stored = edited.application ?? existing;
          if (submit && (stored.status === "draft" || stored.status === "rejected")) {
            return get().submitRider(stored.id, by).application ?? stored;
          }
          return stored;
        }

        const application = createRiderApplication({ draft, userId, submit, by });
        set((s) => ({ riderApplications: [application, ...s.riderApplications] }));
        emitRiderEvent(application);
        return application;
      },

      submitRider: (id, by) => {
        const current = get().riderApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const result = submitRiderApplication(current, by);
        if (result.error) return { application: null, error: result.error };
        commitRider(set, result.application);
        emitRiderEvent(result.application);
        return { application: result.application, error: null };
      },

      decideRider: (id, input) => {
        const current = get().riderApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        // Phase 14: the courier half of the same right — `riders.approve`.
        if (!sessionCan("riders.approve")) {
          return { application: null, error: "errors.notPermitted" };
        }

        const result = decideRiderApplication(current, input);
        if (result.error) return { application: null, error: result.error };

        let decided = result.application;
        let minted: Rider | null = null;
        if (decided.status === "approved" && !decided.riderId) {
          minted = riderFromApplication(decided);
          decided = { ...decided, riderId: minted.id };
        }

        set((s) => ({
          riderApplications: s.riderApplications.map((a) => (a.id === id ? decided : a)),
          admittedRiders: minted ? [...s.admittedRiders, minted] : s.admittedRiders,
        }));
        emitRiderEvent(decided);
        // Phase 15: §6's "rider approval".
        recordAudit({
          action: "rider.decided",
          entity: "rider-application",
          entityId: id,
          metadata: {
            decision: input.decision,
            name: decided.personal.name,
            applicationNumber: decided.applicationNumber,
            riderId: decided.riderId,
            minted: minted !== null,
            reason: input.note?.trim() || null,
          },
        });
        return { application: decided, error: null };
      },

      reviewRiderDocument: (id, kind, status, by) => {
        const current = get().riderApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const next = reviewRiderDocument(current, kind as RiderDocumentKind, status, by);
        commitRider(set, next);
        return { application: next, error: null };
      },

      editRider: (id, patch, by) => {
        const current = get().riderApplication(id);
        if (!current) return { application: null, error: "errors.applicationNotFound" };
        const next = editRiderApplication(current, patch, by);
        commitRider(set, next);
        return { application: next, error: null };
      },

      // -- lifecycle ------------------------------------------------------

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const vendorSeed = buildVendorApplications(now);
        const riderSeed = buildRiderApplications(now);
        set((s) => {
          const knownVendors = new Set(s.vendorApplications.map((a) => a.id));
          const knownRiders = new Set(s.riderApplications.map((a) => a.id));
          return {
            vendorApplications: [
              ...s.vendorApplications,
              ...vendorSeed.filter((a) => !knownVendors.has(a.id)),
            ],
            riderApplications: [
              ...s.riderApplications,
              ...riderSeed.filter((a) => !knownRiders.has(a.id)),
            ],
            seeded: true,
          };
        });
      },

      resetDemo: (now = Date.now()) =>
        set({
          vendorApplications: buildVendorApplications(now),
          riderApplications: buildRiderApplications(now),
          // A reset drops the minted records too: they only exist because of
          // decisions this device made, and keeping them would leave listings
          // behind with no application to explain them.
          admittedVendors: [],
          admittedRiders: [],
          seeded: true,
        }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-onboarding",
      version: STORE_VERSION,
      partialize: (s) => ({
        vendorApplications: s.vendorApplications,
        riderApplications: s.riderApplications,
        admittedVendors: s.admittedVendors,
        admittedRiders: s.admittedRiders,
        seeded: s.seeded,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

/**
 * Rehydrate this store when another window writes to it (Phase 18, G42) — one
 * surface accepting, blocking or paying changes what the surface in the next tab
 * is looking at, without a reload.
 */
syncAcrossWindows("foodora-onboarding", () => void useOnboarding.persist.rehydrate());

// ---------------------------------------------------------------------------
// Commit helpers — one write path each, so no action forgets `updatedAt`
// ---------------------------------------------------------------------------

type Setter = (fn: (s: OnboardingState) => Partial<OnboardingState>) => void;

function commitVendor(set: Setter, application: VendorApplication) {
  set((s) => ({
    vendorApplications: s.vendorApplications.map((a) =>
      a.id === application.id ? application : a,
    ),
  }));
}

function commitRider(set: Setter, application: RiderApplication) {
  set((s) => ({
    riderApplications: s.riderApplications.map((a) =>
      a.id === application.id ? application : a,
    ),
  }));
}

function emitApplicationEvent(application: VendorApplication) {
  const event = application.events[application.events.length - 1];
  if (event) emitNotifications(applicationNotifications(application, event));
}

function emitRiderEvent(application: RiderApplication) {
  const event = application.events[application.events.length - 1];
  if (event) emitNotifications(riderApplicationNotifications(application, event));
}

// ---------------------------------------------------------------------------
// Selectors — shared by the admin queues, the gates and dispatch
// ---------------------------------------------------------------------------

/**
 * A restaurant's onboarding status, or null if it has no record.
 *
 * Null is a real answer and not a default: the seed builds a record for every
 * catalog listing, so a vendor without one is a listing that appeared after
 * seeding, and treating that as "approved" would be exactly the silent fallback
 * §5.3 forbids. Callers gate on it explicitly.
 */
export function vendorStatusFor(
  applications: VendorApplication[],
  vendorId: string,
): VendorStatus | null {
  return (
    applications.find((a) => a.vendorId === vendorId && !a.deletedAt)?.status ?? null
  );
}

export function riderStatusFor(
  applications: RiderApplication[],
  riderId: string,
): RiderStatus | null {
  return (
    applications.find((a) => a.riderId === riderId && !a.deletedAt)?.status ?? null
  );
}

/**
 * Riders onboarding says dispatch must not use.
 *
 * The complement of `canDispatchToRider` over the whole record set, shaped as the
 * set `dispatchRider` already takes — so Phase 7's rule reaches dispatch through the
 * seam Phase 3 built rather than through a new argument. A rider with no record is
 * *not* blocked here: `lib/mock/riders` is seeded with a record each, so the only
 * way to have none is to be a fleet member this device has never heard of, and
 * silently freezing them out would be a gate nobody could see.
 */
export function undispatchableRiderIds(applications: RiderApplication[]): Set<string> {
  const ids = new Set<string>();
  for (const application of applications) {
    if (application.riderId && !canDispatchToRider(application.status)) {
      ids.add(application.riderId);
    }
  }
  return ids;
}

/** How many applications are waiting on a reviewer — the admin nav badges. */
export function pendingVendorCount(applications: VendorApplication[]): number {
  return applications.filter((a) => !a.deletedAt && a.status === "pending").length;
}

export function pendingRiderCount(applications: RiderApplication[]): number {
  return applications.filter((a) => !a.deletedAt && a.status === "pending").length;
}
