"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppNotification,
  NotificationCampaign,
  NotificationDispatch,
  NotifyAudience,
} from "@/frontend/types";
import { channelsFor, dispatchesFor } from "@/frontend/lib/notifications";
import { REQUIRED_NOTIFICATIONS } from "@/frontend/services/settings";
import { useAuth } from "./auth";
import { useSettings } from "./settings";

/**
 * notifications store — the four in-app inboxes and the outbox (Phase C25).
 *
 * One persisted list holds every role's notifications; each surface reads its
 * own slice. Keeping them together rather than in four stores is what makes a
 * demo work on a single device: the customer places an order and the
 * restaurant's bell increments in the next tab over, because both are looking
 * at the same key in localStorage.
 *
 * **`notify` is the only door in, and the only gate.** Every domain store calls
 * it after a committed change; it asks `lib/notifications.channelsFor` where
 * the notification is allowed to go, drops the ones that are allowed nowhere,
 * stamps the surviving ones with the channels they went out on, and writes the
 * outbox rows a provider integration would have written. Putting the gate here
 * rather than at each call site is what makes the C28 preference matrix mean
 * something: there is one place that can disagree with it, and it is thirty
 * lines long.
 *
 * Reading the settings store from inside an action is deliberate. Preferences
 * are consulted *at emit*, not at read: the `channels` array on a stored
 * notification is a record of what we did, and toggling a switch afterwards
 * must not rewrite history.
 *
 * Same hydration contract as every other store: `skipHydration` plus an explicit
 * rehydrate, gated on `hydrated`, so SSR and the first client render agree.
 */

/** Keep the feed bounded — a demo device should not accumulate forever. */
const MAX_ITEMS = 120;
/** The outbox grows three rows per notification, so it is capped harder. */
const MAX_DISPATCHES = 240;

/**
 * v1 generalised `AppNotification` beyond orders (category, subject, channels).
 * Rows written before that carried `orderId`/`orderNumber` instead, and they are
 * migrated rather than dropped: an inbox that empties itself on upgrade teaches
 * people not to trust it.
 */
const STORE_VERSION = 1;

interface LegacyNotification {
  orderId?: string;
  orderNumber?: string;
}

/** Exactly what `partialize` keeps — and therefore what `migrate` must return. */
type PersistedNotifications = Pick<
  NotificationState,
  "items" | "outbox" | "campaigns" | "pushOptIn"
>;

interface NotificationState {
  items: AppNotification[];
  /** Every delivery attempt, newest first — the log the centre renders. */
  outbox: NotificationDispatch[];
  /** Broadcasts sent from the admin Notification Center. */
  campaigns: NotificationCampaign[];
  /**
   * Whether this device *wants* browser push. Separate from the browser's own
   * permission, which we do not own and cannot persist: this is the in-app
   * intent, and `lib/push` still has the last word.
   */
  pushOptIn: boolean;
  hydrated: boolean;

  /** The one door in: route, record, deliver. */
  notify: (items: AppNotification[]) => void;
  markRead: (id: string) => void;
  markAllRead: (audience: NotifyAudience) => void;
  clear: (audience: NotifyAudience) => void;
  /** Wipe every inbox and the log — the demo bar's reset. */
  resetAll: () => void;
  recordCampaign: (campaign: NotificationCampaign) => void;
  setPushOptIn: (value: boolean) => void;
  setHydrated: () => void;
}

/** The addresses a delivery would use — this prototype's one account. */
function contactOfRecord() {
  const user = useAuth.getState().user;
  return { email: user?.email ?? null, phone: user?.phone ?? null };
}

export const useNotifications = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      outbox: [],
      campaigns: [],
      pushOptIn: false,
      hydrated: false,

      notify: (incoming) => {
        const settings = useSettings.getState().settings;
        const contact = contactOfRecord();
        const seen = new Set(get().items.map((n) => n.id));

        const routed: AppNotification[] = [];
        const dispatches: NotificationDispatch[] = [];

        for (const item of incoming) {
          if (seen.has(item.id)) continue;
          const channels = channelsFor(item, settings, REQUIRED_NOTIFICATIONS);
          if (!channels.includes("inApp")) continue; // suppressed outright

          const stamped = { ...item, channels };
          routed.push(stamped);
          seen.add(item.id);
          if (item.audience === "customer") {
            dispatches.push(...dispatchesFor(stamped, contact));
          }
        }

        if (routed.length === 0) return;

        set((s) => ({
          items: [...routed.reverse(), ...s.items].slice(0, MAX_ITEMS),
          outbox: [...dispatches.reverse(), ...s.outbox].slice(0, MAX_DISPATCHES),
        }));

        // The browser notification itself is *not* raised here. A notification
        // is a key plus params (`types/notification.ts`), and this store cannot
        // translate — only a React tree holding the message catalog can. So the
        // store decides *whether* push was allowed, records it in `channels`,
        // and `components/notifications/push-bridge.tsx` draws it.
      },

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
        set((s) => {
          const dropped = new Set(
            s.items.filter((n) => n.audience === audience).map((n) => n.id),
          );
          return {
            items: s.items.filter((n) => n.audience !== audience),
            outbox: s.outbox.filter((d) => !dropped.has(d.notificationId)),
          };
        }),
      resetAll: () => set({ items: [], outbox: [], campaigns: [] }),
      recordCampaign: (campaign) =>
        set((s) => ({ campaigns: [campaign, ...s.campaigns].slice(0, 30) })),
      setPushOptIn: (value) => set({ pushOptIn: value }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-notifications",
      version: STORE_VERSION,
      partialize: (s) => ({
        items: s.items,
        outbox: s.outbox,
        campaigns: s.campaigns,
        pushOptIn: s.pushOptIn,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PersistedNotifications>;
        const empty: PersistedNotifications = {
          items: [],
          outbox: [],
          campaigns: [],
          pushOptIn: false,
        };
        if (version >= STORE_VERSION) return { ...empty, ...state };

        // Pre-C25 rows were order-shaped. Give them the fields the feed now
        // reads, inferring the category the same way `STATUS_CATEGORY` does.
        const items = (state.items ?? []).map((n) => {
          const legacy = n as AppNotification & LegacyNotification;
          return {
            ...legacy,
            category: legacy.category ?? "order",
            text: legacy.text ?? null,
            channels: legacy.channels ?? ["inApp"],
            subject:
              legacy.subject ??
              (legacy.orderId
                ? {
                    kind: "order" as const,
                    id: legacy.orderId,
                    label: legacy.orderNumber ?? legacy.orderId,
                  }
                : null),
          };
        });
        return { ...empty, items };
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * Push a batch from a domain store. Domain stores import *this*, not the store
 * object, so the "notifications are a side effect of a committed change" rule
 * reads the same in all six of them.
 */
export function emitNotifications(items: AppNotification[]) {
  if (items.length > 0) useNotifications.getState().notify(items);
}

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
