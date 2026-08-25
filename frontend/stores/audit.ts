"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuditEntry, User } from "@/types";
import {
  MAX_AUDIT_ENTRIES,
  actorFrom,
  buildAuditEntry,
  byRecency,
  dedupe,
  type AuditInput,
} from "@/lib/audit";
import { buildDemoAudit } from "@/lib/mock/audit";
import { currentUser } from "./auth";
import { useCustomers } from "./customers";
import { useOnboarding } from "./onboarding";
import { useOrders } from "./orders";

/**
 * audit store — the platform's trail of who changed what (Phase 15, G32).
 *
 * One append-only list, capped, newest first. Nothing here decides *what* is
 * worth recording: every entry arrives from a mutation that already happened,
 * built by `lib/audit`, and this store's whole job is to keep them and hand them
 * back in order.
 *
 * The design decision worth stating is where the **actor** comes from.
 *
 * Ten stores hold the mutations §6 calls important, and every one of their actions
 * already takes a `by: string` — a display label, threaded down from a component,
 * used in a log line or a status field. Passing the whole signed-in `User` down
 * instead would have meant changing forty call sites across eleven components to
 * record something none of them had an opinion about, and every one of those is a
 * chance to pass the wrong user. So `record` reads the session itself, through
 * `stores/auth.currentUser`. The consequences, stated rather than discovered:
 *
 *  - **A mutation is attributed to whoever is signed in when it commits**, which
 *    is exactly right for the admin desk (there is one session per browser and it
 *    is the person clicking) and is why the entry snapshots the name and role
 *    rather than storing a `userId` to join on later.
 *  - **A mutation with nobody signed in is attributed to `system`.** The demo
 *    autopilot advances orders with no session, and recording those as `System`
 *    is honest; dropping them would leave holes in the trail exactly where
 *    nobody was watching.
 *
 * `record` never throws and never blocks the mutation that called it. An audit
 * write that could fail a payout would make the trail a liability rather than a
 * record — so it returns the entry or `null` and the caller ignores the result.
 */

const STORE_VERSION = 1;

interface AuditState {
  /** Newest first, capped at `MAX_AUDIT_ENTRIES`. */
  entries: AuditEntry[];
  hydrated: boolean;
  seeded: boolean;

  // -- reads -------------------------------------------------------------
  /** Everything about one entity, newest first — an order's or an account's history. */
  forEntity: (entityId: string) => AuditEntry[];

  // -- writes ------------------------------------------------------------
  /**
   * Record one mutation. Actor from the session unless one is given — the
   * override exists for a mutation made *about* an account by a process that is
   * not that account, which nothing does yet and the seed needs.
   */
  record: (input: AuditInput, options?: { actor?: User | null; now?: number }) => AuditEntry | null;

  // -- lifecycle ---------------------------------------------------------
  seed: (now?: number) => void;
  resetDemo: (now?: number) => void;
  setHydrated: () => void;
}

/**
 * The seed's inputs, read from the stores that own them.
 *
 * Read at seed time rather than passed in, the same way `stores/support` reads the
 * orders it builds tickets from: the audit trail describes work done to entities
 * that live elsewhere, and it must name the ones this device actually has.
 */
function seedEntries(now: number): AuditEntry[] {
  return buildDemoAudit(
    useOrders.getState().orders,
    useCustomers.getState().accounts,
    useOnboarding.getState().vendorApplications,
    now,
  );
}

export const useAudit = create<AuditState>()(
  persist(
    (set, get) => ({
      entries: [],
      hydrated: false,
      seeded: false,

      forEntity: (entityId) =>
        get()
          .entries.filter((entry) => entry.entityId === entityId)
          .sort(byRecency),

      record: (input, options) => {
        const now = options?.now ?? Date.now();
        const actor = actorFrom(
          options?.actor === undefined ? currentUser() : options.actor,
        );
        const entry = buildAuditEntry(input, actor, now);
        set((s) => ({
          // Deduped on the way in as well as on the way out: the id is
          // deterministic, so a replayed mutation is the same entry and must not
          // push the oldest one off the end of the list for nothing.
          entries: dedupe([entry, ...s.entries]).slice(0, MAX_AUDIT_ENTRIES),
        }));
        return entry;
      },

      seed: (now = Date.now()) => {
        if (get().seeded) return;
        /**
         * Wait for the stores the seed names.
         *
         * `buildDemoAudit` asks the order book for a completed delivery and one
         * that ended badly, and the directory for a blocked account. Seeding
         * before those stores have rehydrated would produce the four entries that
         * need nothing — and mark the seed **done**, leaving the trail
         * permanently missing every order-shaped line. So an empty order book
         * means "not yet", not "nothing to seed".
         */
        if (!useOrders.getState().orders.length) return;
        const demo = seedEntries(now);
        set((s) => ({
          // This device's own entries win on a collision, and both are kept:
          // the seed describes work somebody else did and the local entries
          // describe work done here, and a trail that dropped either would be
          // lying about one of them.
          entries: dedupe([...s.entries, ...demo]).sort(byRecency).slice(0, MAX_AUDIT_ENTRIES),
          seeded: true,
        }));
      },

      resetDemo: (now = Date.now()) =>
        set({ entries: seedEntries(now).sort(byRecency), seeded: true }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-audit",
      version: STORE_VERSION,
      partialize: (s) => ({ entries: s.entries, seeded: s.seeded }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        state?.seed();
      },
    },
  ),
);

/**
 * Record one mutation from outside React.
 *
 * The form every store guard uses, so a mutation site reads as one line beside
 * the commit it describes rather than three lines of store plumbing. Deliberately
 * swallowing its own failure: see the store's header.
 */
export function recordAudit(input: AuditInput): void {
  const append = () => {
    try {
      useAudit.getState().record(input);
    } catch {
      // An audit write must never take a payout with it.
    }
  };

  if (useAudit.getState().hydrated) return append();

  /**
   * Rehydrate first when the log has not come up yet.
   *
   * A mutation can happen on a surface that never opens the audit screen — a
   * restaurant saving its delivery terms, a customer cancelling a wallet order —
   * and on those the store is still at its initial empty state. Appending
   * straight into it would work for exactly as long as it took something to
   * rehydrate, at which point storage's older contents would replace the entry.
   * So the persisted log is loaded, and the entry is appended after it. The id is
   * deterministic, so this cannot append twice.
   */
  try {
    void Promise.resolve(useAudit.persist.rehydrate()).then(append);
  } catch {
    // No persistence in this environment — server render, a test runner, a
    // browser with storage denied. An entry held only in memory is worth less
    // than a persisted one and far more than a dropped one.
    append();
  }
}
