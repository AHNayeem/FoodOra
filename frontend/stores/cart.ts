"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, CartVendor } from "@/types";

/**
 * cart store — the single-vendor shopping cart (Phase C7).
 *
 * A food cart holds items from one vendor at a time (you can't mix a pizzeria
 * and a burger joint in one delivery). Adding from a different vendor therefore
 * stages a `pending` add and surfaces a "start a new cart?" prompt instead of
 * silently mixing or discarding. Persistence + explicit rehydration mirror the
 * auth store so the header badge never causes an SSR/client mismatch.
 */
interface PendingAdd {
  vendor: CartVendor;
  line: CartLine;
}

interface CartState {
  vendor: CartVendor | null;
  lines: CartLine[];
  isOpen: boolean;
  hydrated: boolean;
  /** Set when an add is blocked by the single-vendor rule; drives the prompt. */
  pending: PendingAdd | null;

  /** Add a line. Returns whether it was blocked by a vendor conflict. */
  add: (vendor: CartVendor, line: CartLine) => { conflict: boolean };
  /** Resolve a conflict by discarding the old cart and applying the pending add. */
  confirmSwitch: () => void;
  cancelSwitch: () => void;

  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;

  open: () => void;
  close: () => void;
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

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      vendor: null,
      lines: [],
      isOpen: false,
      hydrated: false,
      pending: null,

      add: (vendor, line) => {
        const state = get();
        const conflict =
          state.lines.length > 0 && state.vendor?.id !== vendor.id;
        if (conflict) {
          set({ pending: { vendor, line } });
          return { conflict: true };
        }
        set({ vendor, lines: mergeLine(state.lines, line) });
        return { conflict: false };
      },

      confirmSwitch: () => {
        const { pending } = get();
        if (!pending) return;
        set({
          vendor: pending.vendor,
          lines: [pending.line],
          pending: null,
          isOpen: true,
        });
      },

      cancelSwitch: () => set({ pending: null }),

      setQuantity: (lineId, quantity) => {
        if (quantity <= 0) return get().removeLine(lineId);
        set((s) => ({
          lines: s.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
        }));
      },

      removeLine: (lineId) =>
        set((s) => {
          const lines = s.lines.filter((l) => l.id !== lineId);
          return { lines, vendor: lines.length ? s.vendor : null };
        }),

      clear: () => set({ lines: [], vendor: null }),

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-cart",
      partialize: (s) => ({ vendor: s.vendor, lines: s.lines }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
