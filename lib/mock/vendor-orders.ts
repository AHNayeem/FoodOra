import type { CartVendor, Order, OrderStatus, PaymentMethod } from "@/types";
import { buildCartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout";
import { foodsByVendor } from "./foods";
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

/** Demo customer names attached to each order's contact snapshot. */
const CUSTOMERS = [
  "Ayesha Rahman", "Imran Chowdhury", "Nabila Karim", "Farhan Ahmed",
  "Sadia Islam", "Rafiq Uddin", "Tasnim Haque", "Zayan Malik",
  "Mitu Akter", "Shakib Alam", "Rima Sultana", "Arif Hasan",
  "Nusaiba Noor", "Hasib Rahman", "Lamia Chowdhury", "Omar Faruk",
];

/** mulberry32 — small deterministic PRNG so a vendor's history never shifts. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Derive the human order reference the same way `services/orders` does. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/** Map elapsed minutes since an order was placed onto its lifecycle stage. */
function statusForAge(ageMin: number, fulfillment: "delivery" | "pickup"): OrderStatus {
  if (ageMin < 8) return "placed";
  if (ageMin < 18) return "confirmed";
  if (ageMin < 34) return "preparing";
  if (ageMin < 50) return fulfillment === "pickup" ? "ready" : "picked-up";
  if (ageMin < 62 && fulfillment === "delivery") return "on-the-way";
  return "delivered";
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
      const placedMs = todayMidnight - day * DAY + (hour * 60 + minute) * MIN;

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
        promo: null,
        fulfillment,
      });

      // ~6% of settled orders are cancelled; fresh ones follow the age lifecycle.
      const status: OrderStatus =
        ageMin > 62 && rng() < 0.06 ? "cancelled" : statusForAge(ageMin, fulfillment);

      const method: PaymentMethod = pick<PaymentMethod>([
        "cash", "cash", "card", "card", "wallet",
      ]);
      const paid = method !== "cash" || status === "delivered";
      const customer = pick(CUSTOMERS);
      const placedIso = new Date(placedMs).toISOString();
      const etaIso = new Date(placedMs + 40 * MIN).toISOString();

      orders.push({
        id: `ord_${vendorId}_${placedMs.toString(36)}`,
        orderNumber: orderNumberFrom(placedMs),
        vendor: cartVendor,
        lines,
        fulfillment,
        address: null, // vendor-side view doesn't need the delivery snapshot
        scheduledFor: null,
        contact: { name: customer, phone: "+8801711000000" },
        notes: null,
        payment: {
          method,
          status: status === "cancelled" ? "failed" : paid ? "paid" : "pending",
          cardLast4: method === "card" ? "4242" : null,
        },
        pricing,
        status,
        placedAt: placedIso,
        estimatedDeliveryAt: etaIso,
        createdAt: placedIso,
        updatedAt: placedIso,
        deletedAt: null,
      });
    }
  }

  return orders.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}
