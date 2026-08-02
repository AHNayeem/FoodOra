import {
  bookableVendorIds,
  bookingPolicyByVendor,
  buildVendorReservations,
  cuisineById,
  tablesByVendor,
  vendorById,
  vendorBySlug,
} from "@/frontend/lib/mock";
import type {
  BookingPolicy,
  Cuisine,
  DayAvailability,
  OccasionType,
  Reservation,
  ReservationDaySummary,
  ReservationGuest,
  ReservationStatus,
  RestaurantTable,
  TableStatus,
  Vendor,
} from "@/frontend/types";
import { addDays, toDateKey, toMinutes } from "@/frontend/lib/dates";
import {
  allocateTables,
  bookableTables,
  buildFloorStatus,
  canCancelReservation,
  dayAvailability,
  depositFor,
  effectiveReservationStatus,
  partySizeError,
  summariseDay,
  tablesBusyAt,
  turnMinutesFor,
} from "@/frontend/lib/reservations";
import { mockDelay, ok, paginate, type Paginated, type Result } from "./http";

/**
 * reservations.ts — read + write API for table booking (Phase C16).
 *
 * The seam owns the rules. Availability is recomputed here at booking time from
 * the same `lib/reservations` arithmetic the grid used, so a table cannot be
 * double-sold by a stale page, and a cancellation past the venue's cutoff is
 * refused here rather than by a disabled button. The UI is free to render
 * whatever it likes; it cannot talk this layer into an invalid booking.
 *
 * One prototype-specific wrinkle, stated plainly: the venue's book is
 * *synthesised* per request (`buildVendorReservations`), and bookings the guest
 * made in this browser live in a persisted store the seam cannot read. Callers
 * therefore pass their local records in as `BookContext.extra`, and the venue's
 * own status changes as `BookContext.overrides`. A real backend has both in the
 * database and would simply drop the parameter — every signature above it stays
 * the same.
 */

/**
 * Client-held records the seam cannot see for itself. Purely an artefact of
 * having no backend; see the note above.
 */
export interface BookContext {
  /** Bookings made in this browser, from `stores/reservations`. */
  extra?: Reservation[];
  /** Status changes the venue made in this browser, keyed by reservation id. */
  overrides?: Record<string, ReservationStatus>;
}

/** The venue's full book for a date range: synthesised + local, deduped. */
function resolveBook(vendorId: string, now: Date, ctx: BookContext = {}): Reservation[] {
  const synthesised = buildVendorReservations(vendorId, now);
  const local = (ctx.extra ?? []).filter((r) => r.venue.id === vendorId);
  const seen = new Set(local.map((r) => r.id));
  const merged = [...local, ...synthesised.filter((r) => !seen.has(r.id))];
  if (!ctx.overrides) return merged;
  return merged.map((r) =>
    ctx.overrides?.[r.id] ? { ...r, status: ctx.overrides[r.id] } : r,
  );
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

export interface BookableVenueQuery {
  search?: string;
  /** Only venues that seat this party. */
  partySize?: number;
  sort?: "recommended" | "rating" | "price-low" | "party-large";
  page?: number;
  pageSize?: number;
}

/** True when this venue takes table bookings at all. */
export function isBookable(vendorId: string): boolean {
  return Boolean(bookingPolicyByVendor[vendorId]);
}

export async function getBookableVenues(
  query: BookableVenueQuery = {},
): Promise<Paginated<Vendor>> {
  let list = bookableVendorIds
    .map((id) => vendorById.get(id))
    .filter((v): v is Vendor => Boolean(v) && !v!.deletedAt);

  if (query.partySize) {
    list = list.filter(
      (v) => (bookingPolicyByVendor[v.id]?.maxPartySize ?? 0) >= query.partySize!,
    );
  }
  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(
      (v) => v.name.toLowerCase().includes(q) || v.tagline.toLowerCase().includes(q),
    );
  }

  switch (query.sort) {
    case "rating":
      list = [...list].sort((a, b) => b.rating - a.rating);
      break;
    case "price-low":
      list = [...list].sort((a, b) => a.priceLevel - b.priceLevel);
      break;
    case "party-large":
      list = [...list].sort(
        (a, b) =>
          (bookingPolicyByVendor[b.id]?.maxPartySize ?? 0) -
          (bookingPolicyByVendor[a.id]?.maxPartySize ?? 0),
      );
      break;
    default:
      list = [...list].sort(
        (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating,
      );
  }

  return mockDelay(paginate(list, query.page, query.pageSize));
}

/** Slugs for `generateStaticParams` — synchronous, build-time only. */
export function getBookableVenueSlugs(): string[] {
  return bookableVendorIds
    .map((id) => vendorById.get(id)?.slug)
    .filter((s): s is string => Boolean(s));
}

export async function getBookingPolicy(vendorId: string): Promise<BookingPolicy | null> {
  return mockDelay(bookingPolicyByVendor[vendorId] ?? null, 150);
}

/**
 * Every venue's policy, keyed by vendor id. The pages that render bookings the
 * guest already holds (the confirmation page, the account list) need the
 * cancellation window for whichever venues happen to be in that browser's
 * store, which they cannot know server-side — so they take the lot.
 */
export async function getBookingPolicies(): Promise<Record<string, BookingPolicy>> {
  return mockDelay({ ...bookingPolicyByVendor }, 150);
}

/** The venue's bookable floor plan (zones the policy holds back are excluded). */
export async function getBookableTables(vendorId: string): Promise<RestaurantTable[]> {
  const policy = bookingPolicyByVendor[vendorId];
  if (!policy) return mockDelay([], 150);
  return mockDelay(bookableTables(tablesByVendor[vendorId] ?? [], policy), 150);
}

/** Everything the booking page needs about a venue, resolved in one call. */
export interface VenueBooking {
  vendor: Vendor;
  policy: BookingPolicy;
  tables: RestaurantTable[];
  cuisines: Cuisine[];
}

export async function getVenueBooking(slug: string): Promise<VenueBooking | null> {
  const vendor = vendorBySlug.get(slug);
  if (!vendor || vendor.deletedAt) return mockDelay(null);
  const policy = bookingPolicyByVendor[vendor.id];
  if (!policy) return mockDelay(null);
  return mockDelay({
    vendor,
    policy,
    tables: bookableTables(tablesByVendor[vendor.id] ?? [], policy),
    cuisines: vendor.cuisineIds
      .map((id) => cuisineById.get(id))
      .filter((c): c is Cuisine => Boolean(c)),
  });
}

/** Venues near this one that also take bookings — the "try instead" rail. */
export async function getAlternativeVenues(vendorId: string, limit = 3): Promise<Vendor[]> {
  const list = bookableVendorIds
    .filter((id) => id !== vendorId)
    .map((id) => vendorById.get(id))
    .filter((v): v is Vendor => Boolean(v))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return mockDelay(list, 200);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface AvailabilityQuery {
  vendorId: string;
  /** Plain "YYYY-MM-DD". */
  date: string;
  partySize: number;
  /** Always supplied by the caller; the seam never reads the clock itself. */
  now: Date;
  ctx?: BookContext;
}

/**
 * One day's grid for one party size. Returns a `Result` because "you cannot
 * ask that" (party too large, date beyond the calendar) is a different answer
 * from "nothing is free" — the UI needs to say which.
 */
export async function getAvailability(
  query: AvailabilityQuery,
): Promise<Result<DayAvailability>> {
  const { vendorId, date, partySize, now, ctx } = query;
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return mockDelay({ data: null, error: "errors.notBookable" });

  const sizeError = partySizeError(policy, partySize);
  if (sizeError) return mockDelay({ data: null, error: `errors.${sizeError}` });

  const today = toDateKey(now);
  if (date < today) return mockDelay({ data: null, error: "errors.dateInPast" });
  if (date > toDateKey(addDays(now, policy.advanceDays))) {
    return mockDelay({ data: null, error: "errors.dateTooFar" });
  }

  return mockDelay(
    ok(
      dayAvailability({
        hours: vendor.hours,
        date,
        tables: bookableTables(tablesByVendor[vendorId] ?? [], policy),
        reservations: resolveBook(vendorId, now, ctx),
        policy,
        partySize,
        now,
      }),
    ),
  );
}

/** One day in the date rail: is there anything at all, and when. */
export interface DayOutlook {
  date: string;
  closed: boolean;
  /** Bookable times on that day. */
  openSlots: number;
  firstAvailable: string | null;
}

/**
 * A short forward look, for the date rail and the "next available" nudge when
 * the chosen evening is full. Computed with the same engine, so the rail and
 * the grid can never disagree.
 */
export async function getAvailabilityOutlook({
  vendorId,
  from,
  days,
  partySize,
  now,
  ctx,
}: {
  vendorId: string;
  from: string;
  days: number;
  partySize: number;
  now: Date;
  ctx?: BookContext;
}): Promise<DayOutlook[]> {
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return mockDelay([], 150);

  const tables = bookableTables(tablesByVendor[vendorId] ?? [], policy);
  const book = resolveBook(vendorId, now, ctx);
  const size = Math.min(Math.max(partySize, policy.minPartySize), policy.maxPartySize);
  const start = new Date(`${from}T00:00:00`);
  const horizon = toDateKey(addDays(now, policy.advanceDays));

  const out: DayOutlook[] = [];
  for (let i = 0; i < days; i++) {
    const date = toDateKey(addDays(start, i));
    if (date > horizon) break;
    const day = dayAvailability({
      hours: vendor.hours,
      date,
      tables,
      reservations: book,
      policy,
      partySize: size,
      now,
    });
    out.push({
      date,
      closed: day.closed,
      openSlots: day.slots.filter((s) => s.available).length,
      firstAvailable: day.firstAvailable,
    });
  }
  return mockDelay(out, 200);
}

/** The next few bookable times at a venue — the directory card's teaser. */
export async function getNextAvailableTimes({
  vendorId,
  partySize,
  now,
  limit = 4,
  ctx,
}: {
  vendorId: string;
  partySize: number;
  now: Date;
  limit?: number;
  ctx?: BookContext;
}): Promise<{ date: string; times: string[] } | null> {
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return mockDelay(null, 200);

  const tables = bookableTables(tablesByVendor[vendorId] ?? [], policy);
  const book = resolveBook(vendorId, now, ctx);
  const size = Math.min(Math.max(partySize, policy.minPartySize), policy.maxPartySize);

  for (let i = 0; i <= Math.min(policy.advanceDays, 7); i++) {
    const date = toDateKey(addDays(now, i));
    const day = dayAvailability({
      hours: vendor.hours,
      date,
      tables,
      reservations: book,
      policy,
      partySize: size,
      now,
    });
    const times = day.slots.filter((s) => s.available).map((s) => s.time);
    if (times.length === 0) continue;
    // Prefer the evening — that is the table people are actually after.
    const evening = times.filter((t) => toMinutes(t) >= 18 * 60);
    const shown = (evening.length >= limit ? evening : times).slice(0, limit);
    return mockDelay({ date, times: shown }, 250);
  }
  return mockDelay(null, 250);
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/** 6-char booking reference, e.g. "RSV-8F3A21", derived from a timestamp. */
function referenceFrom(ms: number): string {
  return `RSV-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

export interface CreateReservationInput {
  vendorId: string;
  userId: string | null;
  date: string;
  time: string;
  partySize: number;
  occasion: OccasionType;
  guest: ReservationGuest;
  notes: string | null;
  now: Date;
  ctx?: BookContext;
}

/**
 * Take a booking.
 *
 * The grid the guest was looking at may be minutes old, so availability is
 * recomputed here and the table allocated at this moment — the same check, run
 * again at the point it actually matters. A venue that reviews requests gets a
 * `pending` booking; everywhere else it is confirmed on the spot. No payment is
 * taken: a deposit is recorded as an amount the venue *would* hold.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<Result<Reservation>> {
  const { vendorId, date, time, partySize, now, ctx } = input;
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return mockDelay({ data: null, error: "errors.notBookable" });

  if (!input.guest.name.trim()) return mockDelay({ data: null, error: "errors.nameRequired" });
  if (!input.guest.phone.trim()) return mockDelay({ data: null, error: "errors.phoneRequired" });

  const sizeError = partySizeError(policy, partySize);
  if (sizeError) return mockDelay({ data: null, error: `errors.${sizeError}` });
  if (!time) return mockDelay({ data: null, error: "errors.timeRequired" });

  const start = new Date(`${date}T${time}:00`);
  if (start.getTime() - now.getTime() < policy.leadTimeMinutes * 60_000) {
    return mockDelay({ data: null, error: "errors.tooSoon" });
  }
  if (date > toDateKey(addDays(now, policy.advanceDays))) {
    return mockDelay({ data: null, error: "errors.dateTooFar" });
  }

  // Re-check against the book as it stands right now, then seat the party.
  const tables = bookableTables(tablesByVendor[vendorId] ?? [], policy);
  const duration = turnMinutesFor(policy, partySize);
  const startMin = toMinutes(time);
  const busy = tablesBusyAt(resolveBook(vendorId, now, ctx), date, startMin, startMin + duration);
  const seated = allocateTables(tables, busy, partySize);
  if (!seated) return mockDelay({ data: null, error: "errors.timeUnavailable" });

  const stamp = now.toISOString();
  const status: ReservationStatus = policy.autoConfirm ? "confirmed" : "pending";

  const reservation: Reservation = {
    id: `rsv_${now.getTime().toString(36)}`,
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
    reference: referenceFrom(now.getTime()),
    userId: input.userId,
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
    time,
    durationMinutes: duration,
    partySize,
    tableIds: seated.map((t) => t.id),
    tableLabels: seated.map((t) => t.label),
    zone: seated[0].zone,
    occasion: input.occasion,
    guest: {
      name: input.guest.name.trim(),
      phone: input.guest.phone.trim(),
      email: input.guest.email.trim(),
    },
    notes: input.notes?.trim() || null,
    status,
    depositAmount: depositFor(policy, partySize),
    currency: vendor.currency,
    confirmedAt: status === "confirmed" ? stamp : null,
    seatedAt: null,
    cancelledAt: null,
  };

  return mockDelay(ok(reservation), 700);
}

/**
 * Cancel a booking. The venue's free-cancellation window is enforced here, not
 * by whichever button happened to be rendered — same rule as C15's skip cutoff.
 */
export async function cancelReservation(
  reservation: Reservation,
  now: Date,
): Promise<Result<Reservation>> {
  const policy = bookingPolicyByVendor[reservation.venue.id];
  const cutoff = policy?.cancelCutoffHours ?? 0;
  if (!canCancelReservation(reservation, now, cutoff)) {
    return mockDelay({ data: null, error: "errors.notCancellable" });
  }
  const stamp = now.toISOString();
  return mockDelay(
    ok({ ...reservation, status: "cancelled", cancelledAt: stamp, updatedAt: stamp }),
    500,
  );
}

// ---------------------------------------------------------------------------
// The venue's book (dashboard)
// ---------------------------------------------------------------------------

/** One service day as the floor sees it. */
export interface VendorBook {
  date: string;
  reservations: Reservation[];
  summary: ReservationDaySummary;
  floor: TableStatus[];
  policy: BookingPolicy;
}

export async function getVendorBook({
  vendorId,
  date,
  now,
  ctx,
}: {
  vendorId: string;
  date: string;
  now: Date;
  ctx?: BookContext;
}): Promise<VendorBook | null> {
  const vendor = vendorById.get(vendorId);
  const policy = bookingPolicyByVendor[vendorId];
  if (!vendor || !policy) return mockDelay(null, 250);

  const tables = bookableTables(tablesByVendor[vendorId] ?? [], policy);
  const book = resolveBook(vendorId, now, ctx);
  const forDate = book
    .filter((r) => r.date === date)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  return mockDelay({
    date,
    reservations: forDate,
    summary: summariseDay(book, tables, vendor.hours, date, now),
    // The floor view only means anything for today; other dates show the plan.
    floor: buildFloorStatus(tables, book, date === toDateKey(now) ? now : new Date(`${date}T20:00:00`)),
    policy,
  });
}

/** Which status changes the floor is allowed to make, from each state. */
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["seated", "cancelled", "no-show"],
  seated: ["completed"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

/**
 * Move a booking through the service. The transition table is enforced here so
 * a stale board cannot seat a cancelled party; note it is checked against the
 * *derived* status, since a booking whose sitting has already elapsed is no
 * longer confirmable even though the stored value still says so.
 */
export async function setReservationStatus(
  reservation: Reservation,
  next: ReservationStatus,
  now: Date,
): Promise<Result<Reservation>> {
  const current = effectiveReservationStatus(reservation, now);
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return mockDelay({ data: null, error: "errors.badTransition" });
  }
  const stamp = now.toISOString();
  return mockDelay(
    ok({
      ...reservation,
      status: next,
      updatedAt: stamp,
      confirmedAt: next === "confirmed" ? stamp : reservation.confirmedAt,
      seatedAt: next === "seated" ? stamp : reservation.seatedAt,
      cancelledAt: next === "cancelled" ? stamp : reservation.cancelledAt,
    }),
    350,
  );
}

/** Venue names for a set of vendor ids — keeps pages off `lib/mock`. */
export async function getVenueNames(ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const id of ids) {
    const name = vendorById.get(id)?.name;
    if (name) map[id] = name;
  }
  return mockDelay(map, 100);
}

/** Total bookable venues, for directory copy. */
export function bookableVenueCount(): number {
  return bookableVendorIds.filter((id) => !vendorById.get(id)?.deletedAt).length;
}

/** Cuisine names for the directory cards (FK lookup, kept behind the seam). */
export async function getVenueCuisines(vendor: Vendor): Promise<Cuisine[]> {
  return mockDelay(
    vendor.cuisineIds
      .map((id) => cuisineById.get(id))
      .filter((c): c is Cuisine => Boolean(c)),
    100,
  );
}
