import type { ISODate } from "./common";
import type { OrderStatus } from "./order";

/**
 * notification.ts — the notification platform (Phase C25).
 *
 * A notification is a *record*, not a toast. Toasts are the acting device's
 * feedback and vanish; a notification belongs to a role, survives a reload,
 * carries an unread flag and links somewhere.
 *
 * C25 generalised what the order lifecycle started. Three things follow from
 * that generalisation and are worth stating here, because the rest of the
 * phase is their consequence:
 *
 *  1. **A notification is a key plus data, never a sentence** (the C24 rule).
 *     `key` + `params` are translated at read time, so an inbox restored next
 *     week reads in whatever language the device is in now. The single
 *     exception is `text` — an operator's broadcast, prose a human wrote, which
 *     no catalogue can translate and which we therefore do not pretend to.
 *  2. **A category, not a table of statuses.** The feed carries reviews,
 *     wallet movements, bookings and promotions as well as orders, so the
 *     subject is a typed reference rather than an `orderId` column.
 *  3. **Channels are decided once, at emit.** `channels` records where a
 *     notification actually went — the answer to "why didn't I get an email"
 *     is stored on the row rather than re-derived from preferences that may
 *     have changed since.
 */

/** Which inbox a notification lands in. One order fans out to several. */
export type NotifyAudience = "customer" | "restaurant" | "rider" | "admin";

export type NotifyTone = "info" | "success" | "warning" | "danger";

/**
 * What a notification is about. Drives the icon, the feed's filter tabs and —
 * through `CATEGORY_TOPIC` in `lib/notifications` — which of C28's preference
 * topics governs it.
 */
export type NotifyCategory =
  | "order"
  | "delivery"
  | "payment"
  | "review"
  | "reservation"
  | "subscription"
  | "catering"
  | "promo"
  | "system";

/**
 * Where a notification can go. `inApp` is the record itself — the row in the
 * feed; the other three are *deliveries*, and each one produces a
 * `NotificationDispatch` in the outbox.
 */
export type NotifyChannel = "inApp" | "push" | "email" | "sms";

/** The three that leave the device. */
export type DeliveryChannel = Exclude<NotifyChannel, "inApp">;

/** The thing a notification is about, so the feed can group and link by it. */
export interface NotifySubject {
  kind:
    | "order"
    | "review"
    | "reservation"
    | "subscription"
    | "quote"
    | "coupon"
    | "wallet"
    | "broadcast";
  id: string;
  /** Already-human label (order number, plan name, venue) for grouping. */
  label: string;
}

export interface AppNotification {
  id: string;
  audience: NotifyAudience;
  category: NotifyCategory;
  /** i18n key under `notifications.<audience>.<key>`, with `.title`/`.body`. */
  key: string;
  /** Values interpolated into the title/body messages. */
  params: Record<string, string | number>;
  /**
   * Literal, already-written text. Only a human-composed broadcast sets this;
   * when present the UI renders it verbatim instead of translating `key`,
   * because prose an operator typed in one language is not a catalogue entry.
   */
  text: { title: string; body: string } | null;
  tone: NotifyTone;
  subject: NotifySubject | null;
  /** The lifecycle status that produced it, when the order machine did. */
  status: OrderStatus | null;
  /** Where tapping it goes. */
  href: string;
  at: ISODate;
  read: boolean;
  /** Channels this actually went out on — decided once, at emit. */
  channels: NotifyChannel[];
}

/**
 * One delivery attempt on one channel — the outbox row.
 *
 * The prototype cannot send an email or an SMS, and it says so rather than
 * pretending: what it keeps is the record a provider integration would produce,
 * which is exactly what makes the preference matrix legible ("promotions/email
 * is off" shows up here as a suppressed row, not as silence).
 *
 * It stores `key`/`params`, not rendered prose, for the same reason the
 * notification does — the log re-reads itself in the current locale.
 */
export type DispatchStatus = "sent" | "suppressed" | "failed";

export interface NotificationDispatch {
  id: string;
  notificationId: string;
  channel: DeliveryChannel;
  /** Masked destination — `a•••@example.com`, `+8801•••4321`, or the device. */
  to: string;
  audience: NotifyAudience;
  key: string;
  params: Record<string, string | number>;
  text: { title: string; body: string } | null;
  status: DispatchStatus;
  /** i18n key under `notifications.reason.*` when suppressed or failed. */
  reason: string | null;
  at: ISODate;
}

// ---------------------------------------------------------------------------
// Admin Notification Center (spec: Admin Panel → Notification Center)
// ---------------------------------------------------------------------------

/** Who a broadcast goes to. Sizes are derived, never stored. */
export type SegmentId =
  | "all-customers"
  | "active-customers"
  | "lapsed-customers"
  | "subscribers"
  | "restaurants"
  | "riders";

export interface NotificationSegment {
  id: SegmentId;
  audience: NotifyAudience;
  /** How many accounts the segment resolves to right now. */
  size: number;
}

/**
 * A broadcast's *kind*, which is the one thing an operator must decide and the
 * platform cannot: whether this is marketing (suppressible, and suppressed by
 * default because C28 starts promotions off) or a service announcement
 * (obligatory, the same reasoning as `REQUIRED_NOTIFICATIONS`).
 */
export type BroadcastKind = "promotion" | "announcement";

export interface BroadcastInput {
  segmentId: SegmentId;
  kind: BroadcastKind;
  channels: DeliveryChannel[];
  title: string;
  body: string;
  /** Optional deep link the notification opens. */
  href: string;
}

/** Per-channel outcome — what a provider dashboard would show afterwards. */
export interface ChannelResult {
  channel: DeliveryChannel;
  sent: number;
  suppressed: number;
}

export interface NotificationCampaign {
  id: string;
  segmentId: SegmentId;
  kind: BroadcastKind;
  title: string;
  body: string;
  href: string;
  /** Recipients the segment resolved to at send time. */
  audienceSize: number;
  results: ChannelResult[];
  sentAt: ISODate;
}
