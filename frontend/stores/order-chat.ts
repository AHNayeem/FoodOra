"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ContactAuthor, ContactParty, Order, OrderThread } from "@/types";
import {
  appendEntry,
  openThread,
  threadIdFor,
  withRider,
} from "@/lib/order-chat";
import { syncAcrossWindows } from "@/lib/store-sync";

/**
 * order-chat store — the contact threads, on both surfaces (Phase 17, G27).
 *
 * The customer's tracker and the courier's trip screen read and write the *same*
 * rows, for the same reason the four order surfaces share one order store: a
 * conversation with two copies is not a conversation. A rider answering "at the
 * blue gate" from the tab next door appears on the customer's tracker, because
 * both are reading this key in localStorage — and that is what makes the feature
 * demonstrable rather than a message box that never receives anything.
 *
 * Two rules, matching the others:
 *
 *  1. **Every mutation goes through `lib/order-chat`.** It refuses an empty
 *     message, truncates a long one and mints the entry; nothing here writes an
 *     entry itself.
 *  2. **Threads are addressed, not searched.** `threadIdFor(orderId, party)` is
 *     stable, so opening a conversation twice from two surfaces cannot produce two
 *     of them.
 *
 * No notifications. A thread is a place both parties are already looking — the
 * tracker and the trip screen — and routing every "ok" into the inbox would make
 * the notification centre useless for the things that actually need it (§C25's
 * whole point). Phase E turns this into a subscription; the actions keep their
 * signatures.
 */
const STORE_VERSION = 1;

interface OrderChatState {
  threads: OrderThread[];
  hydrated: boolean;

  // -- reads -------------------------------------------------------------
  /** The thread for this order and party, or null if nobody has opened one. */
  threadFor: (orderId: string, party: ContactParty) => OrderThread | null;

  // -- writes ------------------------------------------------------------
  /** Say something. Opens the thread on first use. */
  send: (
    order: Order,
    party: ContactParty,
    input: { author: ContactAuthor; authorName: string; body: string },
  ) => OrderThread;
  /** Record that somebody placed a call — see `lib/order-chat`. */
  logCall: (
    order: Order,
    party: ContactParty,
    input: { author: ContactAuthor; authorName: string },
  ) => OrderThread;
  /** Drop everything — the demo bar's reset. */
  resetDemo: () => void;
  setHydrated: () => void;
}

export const useOrderChat = create<OrderChatState>()(
  persist(
    (set, get) => ({
      threads: [],
      hydrated: false,

      threadFor: (orderId, party) =>
        get().threads.find((t) => t.id === threadIdFor(orderId, party)) ?? null,

      send: (order, party, input) => commit(set, get, order, party, {
        kind: "message",
        ...input,
      }),

      logCall: (order, party, input) => commit(set, get, order, party, {
        kind: "call",
        ...input,
      }),

      resetDemo: () => set({ threads: [] }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-order-chat",
      version: STORE_VERSION,
      partialize: (s) => ({ threads: s.threads }),
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
syncAcrossWindows("foodora-order-chat", () => void useOrderChat.persist.rehydrate());

/**
 * The one write path.
 *
 * Both actions are the same three steps — find or open the thread, bind the
 * courier if dispatch has chosen one since, append — and writing them twice is how
 * a call entry ends up on a thread a message entry would have created differently.
 */
function commit(
  set: (fn: (s: OrderChatState) => Partial<OrderChatState>) => void,
  get: () => OrderChatState,
  order: Order,
  party: ContactParty,
  input: {
    kind: "message" | "call";
    author: ContactAuthor;
    authorName: string;
    body?: string;
  },
): OrderThread {
  const existing = get().threadFor(order.id, party);
  const base = withRider(existing ?? openThread(order, party), order);
  const next = appendEntry(base, input);

  set((s) => ({
    threads: s.threads.some((t) => t.id === next.id)
      ? s.threads.map((t) => (t.id === next.id ? next : t))
      : [...s.threads, next],
  }));
  return next;
}
