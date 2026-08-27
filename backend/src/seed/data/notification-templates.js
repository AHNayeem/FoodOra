/**
 * notification-templates.js — the message catalogue.
 *
 * One row per `notifications.<audience>.<key>` in `frontend/messages/*.json`,
 * which is the closed list of things this platform can tell anybody. 92 of them.
 *
 * A template is **key, audience, category, tone and href pattern** — never
 * prose. `Notification` stores a key and its params; the text is rendered from
 * `messages/en.json`, `bn.json` and `ar.json` at display time. That is the rule
 * the schema's own comment states and it is what keeps three locales in step:
 * a template holding an English sentence is a sentence nobody translates.
 *
 * ## Where each column comes from
 *
 * `category` and `tone` are `lib/notifications.ts`, which is the only place the
 * frontend decides them — `FANOUT` and `STATUS_CATEGORY` for the order
 * lifecycle, the individual factories for everything else. `href` is `hrefFor`
 * and the `href:` of each factory, with the concrete id replaced by a `{param}`
 * placeholder.
 *
 * `channels`, `topic` and `isRequired` are **derived**, by the two rules
 * `channelsFor` actually implements:
 *
 *  - **Only a customer has preferences.** `channelsFor` returns `["inApp"]`
 *    immediately for a restaurant, a rider or an admin — there is no settings
 *    page behind those audiences — so their templates are in-app only, carry no
 *    topic, and are `isRequired` because nothing can suppress them.
 *  - **A customer's topic is `CATEGORY_TOPIC[category]`**, and `isRequired` is
 *    true when that topic is `orderUpdates` (locked to email by
 *    `REQUIRED_NOTIFICATIONS` — a receipt is not optional) or when there is no
 *    topic at all (`system`, a service announcement, which the same function
 *    always emails).
 *
 * Deriving rather than listing is deliberate: written out, those three columns
 * would be 276 hand-typed values that must agree with a function in another
 * repository, and the first one to drift would silently email somebody who
 * turned email off.
 */

/** `lib/notifications.ts::CATEGORY_TOPIC` — which preference governs each category. */
const CATEGORY_TOPIC = {
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

const ORDER_HREF = "/orders/{orderId}";
const ADMIN_ORDER_HREF = "/admin/orders/{orderId}";
const SUPPORT_HREF = "/account/support/{ticketId}";

/**
 * `[key, category, tone, hrefPattern]`.
 *
 * A `null` href means the notification's link is supplied at emit time and has
 * no fixed shape — a broadcast points wherever the campaign points, and a payout
 * points at the run that produced it.
 */
const CUSTOMER = [
  // The order lifecycle. Everything from `rider-assigned` onward is a *delivery*
  // alert rather than an order one, which is what gives a customer who wants the
  // receipt but not the doorstep play-by-play a switch that works.
  ["placed", "order", "success", ORDER_HREF],
  ["scheduled", "order", "success", ORDER_HREF],
  ["confirmed", "order", "success", ORDER_HREF],
  ["preparing", "order", "info", ORDER_HREF],
  ["packing", "order", "info", ORDER_HREF],
  ["ready", "order", "success", ORDER_HREF],
  ["rider-assigned", "delivery", "success", ORDER_HREF],
  ["picked-up", "delivery", "success", ORDER_HREF],
  ["on-the-way", "delivery", "info", ORDER_HREF],
  ["nearYou", "delivery", "warning", ORDER_HREF],
  ["arrived", "delivery", "warning", ORDER_HREF],
  ["delivered", "delivery", "success", ORDER_HREF],
  ["completed", "order", "success", ORDER_HREF],
  ["rejected", "order", "danger", ORDER_HREF],
  ["cancelled", "order", "danger", ORDER_HREF],
  ["delivery-failed", "delivery", "danger", ORDER_HREF],
  ["returned", "delivery", "warning", ORDER_HREF],
  ["refunded", "payment", "success", ORDER_HREF],
  // After the order.
  ["reviewInvite", "review", "info", "/account/reviews?order={orderId}"],
  // Money.
  ["walletToppedUp", "payment", "success", "/account/wallet"],
  ["walletRefunded", "payment", "success", "/account/wallet"],
  ["walletReward", "payment", "success", "/account/wallet"],
  ["refundApproved", "payment", "success", ORDER_HREF],
  ["refundRejected", "payment", "warning", ORDER_HREF],
  ["refundSettled", "payment", "success", ORDER_HREF],
  // Promotion.
  ["couponClaimed", "promo", "success", "/account/coupons"],
  ["broadcastPromo", "promo", "info", null],
  ["broadcastAnnouncement", "system", "info", null],
  // Bookings.
  ["bookingRequested", "reservation", "info", "/account/reservations"],
  ["bookingConfirmed", "reservation", "success", "/account/reservations"],
  ["bookingSeated", "reservation", "success", "/account/reservations"],
  ["bookingCancelled", "reservation", "danger", "/account/reservations"],
  ["bookingNoShow", "reservation", "warning", "/account/reservations"],
  // Meal plans.
  ["subscriptionActive", "subscription", "success", "/account/subscriptions"],
  ["subscriptionPaused", "subscription", "success", "/account/subscriptions"],
  ["subscriptionCancelled", "subscription", "warning", "/account/subscriptions"],
  // Catering.
  ["quoteRequested", "catering", "success", "/catering/quote/{quoteId}"],
  ["quoteReviewing", "catering", "success", "/catering/quote/{quoteId}"],
  ["quoteReady", "catering", "success", "/catering/quote/{quoteId}"],
  ["quoteConfirmed", "catering", "success", "/catering/quote/{quoteId}"],
  ["quoteDeclined", "catering", "danger", "/catering/quote/{quoteId}"],
  // Support. Category `order` rather than `system`, as the factory has it: a
  // ticket is about an order and belongs under the same preference.
  ["supportOpened", "order", "info", SUPPORT_HREF],
  ["supportReplied", "order", "success", SUPPORT_HREF],
  ["supportResolved", "order", "success", SUPPORT_HREF],
  ["supportRejected", "order", "warning", SUPPORT_HREF],
  ["supportUpdated", "order", "success", SUPPORT_HREF],
];

const RESTAURANT = [
  ["newOrder", "order", "info", "/dashboard/orders"],
  ["scheduledOrder", "order", "info", "/dashboard/orders"],
  ["riderAssigned", "delivery", "info", "/dashboard/orders"],
  ["deliveryCompleted", "delivery", "success", "/dashboard/orders"],
  ["orderCancelled", "order", "danger", "/dashboard/orders"],
  ["deliveryFailed", "delivery", "danger", "/dashboard/orders"],
  ["orderReturned", "delivery", "warning", "/dashboard/orders"],
  ["bookingRequest", "reservation", "info", "/dashboard/reservations"],
  ["bookingCancelled", "reservation", "warning", "/dashboard/reservations"],
  ["quoteEnquiry", "catering", "info", "/dashboard"],
  ["broadcastPromo", "promo", "info", null],
  ["broadcastAnnouncement", "system", "info", null],
  ["applicationSubmitted", "system", "info", "/partner/apply"],
  ["applicationApproved", "system", "success", "/dashboard"],
  ["applicationRejected", "system", "danger", "/partner/apply"],
  ["applicationSuspended", "system", "danger", "/partner/apply"],
  ["payoutSent", "payment", "success", null],
];

const RIDER = [
  ["pickupReady", "order", "info", "/delivery"],
  ["deliveryAssigned", "delivery", "success", "/delivery"],
  ["otpNeeded", "delivery", "info", "/delivery"],
  ["otpVerified", "delivery", "success", "/delivery"],
  ["broadcastPromo", "promo", "info", null],
  ["broadcastAnnouncement", "system", "info", null],
  ["applicationSubmitted", "system", "info", "/rider/apply"],
  ["applicationApproved", "system", "success", "/delivery"],
  ["applicationRejected", "system", "danger", "/rider/apply"],
  ["applicationSuspended", "system", "danger", "/rider/apply"],
  ["applicationDeactivated", "system", "warning", "/rider/apply"],
  ["payoutSent", "payment", "success", null],
];

const ADMIN = [
  ["placed", "order", "info", ADMIN_ORDER_HREF],
  ["confirmed", "order", "info", ADMIN_ORDER_HREF],
  ["rider-assigned", "delivery", "info", ADMIN_ORDER_HREF],
  ["delivered", "delivery", "info", ADMIN_ORDER_HREF],
  ["completed", "order", "info", ADMIN_ORDER_HREF],
  ["rejected", "order", "danger", ADMIN_ORDER_HREF],
  ["cancelled", "order", "danger", ADMIN_ORDER_HREF],
  ["delivery-failed", "delivery", "danger", ADMIN_ORDER_HREF],
  ["returned", "delivery", "warning", ADMIN_ORDER_HREF],
  ["refunded", "payment", "info", ADMIN_ORDER_HREF],
  ["refundRequested", "payment", "warning", ADMIN_ORDER_HREF],
  ["refundSettled", "payment", "info", ADMIN_ORDER_HREF],
  ["supportOpened", "order", "warning", "/admin/support/{ticketId}"],
  ["supportCustomerReplied", "order", "warning", "/admin/support/{ticketId}"],
  ["applicationReceived", "system", "warning", "/admin/restaurants/{applicationId}"],
  ["riderApplicationReceived", "system", "warning", "/admin/riders/{applicationId}"],
  ["contactMessage", "system", "info", "/admin/cms"],
];

/** The four channels a customer notification may use before preferences apply. */
const CUSTOMER_CHANNELS = ["inApp", "push", "email", "sms"];

function expand(audience, rows) {
  const isCustomer = audience === "customer";
  return rows.map(([key, category, tone, hrefPattern]) => {
    const topic = isCustomer ? CATEGORY_TOPIC[category] : null;
    return {
      key,
      audience,
      category,
      tone,
      hrefPattern,
      channels: isCustomer ? CUSTOMER_CHANNELS : ["inApp"],
      topic,
      isRequired: isCustomer ? topic === null || topic === "orderUpdates" : true,
    };
  });
}

export const notificationTemplates = [
  ...expand("customer", CUSTOMER),
  ...expand("restaurant", RESTAURANT),
  ...expand("rider", RIDER),
  ...expand("admin", ADMIN),
];
