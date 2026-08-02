import type {
  AppNotification,
  CateringQuote,
  Coupon,
  CustomerSettings,
  DeliveryChannel,
  DispatchStatus,
  NotificationChannels,
  NotificationDispatch,
  NotificationTopic,
  NotifyAudience,
  NotifyCategory,
  NotifyChannel,
  NotifySubject,
  NotifyTone,
  Order,
  OrderEvent,
  OrderStatus,
  Reservation,
  Subscription,
  WalletTransaction,
} from "@/frontend/types";

/**
 * notifications.ts — who hears about what, and on which channel (Phase C25).
 *
 * Two rules, each stated exactly once in this file:
 *
 *  1. **Fan-out.** An event produces a fixed set of messages, one per audience.
 *     Call sites never construct notifications; they call a factory here, so a
 *     new state cannot ship without someone deciding who hears about it.
 *  2. **Routing.** `channelsFor` is the *only* place a preference is consulted.
 *     Everything downstream — the feed, the outbox, the push — reads the
 *     `channels` array it produced, so "why didn't I get an email" has one
 *     answer and not four.
 *
 * Message text lives in `messages/*.json` under
 * `notifications.<audience>.<key>` with a `.title` / `.body` pair, so all three
 * locales stay in step.
 */

// ---------------------------------------------------------------------------
// 1. Categories and the preferences that govern them
// ---------------------------------------------------------------------------

/**
 * Which of C28's five preference topics governs each category.
 *
 * `system` is deliberately `null`, and that is the interesting entry: a service
 * announcement is not suppressible, for the same reason `REQUIRED_NOTIFICATIONS`
 * locks the order-receipt email on. Everything else answers to a switch the
 * customer owns.
 *
 * Reviews, bookings, subscriptions and quotes all fall under `orderUpdates`
 * rather than getting topics of their own: C28 shipped five topics and inventing
 * a sixth here would put a preference in the code that the settings page cannot
 * show, which is worse than a slightly broad topic.
 */
export const CATEGORY_TOPIC: Record<NotifyCategory, NotificationTopic | null> = {
  order: "orderUpdates",
  payment: "orderUpdates",
  review: "orderUpdates",
  reservation: "orderUpdates",
  subscription: "orderUpdates",
  catering: "orderUpdates",
  delivery: "deliveryAlerts",
  promo: "promotions",
  system: null,
};

/** Categories whose in-app record is kept whatever the preferences say. */
const ALWAYS_RECORDED: ReadonlySet<NotifyCategory> = new Set<NotifyCategory>([
  "order",
  "payment",
  "review",
  "reservation",
  "subscription",
  "catering",
  "delivery",
  "system",
]);

/** The three channels that leave the device, in the order the UI lists them. */
export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = ["push", "email", "sms"];

/**
 * The contact points a delivery would use. The prototype has one account, so
 * this comes from the session; a backend would read the verified addresses.
 */
export interface NotifyContact {
  email: string | null;
  phone: string | null;
}

/**
 * Where a notification actually goes.
 *
 * In-app first: the feed is the account's own log, so every category in
 * `ALWAYS_RECORDED` lands there regardless of preference. A *promotion* does
 * not — switching promotions off and still finding them in the inbox is the
 * behaviour that makes people stop trusting the switch, so `promo` is recorded
 * only while the customer is opted into it on some channel.
 *
 * Then the three deliveries, each gated on `settings.notifications[topic]`,
 * with two overrides: `system` ignores the matrix (it has no topic), and a
 * channel listed in `required` is on whatever the stored value says — the
 * settings page renders those as locked controls, and this is the enforcement
 * the page is describing.
 *
 * Audiences other than `customer` have no settings object in the prototype —
 * a restaurant's inbox *is* its dashboard — so they record in-app and deliver
 * nothing, and so does a customer whose settings have not loaded yet. Assuming
 * consent while we are still reading the preferences is the one mistake this
 * function must not make.
 */
export function channelsFor(
  notification: Pick<AppNotification, "audience" | "category">,
  settings: CustomerSettings | null,
  required: ReadonlyArray<readonly [NotificationTopic, keyof NotificationChannels]> = [],
): NotifyChannel[] {
  if (notification.audience !== "customer" || !settings) return ["inApp"];

  const topic = CATEGORY_TOPIC[notification.category];
  const prefs = topic ? settings.notifications[topic] : null;
  const channels: NotifyChannel[] = [];

  const optedIn = !prefs || prefs.email || prefs.push || prefs.sms;
  if (ALWAYS_RECORDED.has(notification.category) || optedIn) channels.push("inApp");
  if (channels.length === 0) return channels;

  for (const channel of DELIVERY_CHANNELS) {
    const locked = topic
      ? required.some(([t, c]) => t === topic && c === channel)
      : channel === "email"; // a service announcement is always emailed
    if (locked || prefs?.[channel]) channels.push(channel);
  }

  return channels;
}

// ---------------------------------------------------------------------------
// 2. The outbox
// ---------------------------------------------------------------------------

/** `nadia@foodora.dev` → `n•••a@foodora.dev`. Enough to recognise, not to read. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain || name.length < 2) return email;
  return `${name[0]}•••${name[name.length - 1]}@${domain}`;
}

/** `+8801711223344` → `+8801•••3344`. */
export function maskPhone(phone: string): string {
  const trimmed = phone.replace(/\s+/g, "");
  if (trimmed.length < 8) return trimmed;
  return `${trimmed.slice(0, 5)}•••${trimmed.slice(-4)}`;
}

/**
 * The delivery log a notification produces — one row per channel that was
 * *considered*, not only the ones that worked.
 *
 * A suppressed row is the point of the log. The customer who turned promotions
 * off should be able to see that we had something to say and didn't say it, and
 * the operator sending a campaign should see the same number rather than a
 * silent shortfall. Failures are honest too: `sms` with no phone number on the
 * account fails, because that is what a provider would return.
 */
export function dispatchesFor(
  notification: AppNotification,
  contact: NotifyContact,
): NotificationDispatch[] {
  return DELIVERY_CHANNELS.map((channel) => {
    const wanted = notification.channels.includes(channel);
    let status: DispatchStatus = wanted ? "sent" : "suppressed";
    let reason: string | null = wanted ? null : "preferenceOff";
    let to = "device";

    if (channel === "email") {
      to = contact.email ? maskEmail(contact.email) : "—";
      if (wanted && !contact.email) {
        status = "failed";
        reason = "noEmail";
      }
    }
    if (channel === "sms") {
      to = contact.phone ? maskPhone(contact.phone) : "—";
      if (wanted && !contact.phone) {
        status = "failed";
        reason = "noPhone";
      }
    }

    return {
      id: `dsp_${notification.id}_${channel}`,
      notificationId: notification.id,
      channel,
      to,
      audience: notification.audience,
      key: notification.key,
      params: notification.params,
      text: notification.text,
      status,
      reason,
      at: notification.at,
    };
  });
}

/** How much of a message an SMS carries before it becomes two (GSM-7). */
export const SMS_LIMIT = 160;

// ---------------------------------------------------------------------------
// 3. The order lifecycle fan-out
// ---------------------------------------------------------------------------

/** One entry in a status's fan-out table. */
interface Fanout {
  audience: NotifyAudience;
  /** i18n key; defaults to the status name. */
  key?: string;
  tone?: NotifyTone;
  /** Overrides the status's own category (a refund is money, not an order). */
  category?: NotifyCategory;
}

/**
 * Who hears about each status. Deliberately explicit rather than derived: the
 * spec lists exactly nine customer notifications, three for the restaurant and
 * three for the rider, and this table is that list in code.
 */
const FANOUT: Partial<Record<OrderStatus, Fanout[]>> = {
  placed: [
    { audience: "customer", tone: "success" },
    { audience: "restaurant", key: "newOrder", tone: "info" },
    { audience: "admin" },
  ],
  confirmed: [{ audience: "customer", tone: "success" }, { audience: "admin" }],
  preparing: [{ audience: "customer" }],
  packing: [{ audience: "customer" }],
  ready: [{ audience: "customer", tone: "success" }, { audience: "rider", key: "pickupReady" }],
  "rider-assigned": [
    { audience: "customer", tone: "success" },
    { audience: "restaurant", key: "riderAssigned" },
    { audience: "rider", key: "deliveryAssigned", tone: "success" },
    { audience: "admin" },
  ],
  "picked-up": [{ audience: "customer", tone: "success" }],
  "on-the-way": [{ audience: "customer" }],
  // "Near you" + "your code is ready" are the same moment for the customer.
  arrived: [{ audience: "customer", tone: "warning" }, { audience: "rider", key: "otpNeeded" }],
  delivered: [
    { audience: "customer", tone: "success" },
    { audience: "restaurant", key: "deliveryCompleted", tone: "success" },
    { audience: "rider", key: "otpVerified", tone: "success" },
    { audience: "admin" },
  ],
  completed: [{ audience: "customer", tone: "success" }, { audience: "admin" }],
  rejected: [
    { audience: "customer", tone: "danger" },
    { audience: "admin", tone: "danger" },
  ],
  cancelled: [
    { audience: "customer", tone: "danger" },
    { audience: "restaurant", key: "orderCancelled", tone: "danger" },
    { audience: "admin", tone: "danger" },
  ],
  "delivery-failed": [
    { audience: "customer", tone: "danger" },
    { audience: "restaurant", key: "deliveryFailed", tone: "danger" },
    { audience: "admin", tone: "danger" },
  ],
  returned: [
    { audience: "customer", tone: "warning" },
    { audience: "restaurant", key: "orderReturned", tone: "warning" },
    { audience: "admin", tone: "warning" },
  ],
  refunded: [
    { audience: "customer", tone: "success", category: "payment" },
    { audience: "admin", category: "payment" },
  ],
};

/**
 * Which category a lifecycle status belongs to. Everything from the moment a
 * rider is involved is a *delivery* alert, which matters because C28 gives
 * delivery its own switch: a customer who wants the receipt but not the
 * doorstep play-by-play is expressing a preference this split makes possible.
 */
const STATUS_CATEGORY: Partial<Record<OrderStatus, NotifyCategory>> = {
  "rider-assigned": "delivery",
  "picked-up": "delivery",
  "on-the-way": "delivery",
  arrived: "delivery",
  delivered: "delivery",
  "delivery-failed": "delivery",
  returned: "delivery",
  refunded: "payment",
};

/** Where each audience should land when they tap the notification. */
function hrefFor(audience: NotifyAudience, order: Order): string {
  switch (audience) {
    case "customer":
      return `/orders/${order.id}`;
    case "restaurant":
      return "/dashboard/orders";
    case "rider":
      return "/delivery";
    case "admin":
      return "/admin";
  }
}

function orderSubject(order: Order): NotifySubject {
  return { kind: "order", id: order.id, label: order.orderNumber };
}

/**
 * The shared shape. Every factory below funnels through here so a new
 * notification cannot forget a field — in particular `channels`, which is
 * filled in by the store's gate and starts empty rather than wrong.
 */
function build(
  input: Omit<AppNotification, "text" | "read" | "channels" | "status" | "subject"> &
    Partial<Pick<AppNotification, "text" | "status" | "subject">>,
): AppNotification {
  return {
    text: null,
    status: null,
    subject: null,
    read: false,
    channels: [],
    ...input,
  };
}

/**
 * Notifications a status produces that are *not* about the order's progress.
 *
 * C22 deliberately left review notifications to this phase, and this is where
 * they belong: "how was it?" is caused by the delivery, but it is a review
 * notification — a different category, a different link, and a different
 * preference could one day govern it. Keeping it in a second table rather than
 * as a fourth entry in `FANOUT` is what keeps the fan-out readable as the list
 * of who-hears-about-a-status that it is.
 */
const FOLLOW_UPS: Partial<
  Record<OrderStatus, (order: Order, at: string) => AppNotification[]>
> = {
  delivered: (order, at) => [
    build({
      id: `ntf_${order.id}_review-invite`,
      audience: "customer",
      category: "review",
      key: "reviewInvite",
      params: { order: order.orderNumber, vendor: order.vendor.name },
      tone: "info",
      subject: { kind: "review", id: order.id, label: order.orderNumber },
      href: `/account/reviews?order=${order.id}`,
      at,
    }),
  ],
};

/**
 * The notifications a committed transition produces. Pure — the store applies
 * the routing gate and persists whatever comes back, and the acting surface
 * separately raises its own toast.
 */
export function notificationsFor(order: Order, event: OrderEvent): AppNotification[] {
  const entries = FANOUT[event.status];
  if (!entries) return [];

  const rider = order.lifecycle.rider;

  const fanned = entries.map((entry) => {
    const key = entry.key ?? event.status;
    return build({
      id: `ntf_${event.id}_${entry.audience}`,
      audience: entry.audience,
      category: entry.category ?? STATUS_CATEGORY[event.status] ?? "order",
      key,
      params: {
        order: order.orderNumber,
        vendor: order.vendor.name,
        customer: order.contact.name,
        rider: rider?.name ?? "",
        minutes: order.lifecycle.prepMinutes ?? 0,
      },
      tone: entry.tone ?? "info",
      subject: orderSubject(order),
      status: event.status,
      href: hrefFor(entry.audience, order),
      at: event.at,
    });
  });

  const followUps = FOLLOW_UPS[event.status]?.(order, event.at) ?? [];
  return [...fanned, ...followUps];
}

/**
 * The extra "your rider is close" nudge (spec: customer "Near You"). Not a
 * status change — dispatch raises it partway through the ride — so it is built
 * here rather than falling out of the fan-out table.
 */
export function nearYouNotification(order: Order, at: string): AppNotification {
  return build({
    id: `ntf_${order.id}_near-you`,
    audience: "customer",
    category: "delivery",
    key: "nearYou",
    params: { order: order.orderNumber, rider: order.lifecycle.rider?.name ?? "" },
    tone: "warning",
    subject: orderSubject(order),
    status: "on-the-way",
    href: `/orders/${order.id}`,
    at,
  });
}

// ---------------------------------------------------------------------------
// 4. Everything else that happens to an account
// ---------------------------------------------------------------------------

/**
 * Money moved (C19). Only the movements a customer did not personally watch
 * happen are worth a record: a top-up and a refund land in the feed, while the
 * debit at checkout does not — they were standing at the tender when it went
 * through, and an inbox that repeats what just happened on screen is noise.
 */
export function walletNotification(
  transaction: WalletTransaction,
  currency: string,
): AppNotification | null {
  const key =
    transaction.type === "top-up"
      ? "walletToppedUp"
      : transaction.type === "refund"
        ? "walletRefunded"
        : transaction.type === "reward"
          ? "walletReward"
          : null;
  if (!key) return null;

  return build({
    id: `ntf_${transaction.id}`,
    audience: "customer",
    category: "payment",
    key,
    params: {
      amount: Math.abs(transaction.amount),
      currency,
      order: transaction.orderNumber ?? "",
    },
    tone: "success",
    subject: { kind: "wallet", id: transaction.id, label: transaction.description },
    href: "/account/wallet",
    at: transaction.occurredAt,
  });
}

/** A ticket landed in the wallet (C21). */
export function couponClaimedNotification(coupon: Coupon, at: string): AppNotification {
  return build({
    id: `ntf_claim_${coupon.id}`,
    audience: "customer",
    category: "promo",
    key: "couponClaimed",
    params: { code: coupon.code, title: coupon.title },
    tone: "success",
    subject: { kind: "coupon", id: coupon.id, label: coupon.code },
    href: "/account/coupons",
    at,
  });
}

/**
 * Someone used the contact form (C26). It goes to operations rather than to the
 * sender: the visitor watched the form say "sent", and an inbox that repeats what
 * just happened on screen is noise (the C19 rule).
 */
export function contactMessageNotification(message: {
  id: string;
  name: string;
  topic: string;
  at: string;
}): AppNotification {
  return build({
    id: `ntf_contact_${message.id}`,
    audience: "admin",
    category: "system",
    key: "contactMessage",
    params: { name: message.name, topic: message.topic },
    tone: "info",
    href: "/admin/cms",
    at: message.at,
  });
}

const RESERVATION_KEY: Partial<Record<Reservation["status"], string>> = {
  pending: "bookingRequested",
  confirmed: "bookingConfirmed",
  seated: "bookingSeated",
  cancelled: "bookingCancelled",
  "no-show": "bookingNoShow",
};

const RESERVATION_TONE: Partial<Record<Reservation["status"], NotifyTone>> = {
  pending: "info",
  confirmed: "success",
  seated: "success",
  cancelled: "danger",
  "no-show": "warning",
};

/** A table booking changed hands (C16) — the guest's copy and the venue's. */
export function reservationNotifications(
  reservation: Reservation,
  at: string,
): AppNotification[] {
  const key = RESERVATION_KEY[reservation.status];
  if (!key) return [];

  const params = {
    reference: reservation.reference,
    venue: reservation.venue.name,
    guest: reservation.guest.name,
    date: reservation.date,
    time: reservation.time,
    party: reservation.partySize,
  };
  const subject: NotifySubject = {
    kind: "reservation",
    id: reservation.id,
    label: reservation.reference,
  };

  const notifications = [
    build({
      id: `ntf_rsv_${reservation.id}_${reservation.status}_guest`,
      audience: "customer",
      category: "reservation",
      key,
      params,
      tone: RESERVATION_TONE[reservation.status] ?? "info",
      subject,
      href: "/account/reservations",
      at,
    }),
  ];

  // The venue only wants to hear about the two ends it does not itself drive:
  // a request arriving, and a guest walking it back.
  if (reservation.status === "pending" || reservation.status === "cancelled") {
    notifications.push(
      build({
        id: `ntf_rsv_${reservation.id}_${reservation.status}_venue`,
        audience: "restaurant",
        category: "reservation",
        key: reservation.status === "pending" ? "bookingRequest" : "bookingCancelled",
        params,
        tone: reservation.status === "pending" ? "info" : "warning",
        subject,
        href: "/dashboard/reservations",
        at,
      }),
    );
  }

  return notifications;
}

const SUBSCRIPTION_KEY: Record<Subscription["status"], string> = {
  active: "subscriptionActive",
  paused: "subscriptionPaused",
  cancelled: "subscriptionCancelled",
};

/** A meal plan started, paused, resumed or ended (C15). */
export function subscriptionNotification(
  subscription: Subscription,
  at: string,
): AppNotification | null {
  const key = SUBSCRIPTION_KEY[subscription.status];
  if (!key) return null;

  return build({
    id: `ntf_sub_${subscription.id}_${subscription.status}_${subscription.pausedUntil ?? "0"}`,
    audience: "customer",
    category: "subscription",
    key,
    params: {
      reference: subscription.reference,
      plan: subscription.plan.name,
      resumes: subscription.pausedUntil ?? "",
      renews: subscription.renewsOn,
    },
    tone: subscription.status === "cancelled" ? "warning" : "success",
    subject: {
      kind: "subscription",
      id: subscription.id,
      label: subscription.plan.name,
    },
    href: "/account/subscriptions",
    at,
  });
}

const QUOTE_KEY: Partial<Record<CateringQuote["status"], string>> = {
  requested: "quoteRequested",
  reviewing: "quoteReviewing",
  quoted: "quoteReady",
  confirmed: "quoteConfirmed",
  declined: "quoteDeclined",
};

/** A catering enquiry moved (C17) — the client's copy and the caterer's. */
export function cateringNotifications(quote: CateringQuote, at: string): AppNotification[] {
  const key = QUOTE_KEY[quote.status];
  if (!key) return [];

  const params = {
    quote: quote.quoteNumber,
    guests: quote.guests,
    date: quote.eventDate,
    total: quote.pricing.total,
    currency: quote.pricing.currency,
  };
  const subject: NotifySubject = {
    kind: "quote",
    id: quote.id,
    label: quote.quoteNumber,
  };

  const notifications = [
    build({
      id: `ntf_quote_${quote.id}_${quote.status}_client`,
      audience: "customer",
      category: "catering",
      key,
      params,
      tone: quote.status === "declined" ? "danger" : "success",
      subject,
      href: `/catering/quote/${quote.id}`,
      at,
    }),
  ];

  if (quote.status === "requested") {
    notifications.push(
      build({
        id: `ntf_quote_${quote.id}_requested_caterer`,
        audience: "restaurant",
        category: "catering",
        key: "quoteEnquiry",
        params,
        tone: "info",
        subject,
        href: "/dashboard",
        at,
      }),
    );
  }

  return notifications;
}

/**
 * One recipient's copy of an operator's broadcast (the admin Notification
 * Center). `text` rather than `key`: a human wrote this sentence, in one
 * language, and translating it at read time would be a lie about where it
 * came from.
 */
export function broadcastNotification(input: {
  campaignId: string;
  audience: NotifyAudience;
  category: NotifyCategory;
  title: string;
  body: string;
  href: string;
  at: string;
}): AppNotification {
  return build({
    id: `ntf_${input.campaignId}_${input.audience}`,
    audience: input.audience,
    category: input.category,
    key: input.category === "promo" ? "broadcastPromo" : "broadcastAnnouncement",
    params: {},
    text: { title: input.title, body: input.body },
    tone: input.category === "promo" ? "info" : "warning",
    subject: { kind: "broadcast", id: input.campaignId, label: input.title },
    href: input.href,
    at: input.at,
  });
}
