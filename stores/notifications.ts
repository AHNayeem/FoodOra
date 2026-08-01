"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppNotification, NotifyAudience } from "@/types";

/**
 * notifications store — the four in-app inboxes (spec: Notifications).
 *
 * One persisted list holds every role's notifications; each surface reads its
 * own slice via `useUnread(audience)` / `selectFor`. Keeping them together
 * rather than in four stores is what makes a demo work on a single device: the
 * customer places an order and the restaurant's bell increments in the next tab
 * over, because both are looking at the same key in localStorage.
 *
 * Writes come from exactly one place — `stores/orders.ts` after a committed
 * transition — so a notification cannot exist for something that did not happen.
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */

/** Keep the feed bounded — a demo device should not accumulate forever. */
const MAX_ITEMS = 80;

interface NotificationState {
  items: AppNotification[];
  hydrated: boolean;
  /** Append notifications, newest first, ignoring ids already present. */
  push: (items: AppNotification[]) => void;
  markRead: (id: string) => void;
  markAllRead: (audience: NotifyAudience) => void;
  clear: (audience: NotifyAudience) => void;
  setHydrated: () => void;
}

export const useNotifications = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      push: (incoming) =>
        set((s) => {
          const seen = new Set(s.items.map((n) => n.id));
          const fresh = incoming.filter((n) => !seen.has(n.id));
          if (fresh.length === 0) return {};
          return { items: [...fresh.reverse(), ...s.items].slice(0, MAX_ITEMS) };
        }),
      markRead: (id) =>
        set((s) => ({
          items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllRead: (audience) =>
        set((s) => ({
          items: s.items.map((n) =>
            n.audience === audience ? { ...n, read: true } : n,
          ),
        })),
      clear: (audience) =>
        set((s) => ({ items: s.items.filter((n) => n.audience !== audience) })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-notifications",
      partialize: (s) => ({ items: s.items }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** One audience's feed, newest first. */
export function selectFor(items: AppNotification[], audience: NotifyAudience) {
  return items.filter((n) => n.audience === audience);
}

/** Unread count for a bell badge. */
export function unreadCount(items: AppNotification[], audience: NotifyAudience): number {
  return items.reduce(
    (n, item) => (item.audience === audience && !item.read ? n + 1 : n),
    0,
  );
}
