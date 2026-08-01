import type {
  CartVendor,
  DeliveryJob,
  DeliveryJobOrder,
  DeliveryZone,
  PaymentMethod,
  Rider,
  RiderRemittance,
  Vendor,
} from "@/types";
import { buildCartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout";
import { fromDateKey, toDateKey } from "@/lib/dates";
import {
  computePayout,
  haversineKm,
  optimiseRoute,
  otpFor,
  routeDistanceKm,
  routeMinutes,
  type UnroutedStop,
} from "@/lib/delivery";
import { zoneById } from "./delivery-zones";
import { foodsByVendor } from "./foods";
import { riderById } from "./riders";
import { hashSeed, mulberry32, pick } from "./rng";
import { vendors } from "./vendors";

/**
 * delivery-jobs.ts — the trips a rider is offered and has already run (C18).
 *
 * Same approach as the vendor's order history (C10) and the venue's book (C16):
 * there is no backend to query, so the work is *synthesised* on request from a
 * PRNG seeded by the rider (and, for offers, by a five-minute time bucket) and
 * anchored to a `now` the caller passes in. A reload therefore shows the same
 * earnings and the same offers, but "today" is always today.
 *
 * Two properties are worth calling out, because they are what stops this being
 * decorative:
 *
 *  - **The orders are real orders.** Lines are built from the vendor's actual
 *    dishes and priced through `computeTotals`, the same function checkout uses,
 *    so what a rider collects on a cash order is a genuine order total including
 *    that vendor's delivery fee, VAT and the tip that pays the rider.
 *  - **The routes are real routes.** Pickups sit at the vendor's coordinates and
 *    drops at addresses inside the rider's zone, and every trip is put through
 *    the same `optimiseRoute` the trip screen displays — so a batch of two is
 *    genuinely sequenced, and its distance, ETA and payout follow from geometry
 *    rather than being invented alongside it.
 */

const MIN = 60_000;
const DAY = 86_400_000;

/** How long a batch of offers stays put before the pool refreshes. */
export const OFFER_WINDOW_MS = 5 * MIN;

/** How long a rider has to take an offer. Outlives one window, so the list is never empty. */
const OFFER_TTL_MS = 9 * MIN;

/** Trips generated per day, index 0 = today (partial), 6 = a week ago. */
const TRIPS_PER_DAY = [6, 9, 8, 11, 7, 12, 8];

/** Hours a trip can start — repeats make the lunch and dinner peaks. */
const HOUR_POOL = [
  10, 11, 12, 12, 12, 13, 13, 13, 14, 15, 16, 17, 18, 19, 19, 19, 20, 20, 20,
  21, 21, 22,
];

const CUSTOMERS = [
  "Ayesha Rahman", "Imran Chowdhury", "Nabila Karim", "Farhan Ahmed",
  "Sadia Islam", "Rafiq Uddin", "Tasnim Haque", "Zayan Malik",
  "Mitu Akter", "Shakib Alam", "Rima Sultana", "Arif Hasan",
  "Nusaiba Noor", "Hasib Rahman", "Lamia Chowdhury", "Omar Faruk",
];

/** Door instructions riders actually get — mostly nothing. */
const DROP_NOTES: (string | null)[] = [
  null, null, null, null,
  "Call from the gate, the bell is broken.",
  "Flat 4B — lift is on the left.",
  "Leave with the security desk if I don't pick up.",
  "Please don't ring, baby sleeping.",
  "Second gate, blue building.",
];

/** What the counter tells a rider on arrival. */
const PICKUP_NOTES: (string | null)[] = [
  null, null, null,
  "Collect from the rider counter, not the till.",
  "Two bags — check the drinks are in.",
  "Ask for the packer, order is under the customer's name.",
];

interface DropPoint {
  area: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Residential drop points per zone. Coordinates are inside each zone, so the
 * routes the router produces look like the rides a courier in that part of Dhaka
 * would make (and a zone's trips never wander into another zone's streets).
 */
const DROP_POINTS: Record<string, DropPoint[]> = {
  dzn_gulshan: [
    { area: "Gulshan 1", address: "House 42, Road 11", lat: 23.7793, lng: 90.4165 },
    { area: "Gulshan 2", address: "House 7, Road 53", lat: 23.7948, lng: 90.4172 },
    { area: "Banani", address: "Flat 4B, House 21, Road 6", lat: 23.7942, lng: 90.4009 },
    { area: "Baridhara", address: "Block J, Road 8", lat: 23.8062, lng: 90.4238 },
    { area: "Bashundhara R/A", address: "Block C, Road 3", lat: 23.8156, lng: 90.4362 },
    { area: "Niketan", address: "House 63, Road 4", lat: 23.7771, lng: 90.4121 },
    { area: "Mohakhali", address: "DOHS Road 5, House 318", lat: 23.7801, lng: 90.3998 },
    { area: "Badda", address: "Link Road, Ranavola", lat: 23.7838, lng: 90.4271 },
  ],
  dzn_dhanmondi: [
    { area: "Dhanmondi", address: "House 55, Road 27", lat: 23.7566, lng: 90.3729 },
    { area: "Dhanmondi", address: "House 12, Road 8/A", lat: 23.7452, lng: 90.3736 },
    { area: "Kalabagan", address: "Lake Circus, 2nd floor", lat: 23.7495, lng: 90.3841 },
    { area: "Mohammadpur", address: "Block D, Shyamoli", lat: 23.7671, lng: 90.3603 },
    { area: "Lalmatia", address: "Block B, House 4", lat: 23.7602, lng: 90.3672 },
    { area: "Shantinagar", address: "Chamelibagh, House 19", lat: 23.7398, lng: 90.4135 },
    { area: "Tejgaon", address: "Nakhalpara, Road 2", lat: 23.7657, lng: 90.3921 },
  ],
  dzn_uttara: [
    { area: "Uttara Sector 4", address: "House 18, Road 12", lat: 23.8628, lng: 90.3985 },
    { area: "Uttara Sector 7", address: "House 3, Road 35", lat: 23.8741, lng: 90.3812 },
    { area: "Mirpur 10", address: "Block B, Senpara", lat: 23.8072, lng: 90.3691 },
    { area: "Pallabi", address: "Block D, Road 5", lat: 23.8248, lng: 90.3652 },
    { area: "Kalshi", address: "Housing Estate, Building 7", lat: 23.8291, lng: 90.3789 },
  ],
};

/** Payment mix — cash still carries a big share of Dhaka deliveries. */
const PAYMENT_POOL: PaymentMethod[] = [
  "cash", "cash", "cash", "cash", "card", "card", "wallet",
];

/** "Gulshan Ave, Gulshan 1" → "Gulshan 1"; the tail of an address is its area. */
function areaOf(vendor: Vendor): string {
  const parts = vendor.location.address.split(",");
  return (parts[parts.length - 1] ?? vendor.location.city).trim();
}

/**
 * The vendors a zone's riders collect from: everyone inside a short ride of the
 * zone centre. Membership is *computed* from the coordinates the catalog already
 * has rather than stored on the vendor, so adding a restaurant to the seed puts
 * it in the right pool automatically. Sparse zones fall back to their nearest few
 * so a rider is never offered an empty trip.
 */
function vendorsForZone(zone: DeliveryZone): Vendor[] {
  const candidates = vendors
    .filter((v) => !v.deletedAt && (foodsByVendor[v.id]?.length ?? 0) > 0)
    .map((v) => ({ vendor: v, km: haversineKm(zone, v.location) }))
    .sort((a, b) => a.km - b.km);

  const near = candidates.filter((c) => c.km <= 5).map((c) => c.vendor);
  return near.length >= 3 ? near : candidates.slice(0, 4).map((c) => c.vendor);
}

/** Human trip reference, e.g. "TRP-8F3A21". */
function jobNumberFrom(key: string): string {
  return `TRP-${hashSeed(key).toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/** Order reference, derived the same way `services/orders` derives its own. */
function orderNumberFrom(ms: number): string {
  return `FO-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

function cartVendorFor(vendor: Vendor): CartVendor {
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };
}

/**
 * Build one trip: `orderCount` orders, their pickup/drop pairs put through the
 * router, and what the whole thing pays. Everything derives from `placedMs` and
 * the seeded `rand`, so the trip is reproducible.
 */
function buildJob({
  rider,
  zone,
  pool,
  rand,
  placedMs,
  orderCount,
}: {
  rider: Rider;
  zone: DeliveryZone;
  pool: Vendor[];
  rand: () => number;
  placedMs: number;
  orderCount: number;
}): DeliveryJob | null {
  if (pool.length === 0) return null;

  const jobId = `job_${rider.id}_${placedMs.toString(36)}`;
  const drops = DROP_POINTS[zone.id] ?? [];
  if (drops.length === 0) return null;

  // Distinct vendors, so a batch is two kitchens rather than one order twice.
  const chosen: Vendor[] = [];
  for (let guard = 0; chosen.length < Math.min(orderCount, pool.length) && guard < 20; guard++) {
    const candidate = pick(pool, rand);
    if (!chosen.some((v) => v.id === candidate.id)) chosen.push(candidate);
  }

  const orders: DeliveryJobOrder[] = [];
  const stops: UnroutedStop[] = [];
  let tips = 0;

  chosen.forEach((vendor, index) => {
    const foods = (foodsByVendor[vendor.id] ?? []).filter((f) => !f.deletedAt);
    if (foods.length === 0) return;

    const lineCount = 1 + Math.floor(rand() * Math.min(3, foods.length));
    const lines = [...foods]
      .sort(() => rand() - 0.5)
      .slice(0, lineCount)
      .map((food) => buildCartLine(food, [], rand() > 0.75 ? 2 : 1));

    const tipPercent = pick([0, 0, 0.05, 0.05, 0.1], rand);
    const pricing = computeTotals({
      vendor: cartVendorFor(vendor),
      lines,
      tipPercent,
      promo: null,
      fulfillment: "delivery",
    });
    tips += pricing.tip;

    const method = pick(PAYMENT_POOL, rand);
    const cashDue = method === "cash" ? pricing.total : 0;
    const customer = pick(CUSTOMERS, rand);
    const drop = pick(drops, rand);
    const orderId = `ord_${vendor.id}_${placedMs.toString(36)}_${index}`;

    orders.push({
      orderId,
      orderNumber: orderNumberFrom(placedMs + index * 1000),
      vendorId: vendor.id,
      vendorName: vendor.name,
      customerName: customer,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      orderTotal: pricing.total,
      paymentMethod: method,
      cashDue,
    });

    stops.push(
      {
        id: `${jobId}_p${index}`,
        kind: "pickup",
        orderId,
        orderNumber: orderNumberFrom(placedMs + index * 1000),
        name: vendor.name,
        address: vendor.location.address,
        area: areaOf(vendor),
        phone: "+8802255000000",
        lat: vendor.location.lat,
        lng: vendor.location.lng,
        instructions: pick(PICKUP_NOTES, rand),
        otp: null,
        cashDue: 0,
      },
      {
        id: `${jobId}_d${index}`,
        kind: "dropoff",
        orderId,
        orderNumber: orderNumberFrom(placedMs + index * 1000),
        name: customer,
        address: `${drop.address}, ${drop.area}`,
        area: drop.area,
        phone: "+8801711000000",
        lat: drop.lat,
        lng: drop.lng,
        instructions: pick(DROP_NOTES, rand),
        // Both sides derive the handoff code from the order id — see lib/delivery.
        otp: otpFor(orderId),
        cashDue,
      },
    );
  });

  if (orders.length === 0) return null;

  // The rider is idling in their zone, so the first leg is a real ride in.
  const routed = optimiseRoute({ lat: zone.lat, lng: zone.lng }, stops, rider.vehicle);
  const distanceKm = routeDistanceKm(routed);
  const offeredIso = new Date(placedMs).toISOString();

  return {
    id: jobId,
    createdAt: offeredIso,
    updatedAt: offeredIso,
    deletedAt: null,
    jobNumber: jobNumberFrom(jobId),
    riderId: null,
    zoneId: zone.id,
    currency: zone.currency,
    orders,
    stops: routed,
    status: "offered",
    distanceKm,
    estimatedMinutes: routeMinutes(routed),
    payout: computePayout({
      zone,
      distanceKm,
      orderCount: orders.length,
      tips,
      at: new Date(placedMs),
    }),
    cashToCollect: orders.reduce((sum, o) => sum + o.cashDue, 0),
    offeredAt: offeredIso,
    expiresAt: new Date(placedMs + OFFER_TTL_MS).toISOString(),
    acceptedAt: null,
    completedAt: null,
    cancelledAt: null,
    completedStopIds: [],
  };
}

/** Resolve the rider and their zone, or null if either is missing. */
function contextFor(riderId: string): { rider: Rider; zone: DeliveryZone } | null {
  const rider = riderById.get(riderId);
  const zone = rider ? zoneById.get(rider.zoneId) : undefined;
  if (!rider || !zone) return null;
  return { rider, zone };
}

/**
 * A rider's completed trips over the past week, newest first — the input to
 * earnings, the wallet ledger and trip history. Trips that would still be in the
 * future are skipped, so "today" fills up as the day goes on.
 */
export function buildRiderHistory(riderId: string, now: number): DeliveryJob[] {
  const context = contextFor(riderId);
  if (!context) return [];
  const { rider, zone } = context;

  const pool = vendorsForZone(zone);
  const rand = mulberry32(hashSeed(`history:${riderId}`));

  const clock = new Date(now);
  const todayMidnight = now - (clock.getHours() * 60 + clock.getMinutes()) * MIN;

  const jobs: DeliveryJob[] = [];

  for (let day = 0; day < TRIPS_PER_DAY.length; day++) {
    for (let i = 0; i < TRIPS_PER_DAY[day]; i++) {
      const hour = pick(HOUR_POOL, rand);
      const minute = Math.floor(rand() * 60);
      const placedMs = todayMidnight - day * DAY + (hour * 60 + minute) * MIN;

      // One trip in five is a batch of two nearby orders.
      const orderCount = rand() < 0.2 && pool.length > 1 ? 2 : 1;
      const job = buildJob({ rider, zone, pool, rand, placedMs, orderCount });
      if (!job) continue;

      const acceptedMs = placedMs + MIN;
      const completedMs = acceptedMs + job.estimatedMinutes * MIN;
      // Not yet finished (or not yet started) — it is not history.
      if (completedMs > now) continue;

      jobs.push({
        ...job,
        riderId,
        status: "delivered",
        acceptedAt: new Date(acceptedMs).toISOString(),
        completedAt: new Date(completedMs).toISOString(),
        updatedAt: new Date(completedMs).toISOString(),
        completedStopIds: job.stops.map((s) => s.id),
      });
    }
  }

  return jobs.sort(
    (a, b) => Date.parse(b.completedAt ?? b.offeredAt) - Date.parse(a.completedAt ?? a.offeredAt),
  );
}

/**
 * The end-of-shift cash hand-ins that go with a history.
 *
 * A rider carries cash orders on the doorstep and settles up at a drop point
 * when the shift ends — so yesterday's collections are *not* still in their bag.
 * Rather than pretend otherwise (which would show a rider tens of thousands of
 * taka over their zone limit), each past day's collections are closed out with a
 * remittance stamped that evening. Today's cash is deliberately left outstanding:
 * that is the balance the wallet screen asks the rider to hand in, and the reason
 * the limit can actually be hit.
 */
export function buildRiderRemittances(
  riderId: string,
  jobs: DeliveryJob[],
  now: number,
): RiderRemittance[] {
  const today = toDateKey(new Date(now));
  const byDate = new Map<string, number>();

  for (const job of jobs) {
    if (job.status !== "delivered" || job.cashToCollect === 0) continue;
    const date = toDateKey(new Date(job.completedAt ?? job.offeredAt));
    if (date === today) continue; // still in the rider's bag
    byDate.set(date, (byDate.get(date) ?? 0) + job.cashToCollect);
  }

  const zone = zoneById.get(riderById.get(riderId)?.zoneId ?? "");

  return [...byDate.entries()]
    .map(([date, amount]) => {
      const settled = fromDateKey(date);
      settled.setHours(23, 0, 0, 0);
      const iso = settled.toISOString();
      return {
        id: `rmt_${riderId}_${date}`,
        createdAt: iso,
        updatedAt: iso,
        deletedAt: null,
        riderId,
        amount,
        currency: zone?.currency ?? "BDT",
        method: "agent" as const,
        reference: `RMT-${hashSeed(`${riderId}:${date}`).toString(36).toUpperCase().slice(-6)}`,
        occurredAt: iso,
      };
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

/**
 * The trips on offer to a rider right now.
 *
 * Offers are seeded by a five-minute *bucket* rather than the exact clock: they
 * stay put while a rider looks at them (ids included, so accepting one is not a
 * race against a re-render), then the pool turns over. The second offer is always
 * a batch where the zone has more than one kitchen, so the batching flow is
 * always there to be tried.
 */
export function buildJobOffers(riderId: string, now: number): DeliveryJob[] {
  const context = contextFor(riderId);
  if (!context) return [];
  const { rider, zone } = context;

  const pool = vendorsForZone(zone);
  const bucket = Math.floor(now / OFFER_WINDOW_MS);
  const bucketStart = bucket * OFFER_WINDOW_MS;
  const rand = mulberry32(hashSeed(`offers:${riderId}:${bucket}`));

  const count = 2 + Math.floor(rand() * 3);
  const jobs: DeliveryJob[] = [];

  for (let i = 0; i < count; i++) {
    // Staggered *backwards* from the bucket edge: every offer is already in the
    // past whatever the moment inside the window, so its id (which is derived
    // from this timestamp) does not move under a re-render.
    const placedMs = bucketStart - i * 37_000;
    const orderCount = i === 1 && pool.length > 1 ? 2 : 1;
    const job = buildJob({ rider, zone, pool, rand, placedMs, orderCount });
    if (job) jobs.push(job);
  }

  return jobs.sort((a, b) => b.payout.total - a.payout.total);
}
