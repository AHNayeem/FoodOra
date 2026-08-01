import type {
  AppNotification,
  NotifyAudience,
  NotifyTone,
  Order,
  OrderEvent,
  OrderStatus,
} from "@/types";

/**
 * notifications.ts — turning a lifecycle transition into the messages each role
 * should receive (spec: Notifications).
 *
 * One rule, stated once: a transition fans out to a fixed set of audiences, and
 * each audience gets its own message. Call sites never construct notifications —
 * the store calls `notificationsFor(order, event)` after every committed
 * transition, so a new state cannot ship without someone deciding who hears
 * about it.
 *
 * Message text lives in `messages/*.json` under
 * `notifications.<audience>.<key>` with a `.title` / `.body` pair, so all three
 * locales stay in step.
 */

/** One entry in a status's fan-out table. */
interface Fanout {
  audience: NotifyAudience;
  /** i18n key; defaults to the status name. */
  key?: string;
  tone?: NotifyTone;
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
  refunded: [{ audience: "customer", tone: "success" }, { audience: "admin" }],
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

/**
 * The notifications a committed transition produces. Pure — the store persists
 * whatever comes back, and the acting surface separately raises its own toast.
 */
export function notificationsFor(order: Order, event: OrderEvent): AppNotification[] {
  const entries = FANOUT[event.status];
  if (!entries) return [];

  const rider = order.lifecycle.rider;

  return entries.map((entry) => {
    const key = entry.key ?? event.status;
    return {
      id: `ntf_${event.id}_${entry.audience}`,
      audience: entry.audience,
      key,
      params: {
        order: order.orderNumber,
        vendor: order.vendor.name,
        customer: order.contact.name,
        rider: rider?.name ?? "",
        minutes: order.lifecycle.prepMinutes ?? 0,
      },
      tone: entry.tone ?? "info",
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: event.status,
      href: hrefFor(entry.audience, order),
      at: event.at,
      read: false,
    };
  });
}

/**
 * The extra "your rider is close" nudge (spec: customer "Near You"). Not a
 * status change — dispatch raises it partway through the ride — so it is built
 * here rather than falling out of the fan-out table.
 */
export function nearYouNotification(order: Order, at: string): AppNotification {
  return {
    id: `ntf_${order.id}_near-you`,
    audience: "customer",
    key: "nearYou",
    params: { order: order.orderNumber, rider: order.lifecycle.rider?.name ?? "" },
    tone: "warning",
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: "on-the-way",
    href: `/orders/${order.id}`,
    at,
    read: false,
  };
}
