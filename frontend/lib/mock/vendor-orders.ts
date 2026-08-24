import type { CartVendor, Order, OrderStatus, PaymentMethod } from "@/types";
import { buildCartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout";
import { synthesiseLifecycle } from "@/lib/order-lifecycle";
import { commissionRateFor } from "@/lib/settlement";
import { foodsByVendor } from "./foods";
import { hashSeed, mulberry32 } from "./rng";
import { vendorById } from "./vendors";

/**
 * vendor-orders.ts — the demo order history behind the vendor dashboard (C10).
 *
 * There is no backend, so a real "orders for this vendor over the last week"
 * query is *synthesised* here. `buildVendorOrders(vendorId, now)` is a pure
 * factory: given the same vendor and clock it always returns the same set of
 * `Order` records (deterministic PRNG seeded from the vendor id), but the
 * timestamps are anchored to `now` so the dashboard always shows a live-looking
 * "today". Every record is a real `Order` — identical to what checkout (C8)
 * produces — so analytics, the order board and the receipt all share one shape
 * and map 1:1 onto the eventual Prisma `Order` table.
 *
 * Called from `services/vendor.ts` with `Date.now()`; the seed file itself never
 * reads the clock, keeping module evaluation deterministic.
 */

const DAY = 86_400_000;
const MIN = 60_000;

/** Orders generated per day, index 0 = today (partial), 6 = a week ago. */
const DAY_COUNTS = [14, 12, 16, 11, 13, 17, 10];

/** Hour-of-day pool sampled uniformly — repeats create the lunch/dinner peaks. */
const HOUR_POOL = [
  9, 10, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 15, 16, 17, 18, 18, 19, 19, 19,
  20, 20, 20, 21, 21, 21, 22, 22, 23,
];

/**
 * Contact numbers. Previously every synthesised customer shared one number,
 * which reads as placeholder data the moment anyone scrolls the board.
 */
const PHONES = [
  "+8801711223344", "+8801812345678", "+8801915556677", "+8801677889900",
  "+8801533221100", "+8801744332211", "+8801988776655", "+8801611224488",
];

/** Demo customer names attached to each order's contact snapshot. */
const CUSTOMERS = [
  "Ayesha Rahman", "Imran Chowdhury", "Nabila Karim", "Farhan Ahmed",
  "Sadia Islam", "Rafiq Uddin", "Tasnim Haque", "Zayan Malik",
  "Mitu Akter", "Shakib Alam", "Rima Sultana", "Arif Hasan",
  "Nusaiba Noor", "Hasib Rahman", "Lamia Chowdhury", "Omar Faruk",
];

/** Derive the human order reference the same way `services/orders` does. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/**
 * Map elapsed minutes since an order was placed onto its lifecycle stage.
 *
 * Widened to the full state set so a week of history contains packing, dispatch
 * and arrival like a real week does — an analytics feed that only knows six of
 * fifteen states quietly misreports what the restaurant's day looked like.
 * Anything older than an hour has settled.
 */
function statusForAge(ageMin: number, fulfillment: "delivery" | "pickup"): OrderStatus {
  if (ageMin < 6) return "placed";
  if (ageMin < 12) return "confirmed";
  if (ageMin < 26) return "preparing";
  if (ageMin < 32) return "packing";
  if (ageMin < 38) return "ready";
  if (fulfillment === "pickup") return ageMin < 55 ? "delivered" : "completed";
  if (ageMin < 43) return "rider-assigned";
  if (ageMin < 47) return "picked-up";
  if (ageMin < 58) return "on-the-way";
  if (ageMin < 62) return "arrived";
  if (ageMin < 75) return "delivered";
  return "completed";
}

/**
 * Build the full order history for a vendor, anchored to `now`. Returns the
 * orders newest-first. Callers filter/aggregate as needed (see analytics).
 */
export function buildVendorOrders(vendorId: string, now: number): Order[] {
  const vendor = vendorById.get(vendorId);
  const foods = (foodsByVendor[vendorId] ?? []).filter((f) => !f.deletedAt);
  if (!vendor || foods.length === 0) return [];

  const cartVendor: CartVendor = {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };

  const rng = mulberry32(hashSeed(vendorId));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const dt = new Date(now);
  const minutesSinceMidnight = dt.getHours() * 60 + dt.getMinutes();
  const todayMidnight = now - minutesSinceMidnight * MIN;

  const orders: Order[] = [];

  for (let day = 0; day < DAY_COUNTS.length; day++) {
    for (let i = 0; i < DAY_COUNTS[day]; i++) {
      const hour = pick(HOUR_POOL);
      const minute = Math.floor(rng() * 60);
      /**
       * Seconds, derived from the index within the day.
       *
       * Not decoration — it is what makes an order's *identity* unique. Both
       * `id` and `orderNumber` below are derived from `placedMs`, and this
       * timestamp was minute-granular: with a dozen or more orders a day drawn
       * from a pool of a few hundred minute slots, two of them collided
       * regularly, and two orders sharing one id is one order the books counted
       * twice. It surfaced as `buildVendorSettlements` listing 83 order ids for
       * 81 orders, so the restaurant's settlement, the platform's payout run and
       * this phase's analytics all over-reported by exactly the value of the
       * duplicated orders — the failure `mergeOrders` warns about in its own
       * comment, arriving from inside the synthesiser rather than from the merge.
       *
       * `i` is unique within a day and the day offset separates the days, so the
       * instant — and therefore the id and the reference — is now unique by
       * construction rather than by luck. Determinism is untouched: the same
       * vendor and clock still produce the same set.
       */
      const placedMs =
        todayMidnight - day * DAY + (hour * 60 + minute) * MIN + i * 1000;

      // Skip anything still in the future or too fresh to have a sensible stage.
      const ageMin = (now - placedMs) / MIN;
      if (ageMin < 3) continue;

      // 1–3 distinct items, quantities 1–3 (skewed low).
      const lineCount = 1 + Math.floor(rng() * Math.min(3, foods.length));
      const chosen = [...foods].sort(() => rng() - 0.5).slice(0, lineCount);
      const lines = chosen.map((food) => {
        const roll = rng();
        const qty = roll > 0.85 ? 3 : roll > 0.5 ? 2 : 1;
        return buildCartLine(food, [], qty);
      });

      const fulfillment: "delivery" | "pickup" = rng() > 0.28 ? "delivery" : "pickup";
      const tipPercent = fulfillment === "delivery" ? pick([0, 0, 0.05, 0.1]) : 0;
      const pricing = computeTotals({
        vendor: cartVendor,
        lines,
        tipPercent,
        coupon: null,
        fulfillment,
      });

      // ~6% of settled orders end badly. Rejection and cancellation are now
      // distinct states, so the split is modelled rather than collapsed into
      // one bucket the dashboard cannot tell apart.
      const roll = rng();
      const status: OrderStatus =
        ageMin > 62 && roll < 0.06
          ? roll < 0.025
            ? "rejected"
            : "cancelled"
          : statusForAge(ageMin, fulfillment);

      const method: PaymentMethod = pick<PaymentMethod>([
        "cash", "cash", "card", "card", "wallet",
      ]);
      const settled = status === "delivered" || status === "completed";
      const paid = method !== "cash" || settled;
      const customer = pick(CUSTOMERS);
      const placedIso = new Date(placedMs).toISOString();
      const etaIso = new Date(placedMs + 40 * MIN).toISOString();

      const failed = status === "cancelled" || status === "rejected";
      // Built without its lifecycle first: `synthesiseLifecycle` reads the
      // order's status and timestamps to reconstruct one.
      const base: Omit<Order, "lifecycle"> = {
        id: `ord_${vendorId}_${placedMs.toString(36)}`,
        orderNumber: orderNumberFrom(placedMs),
        vendor: cartVendor,
        lines,
        fulfillment,
        address: null, // vendor-side view doesn't need the delivery snapshot
        scheduledFor: null,
        contact: { name: customer, phone: pick(PHONES) },
        notes: null,
        payment: {
          method,
          status: failed ? (paid ? "refunded" : "failed") : paid ? "paid" : "pending",
          cardLast4: method === "card" ? "4242" : null,
        },
        pricing,
        commissionRate: commissionRateFor(vendor),
        status,
        placedAt: placedIso,
        estimatedDeliveryAt: etaIso,
        createdAt: placedIso,
        updatedAt: placedIso,
        deletedAt: null,
      };
      orders.push({
        ...base,
        lifecycle: synthesiseLifecycle(base as Order),
      });
    }
  }

  return orders.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}
