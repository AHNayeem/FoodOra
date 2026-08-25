"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Customer, CustomerBlockReason, CustomerRecord } from "@/types";
import { buildDemoCustomers } from "@/lib/mock/customers";
import {
  blockCustomer,
  buildDirectory,
  noteCustomer,
  normalisePhone,
  unblockCustomer,
  type CustomerError,
} from "@/lib/customers";
import { useOrders } from "./orders";
import { useSupport } from "./support";
import { sessionCan } from "./auth";
import { recordAudit } from "./audit";

/**
 * customers store — the platform's customer directory (Phase 11, G15).
 *
 * What this store holds is deliberately narrow: **only the accounts somebody has
 * managed.** The directory itself — everyone who has ordered or complained, with
 * their spend and their counts — is not state at all. It is derived on read from
 * the order and ticket stores by `lib/customers.buildDirectory`, which is what
 * makes a reviewer's own checkout show up in `/admin/customers` on the next render
 * without anything having to remember to write a row.
 *
 * Three rules, mirroring `stores/orders` and `stores/support`:
 *
 *  1. **Every mutation goes through `lib/customers`.** The domain refuses a second
 *     block, an unblock of an active account and an unwritten reason, and each
 *     change appends a moderation event. Nothing here writes `status` directly.
 *  2. **A derived row is minted on first write, not on first sight.** Blocking
 *     somebody who has only ever been an order contact upserts them into
 *     `accounts` as part of the same action (`ensure` below) — so the persisted set
 *     stays the size of the work the desk has actually done, rather than growing a
 *     row per guest checkout.
 *  3. **The money is not here.** Spend, refunds and order counts are read from the
 *     shared stores every time. There is no cached total to go stale, which is the
 *     whole of §5.4 for this surface.
 */

const STORE_VERSION = 1;

interface CustomersState {
  /** Only the accounts that have been seeded or acted on — see the note above. */
  accounts: Customer[];
  hydrated: boolean;
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  getById: (id: string) => Customer | undefined;
  /** The whole directory, derived. Callers pass the shared records in. */
  directory: () => CustomerRecord[];

  // -- writes ------------------------------------------------------------
  /** Stop somebody ordering. Grounds and a written reason are both required. */
  block: (
    id: string,
    input: { reason: CustomerBlockReason; note: string; by: string },
  ) => { customer: Customer | null; error: CustomerError | null };
  /** Let them order again. */
  unblock: (
    id: string,
    input: { note?: string | null; by: string },
  ) => { customer: Customer | null; error: CustomerError | null };
  /** Write something down without changing anything. */
  addNote: (
    id: string,
    input: { body: string; by: string },
  ) => { customer: Customer | null; error: CustomerError | null };

  // -- lifecycle ---------------------------------------------------------
  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

/** The derived directory, from whatever the other two stores currently hold. */
function currentDirectory(accounts: Customer[]): CustomerRecord[] {
  return buildDirectory(
    accounts,
    useOrders.getState().orders,
    useSupport.getState().tickets,
  );
}

export const useCustomers = create<CustomersState>()(
  persist(
    (set, get) => ({
      accounts: [],
      hydrated: false,
      seeded: false,

      getById: (id) => get().accounts.find((c) => c.id === id),
      directory: () => currentDirectory(get().accounts),

      /**
       * Phase 14: every write here is `customers.manage`.
       *
       * Reading the directory is `customers.view`, which a moderator holds — they
       * need to see who wrote a review. Stopping somebody ordering is not theirs,
       * and neither is writing on their file, because a note on an account is part
       * of the record a block is later justified by.
       */
      block: (id, input) => {
        const result = guarded(() =>
          moderate(set, get, id, (customer, now) => blockCustomer(customer, input, now)),
        );
        // Phase 15: §6's "customer blocking". The grounds and the written reason
        // are both carried, because the moderation entry on the account explains
        // it to the next agent and the audit entry explains it to whoever asks
        // months later why an account stopped ordering.
        if (result.customer) {
          recordAudit({
            action: "customer.blocked",
            entity: "customer",
            entityId: result.customer.id,
            metadata: {
              name: result.customer.name,
              reason: input.reason,
              note: input.note.trim(),
            },
          });
        }
        return result;
      },

      unblock: (id, input) => {
        const result = guarded(() =>
          moderate(set, get, id, (customer, now) => unblockCustomer(customer, input, now)),
        );
        if (result.customer) {
          recordAudit({
            action: "customer.unblocked",
            entity: "customer",
            entityId: result.customer.id,
            metadata: { name: result.customer.name, note: input.note?.trim() || null },
          });
        }
        return result;
      },

      addNote: (id, input) =>
        guarded(() =>
          moderate(set, get, id, (customer, now) => noteCustomer(customer, input, now)),
        ),

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        const demo = buildDemoCustomers(now);
        set((s) => {
          const known = new Set(s.accounts.map((c) => c.id));
          return {
            accounts: [...s.accounts, ...demo.filter((c) => !known.has(c.id))],
            seeded: true,
          };
        });
      },

      resetDemo: (now = Date.now()) =>
        set({ accounts: buildDemoCustomers(now), seeded: true }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-customers",
      version: STORE_VERSION,
      partialize: (s) => ({ accounts: s.accounts, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

/**
 * Refuse the write unless the session holds `customers.manage` (Phase 14, G31).
 *
 * A wrapper rather than a line inside `moderate`, because `moderate` is handed a
 * domain function and has no idea which of the three actions it is running — and
 * a guard that cannot name what it is guarding is a guard nobody can audit.
 */
function guarded(
  run: () => { customer: Customer | null; error: CustomerError | null },
): { customer: Customer | null; error: CustomerError | null } {
  if (!sessionCan("customers.manage")) {
    return { customer: null, error: "errors.notPermitted" };
  }
  return run();
}

/**
 * The shape every moderation action shares: find the person (managed *or*
 * derived), run the domain function, and commit only if it agreed.
 *
 * The lookup falling through to the derived directory is the point. A guest who
 * has placed one order has no persisted row, and the desk must still be able to
 * stop them — so the row is minted from the orders that prove they exist, at the
 * moment somebody acts, and never before.
 */
function moderate(
  set: (fn: (s: CustomersState) => Partial<CustomersState>) => void,
  get: () => CustomersState,
  id: string,
  apply: (customer: Customer, now: number) => { customer: Customer; error: CustomerError | null },
): { customer: Customer | null; error: CustomerError | null } {
  const managed = get().accounts.find((c) => c.id === id);
  const subject = managed ?? currentDirectory(get().accounts).find(
    (r) => r.customer.id === id,
  )?.customer;
  if (!subject) return { customer: null, error: "errors.customerNotFound" };

  const result = apply(subject, Date.now());
  if (result.error) return { customer: null, error: result.error };

  set((s) => ({
    accounts: managed
      ? s.accounts.map((c) => (c.id === id ? result.customer : c))
      : [...s.accounts, result.customer],
  }));
  return { customer: result.customer, error: null };
}

// ---------------------------------------------------------------------------
// Selectors — shared by the admin directory and by checkout's gate
// ---------------------------------------------------------------------------

/**
 * Is this phone number blocked?
 *
 * Read by checkout, which is what makes a block mean something rather than being
 * a chip in an admin table. It reads `accounts` rather than the directory because
 * only a managed row can be blocked, and checkout must not pay to rebuild the
 * whole directory on every keystroke.
 */
export function isPhoneBlocked(accounts: Customer[], phone: string): boolean {
  const key = normalisePhone(phone);
  if (!key) return false;
  return accounts.some(
    (c) => !c.deletedAt && c.status === "blocked" && normalisePhone(c.phone) === key,
  );
}

/** How many accounts are stopped — the directory's headline number. */
export function blockedCustomerCount(accounts: Customer[]): number {
  return accounts.filter((c) => !c.deletedAt && c.status === "blocked").length;
}
