import type {
  CartSelectedOption,
  CartVendor,
  DeliveryAddress,
  Order,
  OrderCancelReason,
  OrderEvent,
  OrderStatus,
  FoodItem,
  PaymentMethod,
  RefundStatus,
} from "@/types";
import { buildCartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout";
import { createLifecycle, riderSnapshot } from "@/lib/order-lifecycle";
import {
  RIDE_ALLOWANCE_MIN,
  SCHEDULE_LEAD_MINUTES,
  stagesFor,
  TERMINAL_STATUSES,
} from "@/lib/order-machine";
import { commissionRateFor, settleOrder } from "@/lib/settlement";
import { foodsByVendor } from "./foods";
import { riders } from "./riders";
import { hashSeed, mulberry32, pick } from "./rng";
import { vendors } from "./vendors";

/**
 * demo-orders.ts — the live orders the prototype opens with.
 *
 * The lifecycle work made one store the source of truth for every surface, which
 * exposed a demo problem the old design hid: with nothing seeded, a reviewer
 * opening the restaurant dashboard sees an empty board until they go and place
 * an order themselves. So this module seeds a believable **working set** — one
 * order sitting in each interesting state, plus a couple of finished ones — the
 * first time the store hydrates on a device.
 *
 * Two properties make it hold up under demonstration:
 *
 *  - **They are real orders.** Lines come from the vendor's actual menu and are
 *    priced through `computeTotals`, the same function checkout uses, so a
 *    restaurant accepting a seeded order and a reviewer's own order are
 *    indistinguishable downstream.
 *  - **Their history is real.** Each carries a back-dated event log walked along
 *    the happy path, so the timeline, the "accepted 6 minutes ago" lines and the
 *    admin feed all have something true to render.
 *
 * Deterministic given `now`: the same device, reloaded, gets the same working
 * set. Nothing here reads the clock — callers pass `now` in.
 */

const MIN = 60_000;

/** Demo customers the seeded orders are placed by. */
const CUSTOMERS: { name: string; phone: string }[] = [
  { name: "Ayasha Rahman", phone: "+8801711223344" },
  { name: "Imran Chowdhury", phone: "+8801812345678" },
  { name: "Nabila Karim", phone: "+8801915556677" },
  { name: "Farhan Ahmed", phone: "+8801677889900" },
  { name: "Sadia Islam", phone: "+8801533221100" },
  { name: "Rafiq Uddin", phone: "+8801744332211" },
  { name: "Tasnim Haque", phone: "+8801988776655" },
  { name: "Zayan Malik", phone: "+8801611224488" },
];

/** Drop addresses the seeded orders deliver to. */
const ADDRESSES: DeliveryAddress[] = [
  {
    label: "Home", recipient: "Ayasha Rahman", phone: "+8801711223344",
    line1: "House 42, Road 11", line2: "Flat B3", area: "Banani",
    city: "Dhaka", countryCode: "BD",
    instructions: "Ring the bell twice; leave at the door if no answer.",
  },
  {
    label: "Home", recipient: "Imran Chowdhury", phone: "+8801812345678",
    line1: "House 7, Road 53", line2: null, area: "Gulshan 2",
    city: "Dhaka", countryCode: "BD", instructions: null,
  },
  {
    label: "Office", recipient: "Nabila Karim", phone: "+8801915556677",
    line1: "Level 4, Concord Tower", line2: null, area: "Dhanmondi",
    city: "Dhaka", countryCode: "BD",
    instructions: "Call from the lobby — no lift access without a pass.",
  },
  {
    label: "Home", recipient: "Farhan Ahmed", phone: "+8801677889900",
    line1: "Block C, Road 3", line2: "Apartment 9A", area: "Bashundhara R/A",
    city: "Dhaka", countryCode: "BD", instructions: "Second gate, blue building.",
  },
  {
    label: "Home", recipient: "Sadia Islam", phone: "+8801533221100",
    line1: "House 55, Road 27", line2: null, area: "Dhanmondi",
    city: "Dhaka", countryCode: "BD", instructions: "Please don't ring, baby sleeping.",
  },
  {
    label: "Work", recipient: "Rafiq Uddin", phone: "+8801744332211",
    line1: "Level 7, Kawran Bazar Tower", line2: null, area: "Tejgaon",
    city: "Dhaka", countryCode: "BD", instructions: null,
  },
  {
    label: "Home", recipient: "Tasnim Haque", phone: "+8801988776655",
    line1: "House 18, Road 12", line2: null, area: "Uttara Sector 4",
    city: "Dhaka", countryCode: "BD", instructions: "Leave with the security desk.",
  },
  {
    label: "Home", recipient: "Zayan Malik", phone: "+8801611224488",
    line1: "House 63, Road 4", line2: "Flat 2C", area: "Niketan",
    city: "Dhaka", countryCode: "BD", instructions: null,
  },
];

/** Kitchen notes attached to some seeded orders. */
const NOTES: (string | null)[] = [
  null,
  null,
  "Extra spicy, please.",
  "No onions in the salad.",
  "Cutlery not needed — saving plastic.",
  "Please pack the sauce separately.",
];

/**
 * The working set. Each entry is one order to seed: where in the lifecycle it
 * should be, and how long ago it was placed. `ageMin` is chosen so the event log
 * lands at believable intervals — a `preparing` order placed 9 minutes ago has
 * had time to be accepted, but not to be cooked.
 */
interface SeedSpec {
  status: OrderStatus;
  ageMin: number;
  fulfillment: "delivery" | "pickup";
  payment: PaymentMethod;
  /** Restaurant asked for extra time — drives the delayed-order demo. */
  delayMinutes?: number;
  reason?: OrderCancelReason;
  /**
   * How long ago the order reached its final state, for one that already has.
   * Defaults to "just now", which is right for an order still in flight and
   * wrong for a finished one: without it the event log of a week-old completed
   * order stretches to this instant, so it lands in this week's settlement
   * however long ago it was placed.
   */
  closedAgoMin?: number;
  /**
   * How far along the *happy path* this order got, for a `status` that is not on
   * it. A returned order was delivered-to-the-door and then failed, and its
   * timeline should say so — `backdatedEvents` can only walk stages it knows, so
   * the off-path tail is appended separately (`endings`).
   */
  via?: OrderStatus;
  /**
   * The off-path statuses to append after `via`, in the order they happened.
   * Defaults to `[status]`, which is right for a one-step ending (rejected at
   * intake) and wrong for a chain — a refunded order was cancelled first.
   */
  endings?: OrderStatus[];
  /**
   * Where this order's refund got to (Phase 5, G07). Seeded so every state in the
   * lifecycle — asked for, granted-not-yet-paid, refused, settled — exists on some
   * order without a reviewer having to stage one.
   */
  refund?: RefundStatus;
  /**
   * Minutes from now to this order's booked slot (Phase 17, G34). Present makes
   * the order a *scheduled* one; §7 asks for both an ASAP and a scheduled order in
   * the working set, and one of each state a scheduled order can be in — still
   * waiting, and already released — is what makes the difference demonstrable
   * without a reviewer having to book one and wait.
   */
  scheduledInMin?: number;
}

/** Who performs each off-path ending. */
const ENDING_ACTOR: Partial<Record<OrderStatus, OrderEvent["actor"]>> = {
  rejected: "restaurant",
  cancelled: "customer",
  "delivery-failed": "rider",
  returned: "rider",
  refunded: "system",
};

const WORKING_SET: SeedSpec[] = [
  // Waiting on the restaurant — the board's "New" tab has something in it.
  { status: "placed", ageMin: 2, fulfillment: "delivery", payment: "card" },
  { status: "placed", ageMin: 5, fulfillment: "pickup", payment: "wallet" },
  // Accepted, kitchen not started.
  { status: "confirmed", ageMin: 6, fulfillment: "delivery", payment: "cash" },
  // Cooking, one of them running late.
  { status: "preparing", ageMin: 11, fulfillment: "delivery", payment: "card" },
  { status: "preparing", ageMin: 24, fulfillment: "delivery", payment: "cash", delayMinutes: 10 },
  { status: "packing", ageMin: 19, fulfillment: "pickup", payment: "wallet" },
  // On the pass, waiting for dispatch — the rider app has a job to take.
  { status: "ready", ageMin: 22, fulfillment: "delivery", payment: "cash" },
  // With a courier, at each stage of the ride.
  { status: "rider-assigned", ageMin: 26, fulfillment: "delivery", payment: "card" },
  { status: "on-the-way", ageMin: 34, fulfillment: "delivery", payment: "cash" },
  { status: "arrived", ageMin: 41, fulfillment: "delivery", payment: "wallet" },
  // Finished.
  { status: "completed", ageMin: 96, fulfillment: "delivery", payment: "card" },
  { status: "completed", ageMin: 168, fulfillment: "pickup", payment: "cash" },
  // Finished *last week*, so a settlement period that has actually closed
  // exists. Without one, every vendor's payable balance is "pending" and the
  // difference between money owed and money payable cannot be demonstrated
  // (G02): a settlement only becomes available once its week is over.
  {
    status: "completed",
    ageMin: 60 * 24 * 8,
    closedAgoMin: 60 * 24 * 8 - 55,
    fulfillment: "delivery",
    payment: "card",
  },
  {
    status: "completed",
    ageMin: 60 * 24 * 9,
    closedAgoMin: 60 * 24 * 9 - 40,
    fulfillment: "delivery",
    payment: "wallet",
  },
  // Completed, with the refund lifecycle at each of its interesting points — a
  // goodwill refund already paid, one granted and still with the provider, and one
  // the desk refused. Without these, three of `RefundStatus`'s five members exist
  // in the type and nowhere else (Phase 5).
  {
    status: "completed",
    ageMin: 60 * 30 + 40,
    closedAgoMin: 60 * 30,
    fulfillment: "delivery",
    payment: "wallet",
    refund: "refunded",
  },
  {
    status: "completed",
    ageMin: 60 * 20 + 30,
    closedAgoMin: 60 * 20,
    fulfillment: "delivery",
    payment: "card",
    refund: "approved",
  },
  {
    status: "completed",
    ageMin: 60 * 53,
    closedAgoMin: 60 * 52 + 10,
    fulfillment: "delivery",
    payment: "card",
    refund: "rejected",
  },
  // The unhappy endings, so failure states are demonstrable without staging one.
  { status: "rejected", ageMin: 132, fulfillment: "delivery", payment: "card", reason: "out-of-stock" },
  { status: "cancelled", ageMin: 210, fulfillment: "delivery", payment: "wallet", reason: "changed-mind" },
  // A handover that failed and is still at the fork — retry, or take it back.
  {
    status: "delivery-failed",
    via: "arrived",
    ageMin: 58,
    fulfillment: "delivery",
    payment: "card",
    reason: "customer-unavailable",
  },
  // Failed, taken back to the kitchen, and the money asked for but not yet decided.
  {
    status: "returned",
    via: "arrived",
    endings: ["delivery-failed", "returned"],
    ageMin: 300,
    closedAgoMin: 240,
    fulfillment: "delivery",
    payment: "card",
    reason: "wrong-address",
    refund: "requested",
  },
  // Booked for tonight and still waiting: the restaurant can see it, the kitchen
  // cannot act on it, and the autopilot leaves it alone until it is released.
  {
    status: "scheduled",
    ageMin: 25,
    scheduledInMin: 3 * 60,
    fulfillment: "delivery",
    payment: "card",
  },
  // Booked, released, and now being cooked — the other end of the same lifecycle,
  // so "released" is a state somebody can look at rather than only infer.
  {
    // `ageMin` is when it was *booked* — a scheduled order's `placedAt` is the
    // moment the customer committed, not the moment a kitchen was told.
    status: "preparing",
    ageMin: 44,
    scheduledInMin: 35,
    fulfillment: "delivery",
    payment: "wallet",
  },
  // Cancelled and settled — the terminal `refunded` status, which nothing seeded.
  {
    status: "refunded",
    via: "confirmed",
    endings: ["cancelled", "refunded"],
    ageMin: 420,
    closedAgoMin: 400,
    fulfillment: "delivery",
    payment: "card",
    reason: "changed-mind",
    refund: "refunded",
  },
];

/**
 * The choices a dish's option groups *demand*, taken in menu order.
 *
 * Seeded lines used to carry no options at all, which was a shortcut with a
 * consequence: a dish whose size group is required was seeded in a state checkout
 * would have refused, and Phase 17's reorder — which re-resolves every line
 * against the menu — correctly reported that such a line could not be rebuilt
 * without the customer choosing again. The fix belongs here rather than there. A
 * seeded order has to be a *possible* order.
 *
 * Deterministic (the first `min`), because the working set has to be the same on
 * every reload; the options a customer would actually pick are not something a
 * seed can know.
 */
function requiredOptions(item: FoodItem): CartSelectedOption[] {
  const chosen: CartSelectedOption[] = [];
  for (const group of item.optionGroups) {
    const need = group.required ? Math.max(1, group.min) : group.min;
    for (const option of group.options.slice(0, need)) {
      chosen.push({
        groupId: group.id,
        optionId: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      });
    }
  }
  return chosen;
}

/** Human order reference, matching `services/orders`. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

function cartVendorOf(vendor: (typeof vendors)[number]): CartVendor {
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    // Phase 17 (G37): the snapshot carries where the restaurant is, so a seeded
    // order can be zone-checked and reordered on the same terms as a real one.
    location: {
      lat: vendor.location.lat,
      lng: vendor.location.lng,
      place: vendor.location.address,
    },
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };
}

/**
 * Back-date an event log for an order that is *already* at `target`.
 *
 * The stages are laid out between placement and now, weighted so the pauses fall
 * where they fall in a real order: a while waiting for the restaurant to answer,
 * a long stretch in the kitchen, a quick handover, a ride. Without the weights
 * every step looks equidistant, which is the tell that a timeline is fake.
 */
function backdatedEvents(
  orderId: string,
  target: OrderStatus,
  fulfillment: "delivery" | "pickup",
  placedMs: number,
  nowMs: number,
): OrderEvent[] {
  // A booked slot is not a stage of the journey (see `OrderStatus.scheduled`), so
  // it is not on `stagesFor` and cannot be walked to — it is where the order
  // started, and the only event it has.
  if (target === "scheduled") {
    return [
      { id: `evt_${orderId}_scheduled`, status: "scheduled", at: new Date(placedMs).toISOString(), actor: "customer", note: null },
    ];
  }

  const stages = stagesFor(fulfillment);
  const idx = stages.indexOf(target);
  if (idx <= 0) {
    return [
      { id: `evt_${orderId}_placed`, status: "placed", at: new Date(placedMs).toISOString(), actor: "customer", note: null },
    ];
  }

  /** Relative share of the elapsed time each step takes. */
  const WEIGHT: Partial<Record<OrderStatus, number>> = {
    confirmed: 2, preparing: 1, packing: 6, ready: 2,
    "rider-assigned": 1, "picked-up": 3, "on-the-way": 1,
    arrived: 5, delivered: 1, completed: 1,
  };
  const ACTOR: Partial<Record<OrderStatus, OrderEvent["actor"]>> = {
    confirmed: "restaurant", preparing: "restaurant", packing: "restaurant",
    ready: "restaurant", "rider-assigned": "system", "picked-up": "rider",
    "on-the-way": "rider", arrived: "rider", delivered: "rider", completed: "system",
  };

  const walked = stages.slice(1, idx + 1);
  const totalWeight = walked.reduce((sum, s) => sum + (WEIGHT[s] ?? 1), 0);
  const span = Math.max(nowMs - placedMs, MIN);

  const events: OrderEvent[] = [
    { id: `evt_${orderId}_placed`, status: "placed", at: new Date(placedMs).toISOString(), actor: "customer", note: null },
  ];

  let cursor = placedMs;
  for (const status of walked) {
    cursor += ((WEIGHT[status] ?? 1) / totalWeight) * span;
    events.push({
      id: `evt_${orderId}_${status}`,
      status,
      at: new Date(Math.min(cursor, nowMs)).toISOString(),
      actor: ACTOR[status] ?? "system",
      note: null,
    });
  }

  return events;
}

/**
 * Build the seeded working set, anchored to `now`. Pure and deterministic: the
 * same `now` bucket always yields the same orders, ids included, so the store
 * can re-seed idempotently.
 */
export function buildDemoOrders(now: number): Order[] {
  const rand = mulberry32(hashSeed("demo-orders"));

  // Vendors that actually have a menu to order from.
  const pool = vendors.filter(
    (v) => !v.deletedAt && (foodsByVendor[v.id]?.length ?? 0) > 0,
  );
  if (pool.length === 0) return [];

  const fleet = riders.filter((r) => !r.deletedAt);
  /** Couriers already carrying one of the seeded orders — see `courierFor`. */
  const carrying = new Set<string>();

  /**
   * Which courier to put on a seeded order.
   *
   * A rider carries one order at a time (G39/G40), and the store enforces it —
   * `assignRider` refuses a courier who already has something. Seeded orders are
   * constructed rather than assigned, so the rule has to be honoured here or the
   * working set opens with a rider on two live deliveries at once, which every
   * availability read downstream then has to disagree about.
   *
   * Only *live* work reserves a courier. A finished order is history, and the same
   * rider having delivered several of them is exactly what a fleet looks like.
   */
  function courierFor(status: OrderStatus, index: number) {
    const live = !TERMINAL_STATUSES.includes(status) && status !== "delivered";
    if (!live) return fleet[index % fleet.length];
    const free = fleet.find((r) => !carrying.has(r.id));
    if (!free) return null;
    carrying.add(free.id);
    return free;
  }

  return WORKING_SET.map((spec, index) => {
    const vendor = pool[index % pool.length];
    const cartVendor = cartVendorOf(vendor);
    const foods = (foodsByVendor[vendor.id] ?? []).filter((f) => !f.deletedAt);
    if (foods.length === 0) return null;

    const placedMs = now - spec.ageMin * MIN;
    const orderId = `ord_demo_${index}_${Math.floor(placedMs / MIN).toString(36)}`;

    /**
     * The booked slot, and when the kitchen was handed the order (G34).
     *
     * `placedMs` is when the *customer* committed either way; a scheduled order
     * that has already been released was handed over at the machine's own release
     * point (`SCHEDULE_LEAD_MINUTES` before the slot), and its walked stages start
     * from there rather than from the booking — which is both what makes the gap
     * between "booked" and "cooking" visible on a timeline, and what stops the
     * seed describing a release the release rule would not have made.
     */
    const scheduledFor =
      spec.scheduledInMin != null
        ? new Date(now + spec.scheduledInMin * MIN).toISOString()
        : null;
    const released = scheduledFor !== null && spec.status !== "scheduled";
    const startMs = released
      ? Date.parse(scheduledFor) - SCHEDULE_LEAD_MINUTES * MIN
      : placedMs;

    const lineCount = 1 + Math.floor(rand() * Math.min(3, foods.length));
    const lines = [...foods]
      .sort(() => rand() - 0.5)
      .slice(0, lineCount)
      .map((food) => buildCartLine(food, requiredOptions(food), rand() > 0.78 ? 2 : 1));

    const tipPercent = spec.fulfillment === "delivery" ? pick([0, 0, 0.05, 0.1], rand) : 0;
    const pricing = computeTotals({
      vendor: cartVendor,
      lines,
      tipPercent,
      coupon: null,
      fulfillment: spec.fulfillment,
    });

    const customer = CUSTOMERS[index % CUSTOMERS.length];
    const address = spec.fulfillment === "delivery" ? ADDRESSES[index % ADDRESSES.length] : null;

    // An order that has already finished stopped moving when it finished, not at
    // this instant — which is what puts it in the right settlement period.
    const closedMs = spec.closedAgoMin != null ? now - spec.closedAgoMin * MIN : now;
    const events = backdatedEvents(
      orderId,
      spec.via ?? spec.status,
      spec.fulfillment,
      startMs,
      Math.max(closedMs, startMs + MIN),
    );
    const lifecycle = createLifecycle(
      orderId,
      new Date(placedMs).toISOString(),
      spec.status === "scheduled" ? "scheduled" : "placed",
    );
    lifecycle.events = released
      ? [
          {
            id: `evt_${orderId}_scheduled`,
            status: "scheduled",
            at: new Date(placedMs).toISOString(),
            actor: "customer",
            note: null,
          },
          // The release is a `system` move carrying the note the store writes, so
          // a seeded scheduled order's timeline reads exactly like a real one's.
          ...events.map((event) =>
            event.status === "placed"
              ? { ...event, actor: "system" as const, note: "scheduled-release" }
              : event,
          ),
        ]
      : events;

    // Prep promise, for anything the restaurant accepted.
    const acceptedAt = events.find((e) => e.status === "confirmed")?.at ?? null;
    if (acceptedAt) {
      const prep = pick([15, 25, 35], rand);
      lifecycle.prepMinutes = prep;
      lifecycle.delayMinutes = spec.delayMinutes ?? 0;
      lifecycle.promisedReadyAt = new Date(
        Date.parse(acceptedAt) + (prep + (spec.delayMinutes ?? 0)) * MIN,
      ).toISOString();
      if (spec.delayMinutes) {
        lifecycle.events = [
          ...lifecycle.events,
          {
            id: `evt_${orderId}_delay`,
            status: spec.status,
            at: new Date(Date.parse(acceptedAt) + 4 * MIN).toISOString(),
            actor: "restaurant",
            note: `delay:${spec.delayMinutes}`,
          },
        ];
      }
    }

    // Courier, for anything dispatch has already handled.
    const assignedAt = events.find((e) => e.status === "rider-assigned")?.at ?? null;
    if (assignedAt) {
      const rider = courierFor(spec.status, index);
      if (rider) {
        lifecycle.rider = riderSnapshot(rider);
        lifecycle.assignment = "auto";
        lifecycle.assignedAt = assignedAt;
      }
    }

    /**
     * A seeded order that has already been collected was handed over — at the
     * `picked-up` event, not now. `handoverChecks` stays empty on purpose: the
     * working set is a history, and claiming a checklist was ticked by somebody
     * who never stood at a counter would be exactly the fabricated detail §5.4
     * rules out. An order that reached the counter shows a verified handover with
     * no recorded checklist, which is distinguishable on screen from one driven
     * on this device.
     */
    const collectedAt = events.find((e) => e.status === "picked-up")?.at ?? null;
    if (collectedAt) lifecycle.handoverVerifiedAt = collectedAt;

    if (events.some((e) => e.status === "delivered")) {
      lifecycle.otpVerifiedAt = events.find((e) => e.status === "delivered")!.at;
      lifecycle.rating = spec.status === "completed" ? pick([4, 5, 5], rand) : null;
    }

    let paymentStatus: Order["payment"]["status"] =
      spec.payment === "cash" ? "pending" : "paid";
    if (spec.status === "delivered" || spec.status === "completed") paymentStatus = "paid";

    /**
     * The off-path tail. Walked as a chain rather than handled as a special case
     * per status, because the interesting endings genuinely are chains: a returned
     * order failed at the door first, and a refunded one was cancelled first.
     *
     * Note what this no longer does: flip the payment to `refunded`. Ending a paid
     * order makes the money *owed*, not returned (Phase 5) — the refund record
     * below is what says how far that got.
     */
    const endings =
      spec.endings ??
      // `scheduled` is off the happy path but is not an *ending* — it is where a
      // booked order starts, and it is already the first event above.
      (spec.status === "scheduled" || stagesFor(spec.fulfillment).includes(spec.status)
        ? []
        : [spec.status]);
    let endCursor = Math.max(
      Date.parse(lifecycle.events[lifecycle.events.length - 1]?.at ?? ""),
      placedMs,
    );
    for (const ending of endings) {
      endCursor += 2 * MIN;
      lifecycle.events = [
        ...lifecycle.events,
        {
          id: `evt_${orderId}_${ending}`,
          status: ending,
          at: new Date(endCursor).toISOString(),
          actor: ENDING_ACTOR[ending] ?? "system",
          note: null,
        },
      ];
      if (ending === "rejected") {
        lifecycle.rejectionReason = spec.reason ?? "other";
        lifecycle.cancelledBy = "restaurant";
      }
      if (ending === "cancelled") {
        lifecycle.cancelReason = spec.reason ?? "other";
        lifecycle.cancelledBy = "customer";
      }
      if (ending === "delivery-failed" || ending === "returned") {
        lifecycle.failureReason = spec.reason ?? "customer-unavailable";
      }
    }

    /**
     * Where the refund got to. The dates are derived from the state rather than
     * seeded per order: a decision comes shortly after the order stopped moving,
     * and the money follows the decision — which is the ordering every consumer of
     * these fields assumes.
     */
    if (spec.refund && spec.refund !== "none") {
      const decidedAt = new Date(endCursor + 6 * MIN).toISOString();
      lifecycle.refund = spec.refund;
      lifecycle.refundMethod = spec.payment;
      lifecycle.refundAmount = spec.refund === "rejected" ? 0 : pricing.total;
      lifecycle.refundDecidedAt = spec.refund === "requested" ? null : decidedAt;
      lifecycle.refundSettledAt = spec.refund === "refunded" ? decidedAt : null;
      if (spec.refund === "refunded") paymentStatus = "refunded";
    }

    // The delay and failure events above are dated *earlier* than the stages
    // appended before them, so the log has to be put back in order. It is not
    // cosmetic: `lastEvent` and the autopilot's dwell both read the final entry
    // as "when did this order last change", and an out-of-order log makes both
    // of them wrong.
    lifecycle.events = [...lifecycle.events].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );

    // ETA: the booked slot where there is one, else the promise plus the ride, or
    // the moment it actually landed.
    const deliveredAt = events.find((e) => e.status === "delivered")?.at;
    const etaIso =
      deliveredAt ??
      scheduledFor ??
      (lifecycle.promisedReadyAt
        ? new Date(
            Date.parse(lifecycle.promisedReadyAt) +
              (spec.fulfillment === "delivery" ? RIDE_ALLOWANCE_MIN * MIN : 0),
          ).toISOString()
        : new Date(placedMs + 40 * MIN).toISOString());

    const placedIso = new Date(placedMs).toISOString();
    const order: Order = {
      id: orderId,
      orderNumber: orderNumberFrom(placedMs),
      vendor: cartVendor,
      lines,
      fulfillment: spec.fulfillment,
      address,
      scheduledFor,
      contact: customer,
      notes: pick(NOTES, rand),
      payment: {
        method: spec.payment,
        status: paymentStatus,
        cardLast4: spec.payment === "card" ? "4242" : null,
      },
      pricing,
      // The rate in force when this order was placed, resolved from the vendor
      // exactly as `services/orders` resolves it for a real checkout.
      commissionRate: commissionRateFor(vendor),
      status: spec.status,
      placedAt: placedIso,
      estimatedDeliveryAt: etaIso,
      createdAt: placedIso,
      updatedAt: lifecycle.events[lifecycle.events.length - 1]?.at ?? placedIso,
      deletedAt: null,
      lifecycle,
    };
    // A seeded `completed` order has already been through completion, so it must
    // carry the commission record completion stamps — otherwise the dashboards
    // open with finished orders that are missing from every settlement.
    if (order.status === "completed") {
      order.lifecycle.financials = settleOrder(order, {
        now: Date.parse(order.updatedAt),
      });
    }
    return order;
  }).filter((o): o is Order => o !== null);
}
