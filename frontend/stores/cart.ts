"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, CartVendor } from "@/types";
import * as server from "@/services/cart";

/**
 * cart store — the single-vendor shopping cart (Phase C7).
 *
 * A food cart holds items from one vendor at a time (you can't mix a pizzeria
 * and a burger joint in one delivery). Adding from a different vendor therefore
 * stages a `pending` add and surfaces a "start a new cart?" prompt instead of
 * silently mixing or discarding. Persistence + explicit rehydration mirror the
 * auth store so the header badge never causes an SSR/client mismatch.
 *
 * ## V1 Unit 2: the same store, now mirrored to the server
 *
 * Every action below is unchanged in signature, timing and return type — `add` is still
 * synchronous and still returns `{ conflict }` on the same tick, because six components
 * depend on that and V1 changes none of them. What is new is that each action also *echoes*
 * itself to `services/cart.ts` when `LIVE.cart` is on, and that the rehydration step pulls
 * the server's basket if there is one.
 *
 * Three consequences worth understanding before changing anything here:
 *
 * 1. **The mirror is fire-and-forget.** A store action cannot be awaited by its caller
 *    without changing the caller, so nothing waits for the network. The local cart is
 *    briefly authoritative and the server catches up.
 * 2. **The server is authoritative on the next read.** `hydrate()` replaces local state with
 *    the server's cart when one exists, which is what makes "add on your phone, check out on
 *    your laptop" work — and what silently repairs a mirror that failed earlier.
 * 3. **Prices are the server's.** A hydrated line carries `basePrice` and `unitPrice` as
 *    stored, so a basket built against a stale page corrects itself on reload rather than
 *    at checkout.
 *
 * The store deliberately holds **no** `syncing` or `error` field. Adding one would change
 * `CartState`, which is the interface this unit may not touch, and the honest place for a
 * failed-mirror message is the surface that can retry — checkout, which prices the server's
 * cart. Failures are logged by `services/cart.ts` in the meantime.
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
  /**
   * Replace the whole basket with one rebuilt elsewhere — a reorder (Phase 17,
   * G35).
   *
   * A reorder is many lines at once and the single-vendor rule is answered
   * *before* it runs (the reorder dialog asks), so it cannot go through `add`:
   * `add` stages one pending line and prompts, which would ask the same question
   * again per dish. This is the one action that discards a basket without a
   * prompt of its own, and the surface owes the customer that prompt.
   */
  replaceWith: (vendor: CartVendor, lines: CartLine[]) => void;

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

/**
 * A line's option ids, which is all the server accepts.
 *
 * It reconstructs the name and price from the dish's stored option rows — see
 * `backend/src/modules/cart/presentation/inputs/cart.inputs.ts` for why a client is not
 * allowed to state a price.
 */
const optionIdsOf = (line: CartLine): string[] => line.options.map((o) => o.optionId);

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

        // `replaceExisting: false` — there is no conflict to resolve, and passing `true`
        // here would let a stale local cart silently discard a server basket the store has
        // not seen yet (a second device, or a rehydration that has not landed).
        void server.addItem({
          foodId: line.foodId,
          optionIds: optionIdsOf(line),
          quantity: line.quantity,
          replaceExisting: false,
        });
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

        // The customer has now answered the prompt, so `replaceExisting` is theirs to grant.
        // This is the one call that is allowed to discard the server's basket.
        void server.addItem({
          foodId: pending.line.foodId,
          optionIds: optionIdsOf(pending.line),
          quantity: pending.line.quantity,
          replaceExisting: true,
        });
      },

      cancelSwitch: () => set({ pending: null }),

      setQuantity: (lineId, quantity) => {
        if (quantity <= 0) return get().removeLine(lineId);
        set((s) => ({
          lines: s.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
        }));
        void server.updateItemQuantity(lineId, quantity);
      },

      removeLine: (lineId) => {
        set((s) => {
          const lines = s.lines.filter((l) => l.id !== lineId);
          return { lines, vendor: lines.length ? s.vendor : null };
        });
        void server.removeItem(lineId);
      },

      clear: () => {
        set({ lines: [], vendor: null });
        void server.clearCart();
      },

      replaceWith: (vendor, lines) => {
        if (lines.length === 0) return;
        set({ vendor, lines, pending: null, isOpen: true });
        /**
         * Mirrored as a clear followed by adds, **awaited in sequence**.
         *
         * The other actions here fire and forget because each is one independent
         * write. These are not independent: an `addItem` that overtook the
         * `clearCart` would be wiped by it, and the customer would arrive at a
         * checkout priced from a basket missing its first dish. Still
         * fire-and-forget as far as the caller is concerned — the local basket is
         * authoritative until the next read, exactly as documented above.
         */
        void (async () => {
          await server.clearCart();
          for (const line of lines) {
            await server.addItem({
              foodId: line.foodId,
              optionIds: optionIdsOf(line),
              quantity: line.quantity,
              replaceExisting: false,
            });
          }
        })();
      },

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-cart",
      partialize: (s) => ({ vendor: s.vendor, lines: s.lines }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        // Local storage first so the badge is correct immediately, then the server's copy
        // when it arrives. Doing it in this order is why a signed-in customer sees their
        // own basket rather than a flash of the last one this browser held.
        void hydrateFromServer();
      },
    },
  ),
);

/**
 * Replace local state with the server's basket, if the server has one.
 *
 * Exported for later units (checkout will want to re-read before pricing) and called
 * automatically on rehydration, so no component had to change to get this.
 *
 * A server cart of `null` is left alone rather than clearing the local one. That asymmetry
 * is deliberate: `null` means "no basket on the server", which is equally consistent with a
 * mirror that failed earlier and with a genuinely empty account — and of the two possible
 * mistakes, keeping a basket the customer built is much better than deleting it.
 */
export async function hydrateFromServer(): Promise<void> {
  if (!server.cartSyncEnabled()) return;

  const result = await server.fetchCart();
  if (result.status !== "ok" || !result.cart) return;

  useCart.setState({ vendor: result.cart.vendor, lines: result.cart.lines });
}
