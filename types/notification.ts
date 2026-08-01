import type { ISODate } from "./common";
import type { OrderStatus } from "./order";

/**
 * notification.ts — the in-app notification feed (spec: Notifications).
 *
 * A notification is a *record*, not a toast. Toasts are the acting device's
 * feedback and vanish; a notification belongs to a role, survives a reload,
 * carries an unread flag and links somewhere. Both are produced from the same
 * lifecycle transition — see `lib/notifications.ts`.
 */

/** Which inbox a notification lands in. One order fans out to several. */
export type NotifyAudience = "customer" | "restaurant" | "rider" | "admin";

export type NotifyTone = "info" | "success" | "warning" | "danger";

export interface AppNotification {
  id: string;
  audience: NotifyAudience;
  /** i18n key under `notifications.<audience>.<key>`. */
  key: string;
  /** Values interpolated into the title/body messages. */
  params: Record<string, string | number>;
  tone: NotifyTone;
  /** The order this is about — the feed groups and links by it. */
  orderId: string;
  orderNumber: string;
  /** The status that produced it, for the icon. */
  status: OrderStatus;
  /** Where tapping it goes. */
  href: string;
  at: ISODate;
  read: boolean;
}
