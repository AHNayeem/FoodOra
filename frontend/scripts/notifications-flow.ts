/**
 * C25 flow check — exercises the notification platform end to end. Run from the
 * project root:
 *
 *     NODE_ENV=test bun scripts/notifications-flow.ts
 *
 * Every assertion is a claim the phase makes in prose somewhere; this is where
 * those claims are checked against the code rather than against confidence. The
 * two that matter most are the routing gate (a preference the customer set has
 * to change what actually happens) and key resolution (every message the seam
 * can emit has to exist in all three catalogs).
 */
import { readFileSync } from "node:fs";

import type {
  AppNotification,
  CateringQuote,
  Coupon,
  CustomerSettings,
  NotifyAudience,
  NotificationSegment,
  Order,
  OrderEvent,
  OrderStatus,
  Reservation,
  Subscription,
  WalletTransaction,
} from "@/types";
import { buildCoupons, buildDemoOrders, defaultCustomerSettings } from "@/lib/mock";
import {
  CATEGORY_TOPIC,
  DELIVERY_CHANNELS,
  SMS_LIMIT,
  broadcastNotification,
  cateringNotifications,
  channelsFor,
  couponClaimedNotification,
  dispatchesFor,
  maskEmail,
  maskPhone,
  nearYouNotification,
  notificationsFor,
  reservationNotifications,
  subscriptionNotification,
  walletNotification,
} from "@/lib/notifications";
import { REQUIRED_NOTIFICATIONS } from "@/services/settings";
import {
  TITLE_LIMIT,
  campaignTotals,
  getFeed,
  getOutbox,
  getSegments,
  sendBroadcast,
} from "@/services/notifications";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const NOW = "2026-08-02T12:00:00.000Z";
const orders = buildDemoOrders(Date.parse(NOW));

function orderWith(status: OrderStatus): Order {
  const found = orders.find((o) => o.status === status) ?? orders[0];
  return { ...found, lifecycle: { ...found.lifecycle } };
}

function eventFor(status: OrderStatus): OrderEvent {
  return { id: `evt_test_${status}`, status, at: NOW, actor: "system", detail: null };
}

function settings(patch: Partial<CustomerSettings["notifications"]> = {}): CustomerSettings {
  return {
    ...defaultCustomerSettings,
    notifications: { ...defaultCustomerSettings.notifications, ...patch },
  };
}

function route(
  category: AppNotification["category"],
  s: CustomerSettings | null,
  audience: NotifyAudience = "customer",
) {
  return channelsFor({ audience, category }, s, REQUIRED_NOTIFICATIONS);
}

// ── 1. The routing gate ──────────────────────────────────────────────────────

{
  const defaults = settings();

  const order = route("order", defaults);
  check("an order update is recorded in-app", order.includes("inApp"));
  check("...and emailed, because the receipt channel is locked on", order.includes("email"));
  check("...and pushed, because the default says so", order.includes("push"));
  check("...but not texted, because the default says not to", !order.includes("sms"));

  const delivery = route("delivery", defaults);
  check("delivery alerts get their own topic", CATEGORY_TOPIC.delivery === "deliveryAlerts");
  check("a delivery alert is pushed", delivery.includes("push"));
  check("a delivery alert is not emailed by default", !delivery.includes("email"));

  // The rule that makes the switch worth having.
  check(
    "a promotion is dropped outright while promotions are off",
    route("promo", defaults).length === 0,
    JSON.stringify(route("promo", defaults)),
  );
  const optedIn = settings({ promotions: { email: true, push: false, sms: false } });
  const promo = route("promo", optedIn);
  check("...and recorded once the customer opts in", promo.includes("inApp"));
  check("...on exactly the channel they chose", promo.includes("email") && !promo.includes("push"));

  // The rule the settings page describes as a locked control.
  const noEmail = settings({ orderUpdates: { email: false, push: false, sms: false } });
  check(
    "the order-receipt email cannot be switched off",
    route("order", noEmail).includes("email"),
  );
  check("...but the push beside it can", !route("order", noEmail).includes("push"));

  // The unsuppressable category.
  const allOff = settings({
    orderUpdates: { email: false, push: false, sms: false },
    deliveryAlerts: { email: false, push: false, sms: false },
    promotions: { email: false, push: false, sms: false },
    newVendors: { email: false, push: false, sms: false },
    weeklyDigest: { email: false, push: false, sms: false },
  });
  check("a service announcement has no topic", CATEGORY_TOPIC.system === null);
  const system = route("system", allOff);
  check("...so it survives everything being off", system.includes("inApp"));
  check("...and is still emailed", system.includes("email"));
  check("...but is not pushed or texted", !system.includes("push") && !system.includes("sms"));

  // Audiences with no preferences of their own.
  for (const audience of ["restaurant", "rider", "admin"] as const) {
    const channels = route("order", defaults, audience);
    check(
      `a ${audience} notification is in-app only`,
      channels.length === 1 && channels[0] === "inApp",
      channels.join(","),
    );
  }
  const unknown = route("order", null);
  check(
    "without loaded settings nothing is delivered",
    unknown.length === 1 && unknown[0] === "inApp",
    unknown.join(","),
  );
  check(
    "...and that holds for a promotion too — consent is never assumed",
    route("promo", null).every((c) => c === "inApp"),
  );
}

// ── 2. The order fan-out ─────────────────────────────────────────────────────

{
  const order = orderWith("delivered");

  const placed = notificationsFor(order, eventFor("placed"));
  const audiences = placed.map((n) => n.audience).sort();
  check(
    "a placed order reaches customer, restaurant and admin",
    audiences.join(",") === "admin,customer,restaurant",
    audiences.join(","),
  );
  check("...and every one of them is an order notification", placed.every((n) => n.category === "order"));

  const assigned = notificationsFor(order, eventFor("rider-assigned"));
  check("assignment reaches all four roles", assigned.length === 4, `${assigned.length}`);
  check(
    "...and is filed under delivery, not orders",
    assigned.every((n) => n.category === "delivery"),
  );

  const refunded = notificationsFor(order, eventFor("refunded"));
  check("a refund is a payment", refunded.every((n) => n.category === "payment"));

  const delivered = notificationsFor(order, eventFor("delivered"));
  const invite = delivered.find((n) => n.key === "reviewInvite");
  check("delivery invites a review — the notification C22 deferred", Boolean(invite));
  check("...as a review notification", invite?.category === "review");
  check("...linking to the review the order is owed", invite?.href.includes(order.id) ?? false);

  check("an intermediate state nobody needs fans out to nobody", notificationsFor(order, eventFor("packing")).every((n) => n.audience === "customer"));

  // Ids have to be stable, or a replayed transition duplicates the inbox.
  const again = notificationsFor(order, eventFor("placed"));
  check(
    "the same transition produces the same ids",
    again.map((n) => n.id).join() === placed.map((n) => n.id).join(),
  );
  check(
    "every notification starts with no channels — the gate decides",
    [...placed, ...assigned].every((n) => n.channels.length === 0),
  );

  const nudge = nearYouNotification(order, NOW);
  check("the near-you nudge is a delivery alert", nudge.category === "delivery");
}

// ── 3. Everything else that notifies ─────────────────────────────────────────

const walletTxn: WalletTransaction = {
  id: "wtx_test",
  type: "top-up",
  amount: 500,
  description: "Added via card ending 4242",
  orderNumber: null,
  occurredAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

{
  check("a top-up notifies", walletNotification(walletTxn, "BDT")?.key === "walletToppedUp");
  check(
    "a refund notifies",
    walletNotification({ ...walletTxn, type: "refund" }, "BDT")?.key === "walletRefunded",
  );
  check(
    "a checkout debit does not — the customer was standing there",
    walletNotification({ ...walletTxn, type: "payment", amount: -500 }, "BDT") === null,
  );
  check(
    "money is a payment notification",
    walletNotification(walletTxn, "BDT")?.category === "payment",
  );
}

const reservation: Reservation = {
  id: "rsv_test",
  reference: "RSV-TEST01",
  userId: "usr_customer",
  venue: {
    id: "ven_bella_napoli",
    slug: "bella-napoli",
    name: "Bella Napoli",
    image: "",
    address: "",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
  },
  date: "2026-08-09",
  time: "19:30",
  durationMinutes: 90,
  partySize: 4,
  tableIds: ["tbl_1"],
  tableLabels: ["T3"],
  zone: "indoor",
  occasion: "birthday",
  guest: { name: "Ayesha Rahman", phone: "+8801711000001", email: "customer@foodora.dev" },
  notes: null,
  status: "pending",
  depositAmount: 0,
  currency: "BDT",
  confirmedAt: null,
  seatedAt: null,
  cancelledAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

{
  const requested = reservationNotifications(reservation, NOW);
  check("a booking request tells both sides", requested.length === 2, `${requested.length}`);
  check(
    "...the guest and the venue",
    requested.map((n) => n.audience).sort().join(",") === "customer,restaurant",
  );

  const confirmed = reservationNotifications({ ...reservation, status: "confirmed" }, NOW);
  check("a confirmation is the guest's alone", confirmed.length === 1);
  check("...and reads as good news", confirmed[0].tone === "success");

  const cancelled = reservationNotifications({ ...reservation, status: "cancelled" }, NOW);
  check("a cancellation goes back to the venue too", cancelled.length === 2);

  check(
    "a completed booking is not news",
    reservationNotifications({ ...reservation, status: "completed" }, NOW).length === 0,
  );
}

const subscription = {
  id: "sub_test",
  reference: "SUB-TEST01",
  plan: { name: "Lean & Green" },
  status: "paused",
  pausedUntil: "2026-08-16",
  renewsOn: "2026-08-23",
} as unknown as Subscription;

{
  const paused = subscriptionNotification(subscription, NOW);
  check("a paused plan notifies", paused?.key === "subscriptionPaused");
  check("...carrying the date it resumes", paused?.params.resumes === "2026-08-16");
  check(
    "a second pause to a different date is a different notification",
    subscriptionNotification({ ...subscription, pausedUntil: "2026-08-20" }, NOW)?.id !== paused?.id,
  );
}

const quote = {
  id: "quo_test",
  quoteNumber: "CTR-TEST01",
  eventDate: "2026-09-01",
  guests: 80,
  status: "requested",
  pricing: { total: 96000, currency: "BDT" },
} as unknown as CateringQuote;

{
  const requested = cateringNotifications(quote, NOW);
  check("a catering enquiry reaches the caterer as well", requested.length === 2);
  const quoted = cateringNotifications({ ...quote, status: "quoted" }, NOW);
  check("a priced quote is the client's alone", quoted.length === 1);
  check("...and says so", quoted[0].key === "quoteReady");
}

const coupon = buildCoupons(Date.parse(NOW))[0] as Coupon;
{
  const claimed = couponClaimedNotification(coupon, NOW);
  check("a claimed coupon is marketing, so the switch governs it", claimed.category === "promo");
  check("...and it carries the code that was true at claim time", claimed.params.code === coupon.code);
}

{
  const broadcast = broadcastNotification({
    campaignId: "cmp_test",
    audience: "customer",
    category: "promo",
    title: "Half price Sunday",
    body: "Use WEEKEND50 before midnight.",
    href: "/offers",
    at: NOW,
  });
  check("an operator's broadcast carries prose, not a key", broadcast.text !== null);
  check("...verbatim", broadcast.text?.title === "Half price Sunday");
}

// ── 4. The outbox ────────────────────────────────────────────────────────────

{
  check("an email is masked", maskEmail("customer@foodora.dev") === "c•••r@foodora.dev");
  check("a phone is masked", maskPhone("+8801711000001") === "+8801•••0001");
  check("a short string is left alone", maskPhone("12345") === "12345");

  const routed: AppNotification = {
    ...notificationsFor(orderWith("placed"), eventFor("placed"))[0],
    channels: ["inApp", "email", "push"],
  };
  const rows = dispatchesFor(routed, {
    email: "customer@foodora.dev",
    phone: "+8801711000001",
  });
  check("every channel is logged, sent or not", rows.length === DELIVERY_CHANNELS.length);
  check("the email went", rows.find((r) => r.channel === "email")?.status === "sent");
  check(
    "the SMS was held back with a reason",
    rows.find((r) => r.channel === "sms")?.status === "suppressed" &&
      rows.find((r) => r.channel === "sms")?.reason === "preferenceOff",
  );
  check(
    "the log stores keys, not prose, so it re-reads in the current language",
    rows.every((r) => r.key.length > 0 && r.text === null),
  );

  const noPhone = dispatchesFor(
    { ...routed, channels: ["inApp", "sms"] },
    { email: "customer@foodora.dev", phone: null },
  );
  check(
    "an SMS with nowhere to go fails rather than pretending",
    noPhone.find((r) => r.channel === "sms")?.status === "failed",
  );
  check(
    "...and says why",
    noPhone.find((r) => r.channel === "sms")?.reason === "noPhone",
  );
}

// ── 5. The feed seam ─────────────────────────────────────────────────────────

const feedItems: AppNotification[] = [
  ...notificationsFor(orderWith("placed"), eventFor("placed")),
  ...notificationsFor(orderWith("delivered"), eventFor("delivered")),
  { ...walletNotification(walletTxn, "BDT")!, read: true },
  ...reservationNotifications(reservation, NOW),
].map((n) => ({ ...n, channels: ["inApp"] as AppNotification["channels"] }));

{
  const all = await getFeed(feedItems, { audience: "customer" });
  const mine = feedItems.filter((n) => n.audience === "customer");
  check("a feed is one audience's own", all.page.total === mine.length, `${all.page.total}`);
  check(
    "...newest first",
    all.page.items.every(
      (n, i) => i === 0 || Date.parse(all.page.items[i - 1].at) >= Date.parse(n.at),
    ),
  );
  check("the read one is not counted unread", all.unread === mine.length - 1, `${all.unread}`);

  const facetAll = all.facets.find((f) => f.category === null);
  check("there is an 'everything' facet", facetAll?.total === mine.length);
  check(
    "every facet's counts sum back to the whole",
    all.facets.filter((f) => f.category).reduce((n, f) => n + f.total, 0) === mine.length,
  );

  const payments = await getFeed(feedItems, { audience: "customer", category: "payment" });
  check("filtering by category narrows the page", payments.page.items.every((n) => n.category === "payment"));
  check("...but not the facets", payments.facets.find((f) => f.category === null)?.total === mine.length);

  const unread = await getFeed(feedItems, { audience: "customer", unreadOnly: true });
  check("unread-only hides the read one", unread.page.items.every((n) => !n.read));

  const firstPage = await getFeed(feedItems, { audience: "customer", pageSize: 2 });
  check("a page is a page", firstPage.page.items.length === 2);
  check("...and says there is more", firstPage.page.hasMore);

  const restaurant = await getFeed(feedItems, { audience: "restaurant" });
  check(
    "the restaurant sees only its own",
    restaurant.page.items.every((n) => n.audience === "restaurant"),
  );
  check("...and it is not empty", restaurant.page.total > 0);
}

{
  const dispatches = feedItems
    .filter((n) => n.audience === "customer")
    .flatMap((n) =>
      dispatchesFor(
        { ...n, channels: ["inApp", "email"] },
        { email: "customer@foodora.dev", phone: null },
      ),
    );
  const log = await getOutbox(dispatches, {});
  check("the log holds every attempt", log.total === dispatches.length);
  const emails = await getOutbox(dispatches, { channel: "email" });
  check("...and filters by channel", emails.items.every((d) => d.channel === "email"));
  check("...to fewer rows", emails.total < log.total);
}

// ── 6. Broadcasting ──────────────────────────────────────────────────────────

let segments: NotificationSegment[] = [];
{
  segments = await getSegments();
  check("every segment is offered", segments.length === 6, `${segments.length}`);
  check("...with a size", segments.every((s) => s.size > 0));
  const again = await getSegments();
  check(
    "...that does not move between reloads",
    again.map((s) => s.size).join() === segments.map((s) => s.size).join(),
  );

  const valid = {
    segmentId: "active-customers" as const,
    kind: "promotion" as const,
    channels: ["push" as const, "email" as const],
    title: "Half price Sunday",
    body: "Use WEEKEND50 before midnight.",
    href: "/offers",
  };

  const refusals: [string, Parameters<typeof sendBroadcast>[0], string][] = [
    ["an unknown segment", { ...valid, segmentId: "nope" as never }, "errors.unknownSegment"],
    ["no channel", { ...valid, channels: [] }, "errors.noChannel"],
    ["an empty headline", { ...valid, title: "   " }, "errors.emptyTitle"],
    ["a headline too long for a banner", { ...valid, title: "x".repeat(TITLE_LIMIT + 1) }, "errors.longTitle"],
    ["an empty message", { ...valid, body: "" }, "errors.emptyBody"],
    [
      "an SMS over one segment",
      { ...valid, channels: ["sms"], body: "x".repeat(SMS_LIMIT + 1) },
      "errors.longSms",
    ],
  ];
  for (const [label, input, expected] of refusals) {
    const res = await sendBroadcast(input, segments, NOW);
    check(`${label} is refused`, res.error === expected, res.error ?? "accepted");
  }

  const longBodyNoSms = await sendBroadcast(
    { ...valid, channels: ["email"], body: "x".repeat(SMS_LIMIT + 1) },
    segments,
    NOW,
  );
  check("...but only when SMS is one of the channels", longBodyNoSms.error === null);

  const promo = await sendBroadcast(valid, segments, NOW);
  check("a valid promotion sends", promo.error === null);
  if (promo.data) {
    const totals = campaignTotals(promo.data.campaign);
    check("...to some of the segment", totals.sent > 0);
    check(
      "...and not to all of it, because promotions start off",
      totals.suppressed > 0,
      `${totals.suppressed}`,
    );
    check("...on the channels that were picked", promo.data.campaign.results.length === 2);
    check("...producing this device's own copy", promo.data.delivered !== null);
    check("...as a promotion", promo.data.delivered?.category === "promo");
    check(
      "...which the gate then drops, because promotions are off by default",
      route("promo", settings()).length === 0,
    );
  }

  const announcement = await sendBroadcast(
    { ...valid, kind: "announcement" },
    segments,
    NOW,
  );
  check("an announcement sends", announcement.error === null);
  if (announcement.data) {
    const totals = campaignTotals(announcement.data.campaign);
    check("...to everyone, with nothing held back", totals.suppressed === 0);
    check(
      "...and reaches the whole segment on every channel",
      announcement.data.campaign.results.every(
        (r) => r.sent === announcement.data!.campaign.audienceSize,
      ),
    );
    check("...as a service notice", announcement.data.delivered?.category === "system");
    check(
      "...which nothing can suppress",
      route("system", settings()).includes("inApp"),
    );
  }

  const same = await sendBroadcast(valid, segments, NOW);
  check(
    "the same broadcast is the same campaign — a double-tap is not two sends",
    same.data?.campaign.id === promo.data?.campaign.id,
  );
}

// ── 7. The gate, wired up ────────────────────────────────────────────────────
//
// Sections 1–6 test the rules in isolation. This one drives the actual store —
// the thing every domain calls — because the rules being right is not the same
// claim as the wiring being right. (Zustand logs two "storage unavailable"
// lines here: there is no localStorage outside a browser, which is exactly the
// `skipHydration` contract working as intended.)

{
  const { useNotifications } = await import("@/stores/notifications");
  const { useSettings } = await import("@/stores/settings");
  const { useAuth } = await import("@/stores/auth");
  const { users } = await import("@/lib/mock");

  useAuth.setState({ user: users[0], hydrated: true } as never);
  useSettings.getState().seed(defaultCustomerSettings);

  const order = orderWith("placed");
  const event = eventFor("placed");
  useNotifications.getState().notify(notificationsFor(order, event));

  const stored = useNotifications.getState();
  check("the store records every audience", stored.items.length === 3, `${stored.items.length}`);
  const mine = stored.items.find((n) => n.audience === "customer");
  check(
    "...stamping the customer's copy with where it went",
    mine?.channels.join("+") === "inApp+push+email",
    mine?.channels.join("+"),
  );
  const theirs = stored.items.find((n) => n.audience === "restaurant");
  check("...and the restaurant's with in-app only", theirs?.channels.join("+") === "inApp");

  check(
    "the outbox holds one row per channel, for the customer alone",
    stored.outbox.length === DELIVERY_CHANNELS.length,
    `${stored.outbox.length}`,
  );
  check(
    "...including the one consent held back",
    stored.outbox.some((d) => d.channel === "sms" && d.status === "suppressed"),
  );

  useNotifications.getState().notify(notificationsFor(order, event));
  check(
    "a replayed transition does not duplicate the inbox",
    useNotifications.getState().items.length === 3,
    `${useNotifications.getState().items.length}`,
  );

  // The end-to-end version of the claim the settings page makes.
  useNotifications.getState().notify([couponClaimedNotification(coupon, NOW)]);
  check(
    "a promotion never reaches the store while promotions are off",
    useNotifications.getState().items.length === 3,
  );
  useSettings.getState().apply(settings({ promotions: { email: false, push: true, sms: false } }));
  useNotifications.getState().notify([couponClaimedNotification(coupon, NOW)]);
  check(
    "...and does the moment the customer opts in",
    useNotifications.getState().items.length === 4,
    `${useNotifications.getState().items.length}`,
  );

  useNotifications.getState().markAllRead("customer");
  check(
    "marking all read touches one audience only",
    useNotifications.getState().items.every((n) => n.read === (n.audience === "customer")),
  );

  useNotifications.getState().clear("customer");
  check(
    "clearing an inbox takes its log rows with it",
    useNotifications.getState().outbox.length === 0,
  );
  check(
    "...and leaves the other inboxes alone",
    useNotifications.getState().items.length === 2,
  );
}

// ── 8. Every message resolves, in every language ─────────────────────────────

{
  const catalogs = Object.fromEntries(
    ["en", "bn", "ar"].map((locale) => [
      locale,
      JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Record<string, unknown>,
    ]),
  );

  function lookup(catalog: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      catalog,
    );
  }

  // Every notification the code can build, from every source.
  const everything: AppNotification[] = [
    ...([
      "placed",
      "confirmed",
      "preparing",
      "packing",
      "ready",
      "rider-assigned",
      "picked-up",
      "on-the-way",
      "arrived",
      "delivered",
      "completed",
      "rejected",
      "cancelled",
      "delivery-failed",
      "returned",
      "refunded",
    ] as OrderStatus[]).flatMap((status) =>
      notificationsFor(orderWith("delivered"), eventFor(status)),
    ),
    nearYouNotification(orderWith("delivered"), NOW),
    walletNotification(walletTxn, "BDT")!,
    walletNotification({ ...walletTxn, type: "refund" }, "BDT")!,
    walletNotification({ ...walletTxn, type: "reward" }, "BDT")!,
    couponClaimedNotification(coupon, NOW),
    ...(["pending", "confirmed", "seated", "cancelled", "no-show"] as const).flatMap((status) =>
      reservationNotifications({ ...reservation, status }, NOW),
    ),
    ...(["active", "paused", "cancelled"] as const).map(
      (status) => subscriptionNotification({ ...subscription, status }, NOW)!,
    ),
    ...(["requested", "reviewing", "quoted", "confirmed", "declined"] as const).flatMap((status) =>
      cateringNotifications({ ...quote, status }, NOW),
    ),
    ...(["customer", "restaurant", "rider"] as const).flatMap((audience) =>
      (["promo", "system"] as const).map((category) =>
        broadcastNotification({
          campaignId: "cmp_test",
          audience,
          category,
          title: "t",
          body: "b",
          href: "/",
          at: NOW,
        }),
      ),
    ),
  ];

  const paths = new Set<string>();
  for (const item of everything) {
    paths.add(`notifications.${item.audience}.${item.key}.title`);
    paths.add(`notifications.${item.audience}.${item.key}.body`);
  }
  // Plus the vocabularies the UI indexes by hand.
  for (const category of Object.keys(CATEGORY_TOPIC)) {
    paths.add(`notifications.category.${category}`);
  }
  for (const channel of DELIVERY_CHANNELS) {
    paths.add(`notifications.channel.${channel}`);
    paths.add(`admin.notifyChannel.${channel}`);
  }
  for (const status of ["sent", "suppressed", "failed"]) {
    paths.add(`notifications.dispatch.${status}`);
  }
  for (const reason of ["preferenceOff", "noEmail", "noPhone"]) {
    paths.add(`notifications.reason.${reason}`);
  }
  for (const audience of ["customer", "restaurant", "rider", "admin"]) {
    paths.add(`notifications.audience.${audience}`);
  }
  for (const segment of segments) {
    paths.add(`admin.notifySegmentName.${segment.id}`);
  }
  for (const kind of ["promotion", "announcement"]) {
    paths.add(`admin.notifyKindName.${kind}`);
    paths.add(`admin.notifyKindHint.${kind}`);
  }
  for (const error of [
    "unknownSegment",
    "noChannel",
    "emptyTitle",
    "longTitle",
    "emptyBody",
    "longSms",
    "unknown",
  ]) {
    paths.add(`admin.errors.${error}`);
  }

  console.log(`  ${paths.size} message paths emitted by the seam`);
  check("the seam emits a substantial vocabulary", paths.size > 100, `${paths.size}`);

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const missing = [...paths].filter((path) => typeof lookup(catalog, path) !== "string");
    check(
      `every message resolves in ${locale}`,
      missing.length === 0,
      missing.slice(0, 5).join(", "),
    );
  }

  // Interpolations have to line up too, or a message renders `{vendor}`.
  const en = catalogs.en;
  const unfilled: string[] = [];
  for (const item of everything) {
    if (item.text) continue;
    for (const half of ["title", "body"] as const) {
      const template = lookup(en, `notifications.${item.audience}.${item.key}.${half}`);
      if (typeof template !== "string") continue;
      for (const match of template.matchAll(/\{(\w+)[,}]/g)) {
        if (!(match[1] in item.params)) unfilled.push(`${item.key}.${half}:{${match[1]}}`);
      }
    }
  }
  check("every placeholder has a value", unfilled.length === 0, unfilled.slice(0, 5).join(", "));
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} assertions passed`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("C25 flow: all green");
