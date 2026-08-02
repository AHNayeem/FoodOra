import type {
  BookingPolicy,
  OccasionType,
  Reservation,
  ReservationStatus,
} from "@/frontend/types";
import { addDays, fromDateKey, toDateKey, toMinutes, weekdayOf } from "@/frontend/lib/dates";
import { allocateTables, bookableTables, tablesBusyAt, turnMinutesFor } from "@/frontend/lib/reservations";
import { SEED_NOW } from "./cuisines";
import { hashSeed, mulberry32, pick } from "./rng";
import { tablesByVendor } from "./tables";
import { vendorById } from "./vendors";

/**
 * reservations.ts — booking policies per venue, plus the book itself.
 *
 * Two very different kinds of data live here.
 *
 * **Policies are seed.** They are venue configuration a real admin would edit:
 * how long a table is held, how tight the grid runs, how far ahead the calendar
 * opens, which zones sell online, what deposit a large party holds. They differ
 * on purpose — a sushi counter turning tables in 75 minutes on a 15-minute grid
 * behaves nothing like a rooftop trattoria, and none of that difference is
 * allowed to live in a component.
 *
 * **The book is synthesised.** There is no backend, so "the bookings already
 * taken at this venue" are produced by `buildVendorReservations(vendorId, now)`
 * — the same deterministic-PRNG-anchored-to-`now` factory pattern as C10's
 * vendor orders. Two properties matter and are worth stating plainly:
 *
 *  1. It is *deterministic*: same venue, same day, same book. Availability does
 *     not shimmer between two renders of the same page.
 *  2. It is *internally valid*: every synthesised booking is seated through the
 *     real `allocateTables`, against the bookings already placed that day. The
 *     book therefore never double-books a table, so the availability grid
 *     derived from it is arithmetic on coherent data rather than decoration.
 *
 * The module itself never reads the clock; `services/reservations.ts` passes it
 * in, keeping module evaluation deterministic.
 */

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * Booking policies, one per sit-down venue with a floor plan.
 *
 * `maxPartySize` is never larger than what the bookable zones can physically
 * seat — a party is allowed across at most two tables in one zone, so e.g.
 * Sakura tops out at 6 (its private room) rather than an aspirational 8.
 */
export const bookingPolicies: BookingPolicy[] = [
  {
    ...base,
    id: "bpol_bella_napoli",
    vendorId: "ven_bella_napoli",
    turnMinutes: 90,
    largePartyTurnMinutes: 120,
    largePartyFrom: 6,
    slotMinutes: 30,
    minPartySize: 1,
    maxPartySize: 10,
    lastSeatingBeforeClose: 60,
    leadTimeMinutes: 60,
    advanceDays: 30,
    // The private room is held back for events — it sells through catering.
    bookableZones: ["indoor", "rooftop"],
    depositPerGuest: 0,
    depositFrom: 0,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 2,
    autoConfirm: true,
    note: "Rooftop tables are weather permitting — we'll move you inside if it rains.",
  },
  {
    ...base,
    id: "bpol_sakura_sushi",
    vendorId: "ven_sakura_sushi",
    // A counter turns faster and is booked on a tighter grid.
    turnMinutes: 75,
    largePartyTurnMinutes: 105,
    largePartyFrom: 5,
    slotMinutes: 15,
    minPartySize: 1,
    maxPartySize: 6,
    lastSeatingBeforeClose: 45,
    leadTimeMinutes: 120,
    advanceDays: 21,
    bookableZones: ["indoor", "private"],
    depositPerGuest: 500,
    depositFrom: 5,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 24,
    autoConfirm: true,
    note: "Counter seats are omakase only. Parties of five or more hold a deposit per guest.",
  },
  {
    ...base,
    id: "bpol_spice_route",
    vendorId: "ven_spice_route",
    turnMinutes: 90,
    largePartyTurnMinutes: 135,
    largePartyFrom: 6,
    slotMinutes: 30,
    minPartySize: 1,
    maxPartySize: 10,
    lastSeatingBeforeClose: 60,
    leadTimeMinutes: 90,
    advanceDays: 30,
    bookableZones: ["indoor", "outdoor"],
    depositPerGuest: 0,
    depositFrom: 0,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 4,
    // This kitchen reviews every request rather than auto-confirming.
    autoConfirm: false,
    note: "Requests are confirmed by the floor manager, usually within the hour.",
  },
  {
    ...base,
    id: "bpol_bangkok_house",
    vendorId: "ven_bangkok_house",
    turnMinutes: 90,
    largePartyTurnMinutes: 120,
    largePartyFrom: 6,
    slotMinutes: 30,
    minPartySize: 1,
    maxPartySize: 10,
    lastSeatingBeforeClose: 45,
    leadTimeMinutes: 60,
    advanceDays: 21,
    bookableZones: ["indoor"],
    depositPerGuest: 0,
    depositFrom: 0,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 2,
    autoConfirm: true,
    note: null,
  },
  {
    ...base,
    id: "bpol_the_daily_grind",
    vendorId: "ven_the_daily_grind",
    // Cafes turn quickly and take same-hour bookings.
    turnMinutes: 60,
    largePartyTurnMinutes: 90,
    largePartyFrom: 5,
    slotMinutes: 30,
    minPartySize: 1,
    maxPartySize: 6,
    lastSeatingBeforeClose: 30,
    leadTimeMinutes: 30,
    advanceDays: 14,
    bookableZones: ["indoor", "outdoor"],
    depositPerGuest: 0,
    depositFrom: 0,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 1,
    autoConfirm: true,
    note: "We hold tables for 15 minutes past your slot before releasing them.",
  },
  {
    ...base,
    id: "bpol_sugar_spoon",
    vendorId: "ven_sugar_spoon",
    turnMinutes: 60,
    largePartyTurnMinutes: 90,
    largePartyFrom: 5,
    slotMinutes: 30,
    minPartySize: 1,
    maxPartySize: 6,
    lastSeatingBeforeClose: 30,
    leadTimeMinutes: 45,
    advanceDays: 14,
    bookableZones: ["indoor"],
    depositPerGuest: 0,
    depositFrom: 0,
    currency: "BDT",
    countryCode: "BD",
    cancelCutoffHours: 2,
    autoConfirm: true,
    note: "Celebration cakes need 24 hours' notice — leave us a note and we'll call.",
  },
];

export const bookingPolicyByVendor: Record<string, BookingPolicy> = Object.fromEntries(
  bookingPolicies.map((p) => [p.vendorId, p]),
);

/** Vendor ids that take table bookings, in seed order. */
export const bookableVendorIds: string[] = bookingPolicies.map((p) => p.vendorId);

// ---------------------------------------------------------------------------
// The synthesised book
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** How much history the book keeps, and how far forward it is populated. */
const PAST_DAYS = 7;
const FUTURE_DAYS = 21;

/** Party sizes, repeated by how often they actually walk in. */
const PARTY_POOL = [2, 2, 2, 2, 2, 3, 3, 4, 4, 4, 5, 6, 6, 8];

/**
 * Hours sampled for a booking start, repeated to create the real shape of a
 * service: a lunch bump and a much heavier dinner peak.
 */
const RESTAURANT_HOURS = [
  12, 12, 13, 13, 13, 14, 17, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 22,
];
/** Cafes peak mid-morning and again after work. */
const CAFE_HOURS = [9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 18, 19];

/**
 * How hard a venue is to book, from what the catalog already says about it.
 * A trending, top-rated, featured restaurant should have a contested Friday
 * evening; a quieter one should not. Reusing rating/trending/featured keeps
 * demand consistent with how the venue is presented everywhere else, instead
 * of being a second, invented popularity number.
 */
function demandFactor(rating: number, isTrending: boolean, isFeatured: boolean): number {
  return 1 + (rating - 4.5) * 0.6 + (isTrending ? 0.25 : 0) + (isFeatured ? 0.15 : 0);
}

/** Busier at the weekend — Friday and Saturday in the Dhaka week. */
const DOW_FACTOR: Record<string, number> = {
  mon: 0.7,
  tue: 0.7,
  wed: 0.8,
  thu: 1.0,
  fri: 1.35,
  sat: 1.3,
  sun: 0.85,
};

const GUEST_NAMES = [
  "Ayesha Rahman", "Imran Chowdhury", "Nabila Karim", "Farhan Ahmed",
  "Sadia Islam", "Rafiq Uddin", "Tasnim Haque", "Zayan Malik",
  "Mitu Akter", "Shakib Alam", "Rima Sultana", "Arif Hasan",
  "Nusaiba Noor", "Hasib Rahman", "Lamia Chowdhury", "Omar Faruk",
  "Prantik Saha", "Jarin Tasnim", "Mahfuz Anam", "Sharmin Akhter",
];

/** Occasions, weighted so most tables are just dinner. */
const OCCASION_POOL: OccasionType[] = [
  "none", "none", "none", "none", "none", "none", "none", "none",
  "birthday", "birthday", "anniversary", "date", "business", "celebration",
];

/** Guest notes that read like the ones a floor manager actually gets. */
const NOTE_POOL: (string | null)[] = [
  null, null, null, null, null,
  "One high chair please.",
  "Celebrating — a candle on the dessert would be lovely.",
  "Nut allergy at the table.",
  "Quiet corner if you have one.",
  "We may be ten minutes late.",
  "Wheelchair access needed.",
];

/** 6-char booking reference, derived from a stable hash (never the clock). */
function referenceFrom(key: string): string {
  return `RSV-${hashSeed(key).toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/**
 * Status of a synthesised booking, from where it sits relative to `now`.
 *
 * The past is settled history: mostly completed, with the occasional no-show
 * and cancellation a real book always carries. Anything still ahead is simply
 * on the book — `confirmed`, or `pending` at venues that review requests. The
 * *displayed* status is derived later by `effectiveReservationStatus`; this is
 * only what the venue would have written down.
 */
function seedStatus(
  startMs: number,
  endMs: number,
  nowMs: number,
  autoConfirm: boolean,
  rand: () => number,
): ReservationStatus {
  if (endMs <= nowMs) {
    const roll = rand();
    if (roll < 0.06) return "no-show";
    if (roll < 0.12) return "cancelled";
    return "completed";
  }
  if (startMs <= nowMs) return "seated";
  if (!autoConfirm && rand() < 0.45) return "pending";
  return "confirmed";
}

/**
 * Build one venue's book, anchored to `now`. Returns every booking from a week
 * back to three weeks ahead, sorted by start time.
 */
export function buildVendorReservations(vendorId: string, now: Date): Reservation[] {
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return [];

  const tables = bookableTables(tablesByVendor[vendorId] ?? [], policy);
  if (tables.length === 0) return [];

  const hourPool = vendor.type === "cafe" ? CAFE_HOURS : RESTAURANT_HOURS;
  const demand = demandFactor(vendor.rating, vendor.isTrending, vendor.isFeatured);
  const nowMs = now.getTime();
  const out: Reservation[] = [];

  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
    const date = toDateKey(addDays(now, offset));
    const weekday = weekdayOf(fromDateKey(date));
    const hours = vendor.hours[weekday];
    if (!hours.open || !hours.close) continue;

    const openMin = toMinutes(hours.open);
    const closeRaw = toMinutes(hours.close);
    const closeMin = closeRaw <= openMin ? closeRaw + 1440 : closeRaw;
    const lastSeating = closeMin - policy.lastSeatingBeforeClose;
    const midnight = fromDateKey(date).getTime();

    const rand = mulberry32(hashSeed(`${vendorId}:${date}`));

    // Aim at a *fill rate*, not a booking count. How many sittings a day holds
    // depends on both floor size and turn time, so a raw count would leave a
    // three-table dessert bar deserted while jamming a trattoria solid. Filling
    // a share of each venue's own capacity makes them comparably busy — and
    // because arrivals cluster at peak, a day at ~40% overall is still a
    // contested evening, which is the state worth showing.
    const sittingsPerTable = Math.max(1, Math.floor((closeMin - openMin) / policy.turnMinutes));
    const capacity = tables.length * sittingsPerTable;
    const fillRate = Math.min(0.6, 0.2 * DOW_FACTOR[weekday] * demand);
    const target = Math.max(1, Math.round(capacity * fillRate));
    const placed: Reservation[] = [];

    // Over-attempt and stop at the target: attempts land at random times, and
    // the ones that cannot be seated are simply lost requests.
    for (let i = 0; i < target * 3 && placed.length < target; i++) {
      const partySize = Math.min(pick(PARTY_POOL, rand), policy.maxPartySize);
      const hour = pick(hourPool, rand);
      const minute = Math.floor(rand() * (60 / policy.slotMinutes)) * policy.slotMinutes;
      const startMin = hour * 60 + minute;
      if (startMin < openMin || startMin > lastSeating) continue;

      const duration = Math.min(turnMinutesFor(policy, partySize), closeMin - startMin);
      // Seat it exactly the way a real booking would be seated — against the
      // bookings already on the book for that day.
      const busy = tablesBusyAt(placed, date, startMin, startMin + duration);
      const seated = allocateTables(tables, busy, partySize);
      if (!seated) continue; // Floor full at that time; the request is lost.

      const startMs = midnight + startMin * 60_000;
      const endMs = startMs + duration * 60_000;
      const status = seedStatus(startMs, endMs, nowMs, policy.autoConfirm, rand);
      const bookedAt = new Date(startMs - Math.ceil(1 + rand() * 9) * DAY).toISOString();
      const key = `${vendorId}:${date}:${i}`;
      const short = vendorId.replace(/^ven_/, "");

      placed.push({
        id: `rsv_${short}_${date.replace(/-/g, "")}_${i}`,
        createdAt: bookedAt,
        updatedAt: bookedAt,
        deletedAt: null,
        reference: referenceFrom(key),
        userId: null,
        venue: {
          id: vendor.id,
          slug: vendor.slug,
          name: vendor.name,
          image: vendor.cover,
          address: vendor.location.address,
          city: vendor.location.city,
          countryCode: vendor.location.countryCode,
          currency: vendor.currency,
        },
        date,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        durationMinutes: duration,
        partySize,
        tableIds: seated.map((t) => t.id),
        tableLabels: seated.map((t) => t.label),
        zone: seated[0].zone,
        occasion: pick(OCCASION_POOL, rand),
        guest: {
          name: pick(GUEST_NAMES, rand),
          phone: `+8801${Math.floor(700000000 + rand() * 99999999)}`,
          email: "guest@example.com",
        },
        notes: pick(NOTE_POOL, rand),
        status,
        depositAmount:
          partySize >= policy.depositFrom && policy.depositPerGuest > 0
            ? policy.depositPerGuest * partySize
            : 0,
        currency: vendor.currency,
        confirmedAt: status === "pending" ? null : bookedAt,
        seatedAt: status === "seated" || status === "completed" ? new Date(startMs).toISOString() : null,
        cancelledAt: status === "cancelled" ? bookedAt : null,
      });
    }

    out.push(...placed);
  }

  return out.sort(
    (a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
}
