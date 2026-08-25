"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StaffMember, StaffPermission, StaffStatus, User, Vendor } from "@/types";
import {
  editStaff,
  inviteStaff,
  ownerRecordFor,
  removeStaff,
  setStaffPermission,
  setStaffStatus,
  type StaffError,
  type StaffInput,
} from "@/lib/staff";
import { recordAudit } from "./audit";

/**
 * staff store — the people who work at each restaurant (Phase 10, G24).
 *
 * One flat list rather than a map keyed by vendor, which is the opposite of
 * `stores/menu` and `stores/vendor-settings` and is deliberate: a staff member
 * carries `vendorId` on the record (it is a `BaseEntity` with a foreign key, the
 * shape a real table would have), and `lib/staff.teamFor` is the selector. A menu
 * draft is a *diff against a seed* and has nowhere else to put its key; a colleague
 * is a row.
 *
 * Two rules, the same ones every other store follows:
 *
 *  1. **Every write goes through `lib/staff`.** The domain validates the fields,
 *     refuses a duplicate invitation, refuses removing the last owner and folds a
 *     permission change into the *difference* from the role. Nothing here decides
 *     anything.
 *  2. **The owner is seeded, not invited.** `ensureOwner` mints the one record that
 *     corresponds to an account somebody can sign in as, so the list is never empty
 *     and the last-owner guard has something to be about. Idempotent, and keyed on
 *     the account rather than the clock so a second device does not mint a second
 *     owner.
 *
 * What this store deliberately does **not** do is create a `User`. There is no mail
 * server, so an invitation is a record saying somebody was asked — not a login that
 * exists. Enforcing these permissions across the platform needs a session belonging
 * to a staff member, which is G31 (Phase 14); `lib/staff.staffCan` is the predicate
 * that will be asked and it works already.
 *
 * Phase E makes this a cache of a server-owned `staff` table and `invite` becomes a
 * mutation that actually sends the mail. No signature changes.
 */

const STORE_VERSION = 1;

interface StaffState {
  members: StaffMember[];
  hydrated: boolean;

  // -- writes ------------------------------------------------------------
  /**
   * Mint the owner's record for a restaurant, once. Returns nothing: it is a
   * seeding step the settings screen calls on mount, not an action with an outcome.
   */
  ensureOwner: (vendor: Vendor, user: Pick<User, "id" | "name" | "email" | "phone">) => void;
  invite: (
    vendorId: string,
    input: StaffInput,
    invitedBy: string,
  ) => { member: StaffMember | null; errors: Record<string, StaffError> };
  edit: (
    id: string,
    input: StaffInput,
  ) => { errors: Record<string, StaffError> };
  setStatus: (id: string, to: StaffStatus) => { error: StaffError | null };
  setPermission: (
    id: string,
    permission: StaffPermission,
    enabled: boolean,
  ) => { error: StaffError | null };
  /** Withdraw an invitation. Only an `invited` record can go — see `lib/staff`. */
  remove: (id: string) => { error: StaffError | null };

  // -- lifecycle ---------------------------------------------------------
  resetDemo: () => void;
  setHydrated: () => void;
}

export const useStaff = create<StaffState>()(
  persist(
    (set, get) => ({
      members: [],
      hydrated: false,

      ensureOwner: (vendor, user) => {
        const owner = ownerRecordFor(vendor, user, Date.now());
        // Guarded on the *id*, which is derived from the account — so this is a
        // genuine no-op on every render after the first, and on a second device it
        // finds the record already there rather than adding a rival owner.
        if (get().members.some((m) => m.id === owner.id)) return;
        set((s) => ({ members: [...s.members, owner] }));
      },

      invite: (vendorId, input, invitedBy) => {
        // Scoped to this restaurant's team: the duplicate-email guard is per
        // vendor, because the same person may legitimately work at two.
        const existing = get().members.filter((m) => m.vendorId === vendorId);
        const result = inviteStaff(existing, input, {
          vendorId,
          invitedBy,
          now: Date.now(),
        });
        if (!result.member) return result;
        set((s) => ({ members: [...s.members, result.member!] }));
        return result;
      },

      edit: (id, input) => {
        const current = get().members.find((m) => m.id === id);
        if (!current) return { errors: { member: "errors.notFound" } };
        const scoped = get().members.filter((m) => m.vendorId === current.vendorId);
        const result = editStaff(scoped, id, input, Date.now());
        if (Object.keys(result.errors).length) return { errors: result.errors };
        replace(set, result.members);
        // Phase 15: a role *is* a permission set (`lib/staff.STAFF_PERMISSIONS`),
        // so changing somebody's role is one of §6's "permission changes" and the
        // trail says so. A name or phone correction is not, hence the condition.
        if (input.role !== current.role) {
          recordAudit({
            action: "permission.changed",
            entity: "staff",
            entityId: id,
            metadata: {
              name: current.name,
              vendorId: current.vendorId,
              change: `role ${current.role} → ${input.role}`,
            },
          });
        }
        return { errors: {} };
      },

      setStatus: (id, to) => {
        const current = get().members.find((m) => m.id === id);
        if (!current) return { error: "errors.notFound" };
        const scoped = get().members.filter((m) => m.vendorId === current.vendorId);
        const result = setStaffStatus(scoped, id, to, Date.now());
        if (result.error) return { error: result.error };
        replace(set, result.members);
        return { error: null };
      },

      setPermission: (id, permission, enabled) => {
        const current = get().members.find((m) => m.id === id);
        const result = setStaffPermission(get().members, id, permission, enabled, Date.now());
        if (result.error) return { error: result.error };
        set({ members: result.members });
        // §6's "permission changes", literally.
        recordAudit({
          action: "permission.changed",
          entity: "staff",
          entityId: id,
          metadata: {
            name: current?.name ?? id,
            vendorId: current?.vendorId ?? null,
            change: `${enabled ? "granted" : "revoked"} ${permission}`,
          },
        });
        return { error: null };
      },

      remove: (id) => {
        const result = removeStaff(get().members, id, Date.now());
        if (result.error) return { error: result.error };
        set({ members: result.members });
        return { error: null };
      },

      /**
       * A reset drops every team.
       *
       * They only exist because of invitations this device sent, and the owner
       * records are re-minted from the account the moment a settings screen opens —
       * so nothing is lost that cannot be recovered from the accounts themselves.
       * The same reasoning `stores/payouts.resetDemo` applies to transfers.
       */
      resetDemo: () => set({ members: [] }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-staff",
      version: STORE_VERSION,
      partialize: (s) => ({ members: s.members }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * Commit a per-vendor result back into the flat list.
 *
 * `lib/staff` works over one restaurant's team, so a result has to be merged
 * rather than assigned: replacing `members` with a scoped array would delete every
 * other restaurant's team. One helper, so no action can forget.
 */
function replace(
  set: (fn: (s: StaffState) => Partial<StaffState>) => void,
  scoped: StaffMember[],
) {
  const byId = new Map(scoped.map((m) => [m.id, m]));
  set((s) => ({ members: s.members.map((m) => byId.get(m.id) ?? m) }));
}
