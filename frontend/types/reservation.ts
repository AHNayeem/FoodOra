import type { BaseEntity, ISODate } from "./common";
import type { TableZone } from "./table";

/**
 * reservation.ts — table booking (Phase C16; spec: Table Booking, plus the
 * dashboard's Reservation Management / Table Management).
 *
 * The entity here is the `Reservation`. Everything *around* it is derived:
 * a venue's bookable times (`TimeSlot`) come from its opening hours, its floor
 * plan (`RestaurantTable`, seeded in C11) and the bookings already on the book —
 * never from a stored slot table. That is the whole point: seats are a finite
 * resource, and the only honest source of truth for "is 19:30 free for four?"
 * is the overlap arithmetic in `lib/reservations.ts`.
 *
 * `BookingPolicy` holds the per-venue rules that arithmetic reads (turn time,
 * grid, lead time, deposits, which zones sell online). Policy is data, so a
 * sushi counter and a rooftop trattoria can behave differently without a
 * branch anywhere in the UI.
 */

/**
 * Lifecycle of a booking. `pending` only occurs at venues that review requests
 * (`BookingPolicy.autoConfirm === false`); everywhere else a booking is born
 * `confirmed`. `completed` is *derived* once the table's time has passed —
 * see `effectiveReservationStatus` — so nothing has to sweep the book.
 */
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no-show";

/** What the table is for — the kitchen and floor both care. */
export type OccasionType =
  | "none"
  | "birthday"
  | "anniversary"
  | "date"
  | "business"
  | "celebration";

/** Per-venue booking rules. Data, so venues differ without code branching. */
export interface BookingPolicy extends BaseEntity {
  /** FK → vendors (`ven_*`). One policy per bookable venue. */
  vendorId: string;
  /** Minutes a table is held for a normal party. */
  turnMinutes: number;
  /** Longer hold for big parties — they linger, and everyone knows it. */
  largePartyTurnMinutes: number;
  /** Party size at which `largePartyTurnMinutes` takes over. */
  largePartyFrom: number;
  /** Booking grid granularity in minutes (30 = :00 and :30 starts). */
  slotMinutes: number;
  minPartySize: number;
  /** Largest party bookable online; bigger goes through events/catering. */
  maxPartySize: number;
  /** No new seating within this many minutes of closing. */
  lastSeatingBeforeClose: number;
  /** Minimum notice before a booking can start, in minutes. */
  leadTimeMinutes: number;
  /** How far ahead the calendar is open, in days. */
  advanceDays: number;
  /** Zones sold online — a venue may hold its private room back for events. */
  bookableZones: TableZone[];
  /** Per-guest hold deposit for large parties (0 = the venue takes none). */
  depositPerGuest: number;
  /** Party size from which the deposit applies. */
  depositFrom: number;
  currency: string;
  countryCode: string;
  /** Free-cancellation window, in hours before the booking starts. */
  cancelCutoffHours: number;
  /** True = instantly confirmed; false = the venue reviews the request. */
  autoConfirm: boolean;
  /** Venue-authored note shown on the booking form (dress code, parking…). */
  note: string | null;
}

/** Immutable snapshot of the venue stored on a booking (like `CartVendor`). */
export interface ReservationVenueRef {
  id: string;
  slug: string;
  name: string;
  image: string;
  address: string;
  city: string;
  countryCode: string;
  currency: string;
}

/** Who the table is under. Snapshotted — a profile edit must not rewrite it. */
export interface ReservationGuest {
  name: string;
  phone: string;
  email: string;
}

export interface Reservation extends BaseEntity {
  /** Human-facing reference, e.g. "RSV-8F3A21". */
  reference: string;
  userId: string | null;
  venue: ReservationVenueRef;
  /** Plain local date ("YYYY-MM-DD") — a Friday booking is Friday everywhere. */
  date: string;
  /** Local start time, "HH:mm". */
  time: string;
  /** How long the table is held. Snapshot of the policy at booking time. */
  durationMinutes: number;
  partySize: number;
  /**
   * Allocated tables (FK → `tbl_*`). Usually one; a party too big for any
   * single table is seated across two, which is what a floor manager does.
   */
  tableIds: string[];
  /** Labels of `tableIds`, snapshotted so the card reads without a join. */
  tableLabels: string[];
  zone: TableZone;
  occasion: OccasionType;
  guest: ReservationGuest;
  /** Allergies, wheelchair access, "quiet corner please". */
  notes: string | null;
  status: ReservationStatus;
  /** Held deposit in `currency`; 0 when the policy takes none. */
  depositAmount: number;
  currency: string;
  confirmedAt: ISODate | null;
  seatedAt: ISODate | null;
  cancelledAt: ISODate | null;
}

/** Why a time on the grid cannot be booked. */
export type SlotBlockReason =
  /** Already gone, or inside the venue's lead time. */
  | "too-soon"
  /** Outside opening hours, or past last seating. */
  | "closed"
  /** Open, but every table that fits the party is taken. */
  | "full";

/**
 * One time on a venue's booking grid. **Never stored** — `buildSlots` derives
 * the whole day from opening hours + floor plan + the bookings already taken,
 * so the grid can never disagree with the book.
 */
export interface TimeSlot {
  /** Local start, "HH:mm". */
  time: string;
  available: boolean;
  /** Why not, when `available` is false. */
  reason: SlotBlockReason | null;
  /** Tables this party could be given at this time (0 when unavailable). */
  tablesLeft: number;
}

/** A venue's grid for one date, plus the policy that shaped it. */
export interface DayAvailability {
  date: string;
  partySize: number;
  slots: TimeSlot[];
  /** True when the venue is shut that day — the grid is empty, not full. */
  closed: boolean;
  /** First bookable time, for the "next available" nudge. */
  firstAvailable: string | null;
  /** Deposit this party would be asked to hold (0 when none applies). */
  deposit: number;
}

/**
 * One table's state at a moment in time — the dashboard's floor view.
 * Derived from the book, never stored on `RestaurantTable`.
 */
export interface TableStatus {
  tableId: string;
  label: string;
  zone: TableZone;
  seats: number;
  /** The booking sitting there now, if any. */
  current: Reservation | null;
  /** The next booking on that table today, if any. */
  next: Reservation | null;
}

/** The vendor dashboard's headline numbers for one service day. */
export interface ReservationDaySummary {
  date: string;
  /** Bookings on the book (cancelled and no-shows excluded). */
  bookings: number;
  /** Total guests expected — covers, the number a kitchen actually plans on. */
  covers: number;
  /** Requests still awaiting the venue's decision. */
  pending: number;
  /** Parties currently at a table. */
  seated: number;
  /** Share of the day's seat-hours sold, 0–1. */
  utilisation: number;
}
