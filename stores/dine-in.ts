"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CartLine,
  CartVendor,
  DineInRound,
  ServiceRequest,
} from "@/types";
import { sessionKey } from "@/lib/qr";

/**
 * dine-in store — one guest's sitting at one table (Phase C12).
 *
 * Deliberately *not* the delivery cart (`stores/cart.ts`): a table sitting is a
 * different object with a different lifecycle. It accumulates rounds instead of
 * being emptied at checkout, it has no delivery address, and it must survive a
 * page refresh mid-meal — a guest putting their phone down and picking it back
 * up should still see their bill. It reuses `CartLine` because a chosen dish
 * with options is the same thing in both worlds.
 *
 * Persistence + explicit rehydration mirror the cart/auth stores so the sticky
 * bill bar never causes an SSR/client mismatch.
 */
interface DineInState {
  /** Identity of the current sitting — `vendorId:tableId`. */
  key: string | null;
  vendor: CartVendor | null;
  tableId: string | null;
  tableLabel: string | null;
  guestName: string;
  /** True once the welcome sheet has been dismissed for this sitting. */
  started: boolean;
  /** The round being built, not yet sent. */
  lines: CartLine[];
  rounds: DineInRound[];
  requests: ServiceRequest[];
  isTicketOpen: boolean;
  hydrated: boolean;

  /**
   * Attach to a table. Resuming the same sitting is a no-op (the bill stays);
   * scanning a different table or venue starts a clean one.
   */
  openSession: (
    vendor: CartVendor,
    tableId: string | null,
    tableLabel: string | null,
  ) => void;
  start: (guestName: string) => void;

  add: (line: CartLine) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearLines: () => void;

  /** Commit a round returned by the service and empty the working lines. */
  commitRound: (round: DineInRound) => void;
  addRequest: (request: ServiceRequest) => void;

  /** Close the tab — wipes the bill so the next guest starts fresh. */
  endSession: () => void;

  openTicket: () => void;
  closeTicket: () => void;
  setHydrated: () => void;
}

function mergeLine(lines: CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((l) => l.id === line.id);
  if (existing) {
    return lines.map((l) =>
      l.id === line.id ? { ...l, quantity: l.quantity + line.quantity } : l,
    );
  }
  return [...lines, line];
}

const emptySitting = {
  guestName: "",
  started: false,
  lines: [] as CartLine[],
  rounds: [] as DineInRound[],
  requests: [] as ServiceRequest[],
  isTicketOpen: false,
};

export const useDineIn = create<DineInState>()(
  persist(
    (set, get) => ({
      key: null,
      vendor: null,
      tableId: null,
      tableLabel: null,
      ...emptySitting,
      hydrated: false,

      openSession: (vendor, tableId, tableLabel) => {
        const next = sessionKey(vendor.id, tableId);
        if (get().key === next) {
          // Same table — keep the running bill, just refresh the snapshot.
          set({ vendor, tableLabel });
          return;
        }
        set({ ...emptySitting, key: next, vendor, tableId, tableLabel });
      },

      start: (guestName) => set({ started: true, guestName: guestName.trim() }),

      add: (line) => set((s) => ({ lines: mergeLine(s.lines, line) })),

      setQuantity: (lineId, quantity) => {
        if (quantity <= 0) return get().removeLine(lineId);
        set((s) => ({
          lines: s.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
        }));
      },

      removeLine: (lineId) =>
        set((s) => ({ lines: s.lines.filter((l) => l.id !== lineId) })),

      clearLines: () => set({ lines: [] }),

      commitRound: (round) =>
        set((s) => ({ rounds: [...s.rounds, round], lines: [], isTicketOpen: false })),

      addRequest: (request) => set((s) => ({ requests: [...s.requests, request] })),

      endSession: () => set({ ...emptySitting, started: true }),

      openTicket: () => set({ isTicketOpen: true }),
      closeTicket: () => set({ isTicketOpen: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-dine-in",
      partialize: (s) => ({
        key: s.key,
        vendor: s.vendor,
        tableId: s.tableId,
        tableLabel: s.tableLabel,
        guestName: s.guestName,
        started: s.started,
        lines: s.lines,
        rounds: s.rounds,
        requests: s.requests,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
