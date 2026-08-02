import type {
  BookingPolicy,
  DayAvailability,
  OccasionType,
  Reservation,
  ReservationDaySummary,
  ReservationStatus,
  RestaurantTable,
  TableStatus,
  TableZone,
  TimeSlot,
  SlotBlockReason,
  WeeklyHours,
} from "@/frontend/types";
import { atTime, fromMinutes, toDateKey, toMinutes, weekdayOf } from "./dates";

/**
 * reservations.ts — the pure availability engine (Phase C16).
 *
 * A table is a finite resource held for a stretch of time, so booking is an
 * *overlap* problem, not a price calculation: to answer "is 19:30 free for
 * four?" you have to know which tables are still unclaimed across 19:30 → the
 * end of that party's turn. Everything needed to answer it lives here and
 * nowhere else, and none of it reads the clock or touches state — `now` is
 * always passed in — so the grid the customer sees, the re-check the service
 * runs at booking time, and the floor view in the dashboard are all the same
 * arithmetic.
 *
 * Nothing about availability is stored. There is no slot table; there are
 * opening hours, a floor plan, a policy and the bookings already taken. This
 * follows C9 tracking / C12 rounds / C15 schedules, where derived-from-`now`
 * state has repeatedly proved cheaper and more honest than stored state.
 */

/** Occasions offered on the booking form, in display order. */
export const OCCASIONS = [
  "none",
  "birthday",
  "anniversary",
  "date",
  "business",
  "celebration",
] as const satisfies readonly OccasionType[];

/** Seating areas, in display order. */
export const TABLE_ZONES = [
  "indoor",
  "outdoor",
  "rooftop",
  "private",
] as const satisfies readonly TableZone[];

/** Party sizes offered as quick picks; larger goes through the stepper. */
export const PARTY_QUICK_PICKS = [2, 3, 4, 5, 6, 8] as const;

/** Statuses that still hold a table. Cancelled/no-show release it. */
const HOLDING_STATUSES: readonly ReservationStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "completed",
];

/** True while this booking still occupies its tables. */
export function holdsTable(reservation: Reservation): boolean {
  return HOLDING_STATUSES.includes(reservation.status);
}

export function isOccasion(value: string | undefined): value is OccasionType {
  return !!value && (OCCASIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Policy arithmetic
// ---------------------------------------------------------------------------

/**
 * How long this party holds a table. Big parties order more courses and leave
 * later, so venues budget a longer turn for them — the policy says from where.
 */
export function turnMinutesFor(policy: BookingPolicy, partySize: number): number {
  return partySize >= policy.largePartyFrom
    ? policy.largePartyTurnMinutes
    : policy.turnMinutes;
}

/** The hold deposit this party is asked for; 0 when the policy takes none. */
export function depositFor(policy: BookingPolicy, partySize: number): number {
  if (policy.depositPerGuest <= 0 || partySize < policy.depositFrom) return 0;
  return policy.depositPerGuest * partySize;
}

/** Tables a venue actually sells online — the policy can hold zones back. */
export function bookableTables(
  tables: RestaurantTable[],
  policy: BookingPolicy,
): RestaurantTable[] {
  return tables.filter((t) => !t.deletedAt && policy.bookableZones.includes(t.zone));
}

/** The largest party the floor can physically seat (best pair of tables). */
export function floorCapacity(tables: RestaurantTable[]): number {
  const seats = tables.map((t) => t.seats).sort((a, b) => b - a);
  return (seats[0] ?? 0) + (seats[1] ?? 0);
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** Half-open overlap: a booking ending exactly at 19:30 frees 19:30. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Table ids already claimed across [startMin, endMin) on `date`. Cancelled and
 * no-show bookings are not in here — a released table is genuinely free.
 */
export function tablesBusyAt(
  reservations: Reservation[],
  date: string,
  startMin: number,
  endMin: number,
): Set<string> {
  const busy = new Set<string>();
  for (const r of reservations) {
    if (r.date !== date || !holdsTable(r)) continue;
    const rStart = toMinutes(r.time);
    if (!overlaps(startMin, endMin, rStart, rStart + r.durationMinutes)) continue;
    for (const id of r.tableIds) busy.add(id);
  }
  return busy;
}

/**
 * Seat a party on the free tables, the way a floor manager would.
 *
 * **Best fit first**: the smallest single table that takes the party, so a
 * six-top is not burned on a couple while the evening still has sixes to seat.
 * Only when no single table fits does it join two — preferring tables in the
 * same zone (you cannot seat half a party on the roof) with the least wasted
 * seats. Returns `null` when the party cannot be seated at all.
 */
export function allocateTables(
  tables: RestaurantTable[],
  busy: Set<string>,
  partySize: number,
): RestaurantTable[] | null {
  const free = tables
    .filter((t) => !busy.has(t.id))
    .sort((a, b) => a.seats - b.seats || a.label.localeCompare(b.label));

  const single = free.find((t) => t.seats >= partySize);
  if (single) return [single];

  let best: [RestaurantTable, RestaurantTable] | null = null;
  let bestWaste = Infinity;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const b = free[j];
      if (a.zone !== b.zone) continue;
      const seats = a.seats + b.seats;
      if (seats < partySize) continue;
      const waste = seats - partySize;
      if (waste < bestWaste) {
        bestWaste = waste;
        best = [a, b];
      }
    }
  }
  return best;
}

/** How many distinct tables could still take this party at a given time. */
function tablesLeftFor(
  tables: RestaurantTable[],
  busy: Set<string>,
  partySize: number,
): number {
  return tables.filter((t) => !busy.has(t.id) && t.seats >= partySize).length;
}

// ---------------------------------------------------------------------------
// The booking grid
// ---------------------------------------------------------------------------

export interface BuildSlotsInput {
  /** The venue's opening hours — the outer bound on any booking. */
  hours: WeeklyHours;
  /** Service date, plain "YYYY-MM-DD". */
  date: string;
  /** The venue's bookable floor plan (already zone-filtered). */
  tables: RestaurantTable[];
  /** Bookings already on the book — any date; other dates are ignored. */
  reservations: Reservation[];
  policy: BookingPolicy;
  partySize: number;
  /** Always passed in; nothing here reads the clock. */
  now: Date;
}

/**
 * Derive one day's booking grid.
 *
 * Walks the venue's open window on the policy's grid and asks the only question
 * that matters at each step: *given everything already booked, can this party
 * be seated for a full turn starting here?* A time is unavailable for exactly
 * one of three reasons — it has passed (or is inside the lead time), the venue
 * is shut then (or it is past last seating), or every table that fits is taken.
 * Those reasons are returned, not swallowed, so the UI can say which it is.
 */
export function buildSlots({
  hours,
  date,
  tables,
  reservations,
  policy,
  partySize,
  now,
}: BuildSlotsInput): TimeSlot[] {
  const day = hours[weekdayOf(atTime(date, "12:00"))];
  if (!day.open || !day.close) return [];

  const openMin = toMinutes(day.open);
  // A close before the open means the venue trades past midnight (e.g. 23:59).
  const closeMinRaw = toMinutes(day.close);
  const closeMin = closeMinRaw <= openMin ? closeMinRaw + 1440 : closeMinRaw;
  const lastSeating = closeMin - policy.lastSeatingBeforeClose;

  const turn = turnMinutesFor(policy, partySize);
  const earliest = new Date(now.getTime() + policy.leadTimeMinutes * 60_000);
  const midnight = atTime(date, "00:00").getTime();
  /** Lead-time boundary expressed in the same minutes-since-midnight space. */
  const earliestMin = (earliest.getTime() - midnight) / 60_000;

  const slots: TimeSlot[] = [];
  for (let start = openMin; start <= lastSeating; start += policy.slotMinutes) {
    // A party may sit until closing, never past it.
    const end = Math.min(start + turn, closeMin);
    let reason: SlotBlockReason | null = null;
    let tablesLeft = 0;

    if (start < earliestMin) {
      reason = "too-soon";
    } else {
      const busy = tablesBusyAt(reservations, date, start, end);
      const seated = allocateTables(tables, busy, partySize);
      if (!seated) reason = "full";
      else tablesLeft = Math.max(1, tablesLeftFor(tables, busy, partySize));
    }

    slots.push({
      time: fromMinutes(start),
      available: reason === null,
      reason,
      tablesLeft,
    });
  }
  return slots;
}

/** The grid plus the day-level facts the booking form needs. */
export function dayAvailability(input: BuildSlotsInput): DayAvailability {
  const day = input.hours[weekdayOf(atTime(input.date, "12:00"))];
  const closed = !day.open || !day.close;
  const slots = closed ? [] : buildSlots(input);
  return {
    date: input.date,
    partySize: input.partySize,
    slots,
    closed,
    firstAvailable: slots.find((s) => s.available)?.time ?? null,
    deposit: depositFor(input.policy, input.partySize),
  };
}

/** True when the party is outside what this venue takes online. */
export function partySizeError(
  policy: BookingPolicy,
  partySize: number,
): "partyTooSmall" | "partyTooLarge" | null {
  if (partySize < policy.minPartySize) return "partyTooSmall";
  if (partySize > policy.maxPartySize) return "partyTooLarge";
  return null;
}

// ---------------------------------------------------------------------------
// A booking's own timeline
// ---------------------------------------------------------------------------

export function reservationStart(reservation: Reservation): Date {
  return atTime(reservation.date, reservation.time);
}

export function reservationEnd(reservation: Reservation): Date {
  return new Date(
    reservationStart(reservation).getTime() + reservation.durationMinutes * 60_000,
  );
}

/** "19:30 – 21:30", for cards and the floor view. */
export function reservationTimeRange(reservation: Reservation): string {
  return `${reservation.time} – ${fromMinutes(
    toMinutes(reservation.time) + reservation.durationMinutes,
  )}`;
}

/**
 * The status to *show*, which is not always the status stored.
 *
 * A table whose sitting has finished reads as `completed`, and one whose start
 * time passed while it was never seated reads as a `no-show` — both without
 * anything sweeping the book, exactly as C15's pause self-expires. Terminal
 * states (cancelled, and anything the venue set by hand) are returned as-is.
 */
export function effectiveReservationStatus(
  reservation: Reservation,
  now: Date,
): ReservationStatus {
  const { status } = reservation;
  if (status === "cancelled" || status === "completed" || status === "no-show") {
    return status;
  }
  if (status === "seated") {
    return now >= reservationEnd(reservation) ? "completed" : "seated";
  }
  // pending / confirmed: the sitting ended and nobody was ever seated.
  if (now >= reservationEnd(reservation)) return "no-show";
  return status;
}

/** Bookings still ahead of the guest — the ones worth acting on. */
export function isUpcoming(reservation: Reservation, now: Date): boolean {
  const status = effectiveReservationStatus(reservation, now);
  return status === "pending" || status === "confirmed" || status === "seated";
}

/**
 * Whether the guest can still cancel without the venue losing the cover.
 * Mirrors C15's skip cutoff: the rule lives here, and the service enforces it
 * regardless of what the UI chose to render.
 */
export function canCancelReservation(
  reservation: Reservation,
  now: Date,
  cancelCutoffHours: number,
): boolean {
  if (!isUpcoming(reservation, now)) return false;
  const cutoff = reservationStart(reservation).getTime() - cancelCutoffHours * 3_600_000;
  return now.getTime() < cutoff;
}

/** Upcoming bookings, soonest first. */
export function sortUpcoming(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort(
    (a, b) => reservationStart(a).getTime() - reservationStart(b).getTime(),
  );
}

/** Past bookings, most recent first. */
export function sortPast(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort(
    (a, b) => reservationStart(b).getTime() - reservationStart(a).getTime(),
  );
}

// ---------------------------------------------------------------------------
// The vendor's view of a service
// ---------------------------------------------------------------------------

/**
 * Each table's state at one instant — who is sitting there and who is next.
 * Derived from the book, so the floor view never needs its own occupancy field.
 */
export function buildFloorStatus(
  tables: RestaurantTable[],
  reservations: Reservation[],
  at: Date,
): TableStatus[] {
  const date = toDateKey(at);
  const nowMin = (at.getTime() - atTime(date, "00:00").getTime()) / 60_000;
  const today = reservations.filter((r) => r.date === date && holdsTable(r));

  return tables.map((table) => {
    const mine = today
      .filter((r) => r.tableIds.includes(table.id))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

    const current =
      mine.find((r) => {
        const start = toMinutes(r.time);
        return nowMin >= start && nowMin < start + r.durationMinutes;
      }) ?? null;
    const next = mine.find((r) => toMinutes(r.time) > nowMin) ?? null;

    return { tableId: table.id, label: table.label, zone: table.zone, seats: table.seats, current, next };
  });
}

/**
 * Headline numbers for one service day. `utilisation` is sold seat-hours over
 * available seat-hours — the honest measure of how full a night is, since a
 * two-top held for two hours is not the same load as a six-top held for one.
 */
export function summariseDay(
  reservations: Reservation[],
  tables: RestaurantTable[],
  hours: WeeklyHours,
  date: string,
  now: Date,
): ReservationDaySummary {
  const onBook = reservations.filter((r) => r.date === date && holdsTable(r));
  const covers = onBook.reduce((sum, r) => sum + r.partySize, 0);
  const pending = onBook.filter((r) => r.status === "pending").length;
  const seated = onBook.filter(
    (r) => effectiveReservationStatus(r, now) === "seated",
  ).length;

  const day = hours[weekdayOf(atTime(date, "12:00"))];
  const openHours =
    day.open && day.close
      ? Math.max(
          0,
          (toMinutes(day.close) <= toMinutes(day.open)
            ? toMinutes(day.close) + 1440
            : toMinutes(day.close)) - toMinutes(day.open),
        ) / 60
      : 0;
  const capacitySeatHours = tables.reduce((sum, t) => sum + t.seats, 0) * openHours;
  const soldSeatHours = onBook.reduce(
    (sum, r) => sum + r.partySize * (r.durationMinutes / 60),
    0,
  );

  return {
    date,
    bookings: onBook.length,
    covers,
    pending,
    seated,
    utilisation:
      capacitySeatHours > 0 ? Math.min(1, soldSeatHours / capacitySeatHours) : 0,
  };
}
