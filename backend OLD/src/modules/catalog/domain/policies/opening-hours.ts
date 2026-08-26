import type { Weekday } from '../../../../shared/enums';
import { WEEKDAYS } from '../../../../shared/enums';
import type { DayHoursRecord, WeeklyHoursRecord } from '../models';

/**
 * "Is this branch open right now" — and why it is 150 lines rather than a boolean
 * column.
 *
 * The frontend's `Vendor.isOpen` is a stored flag in the mock layer, which is fine
 * for a prototype and wrong for a platform: a flag has to be written by something,
 * on a schedule, in every timezone the platform serves. `catalog.prisma` therefore
 * stores the *hours* and derives the answer, and this is where the derivation lives
 * — pure, so `verify:catalog` can exercise every branch of it with literals and no
 * database.
 *
 * Four things make it non-trivial, and all four are real:
 *
 * - **The branch's timezone, not the server's.** A Dhaka kitchen closes at 23:00
 *   Dhaka time whether the API runs in Dhaka or Frankfurt. Every comparison here
 *   happens in `branch.timezone`.
 * - **Several windows per day.** A split lunch/dinner service is two rows for one
 *   weekday, which a single `DayHours` cannot express — so the table is the truth
 *   and `toWeeklyHours` projects the frontend's shape out of it.
 * - **Windows that cross midnight.** A 23:00–02:00 service is open at 00:30, and at
 *   00:30 the *current* weekday's rows say nothing about it: the window belongs to
 *   yesterday. Missing this is the classic version of this bug.
 * - **Reasons other than the clock.** A merchant kill switch, a pause, a dated
 *   closure and a suspended status all close a branch that the grid says is open.
 */

/** One `BranchHour` row, as the repository reads it. */
export interface OpeningWindow {
  weekday: Weekday;
  /** Local "HH:mm". Null on either side means the branch is closed that day. */
  openTime: string | null;
  closeTime: string | null;
  overnight: boolean;
  sort: number;
}

/** One `BranchClosure` row — a holiday or a refit, in local dates, inclusive. */
export interface ClosurePeriod {
  fromDate: Date;
  toDate: Date;
}

export interface BranchAvailability {
  timezone: string;
  /** The merchant's kill switch: closes the branch regardless of the grid. */
  acceptingOrders: boolean;
  /** A temporary pause — "we need 30 minutes". Null when not paused. */
  pausedUntil: Date | null;
  /** Anything other than `active` is not open for business. */
  isActive: boolean;
  windows: readonly OpeningWindow[];
  closures: readonly ClosurePeriod[];
}

const CLOSED: DayHoursRecord = { open: null, close: null };

/** "HH:mm" → minutes since local midnight. Null for anything unparseable. */
export function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The seven-field grid the restaurant page renders.
 *
 * When a weekday has several windows the earliest (lowest `sort`) wins, because
 * `DayHours` has room for exactly one pair and the first service of the day is the
 * honest summary of "when do you open". The full set stays available to `isOpenNow`,
 * which does not have to summarise anything — so a split-service branch shows
 * "12:00 – 15:00" and is still correctly open at 20:00.
 */
export function toWeeklyHours(windows: readonly OpeningWindow[]): WeeklyHoursRecord {
  const byDay = new Map<Weekday, OpeningWindow>();

  for (const window of [...windows].sort((a, b) => a.sort - b.sort)) {
    if (window.openTime === null || window.closeTime === null) continue;
    if (!byDay.has(window.weekday)) byDay.set(window.weekday, window);
  }

  // Built by iterating WEEKDAYS rather than by spreading an object literal, so the
  // key order is Monday-first and a weekday added to the vocabulary cannot be
  // silently missing from the grid.
  return WEEKDAYS.reduce<WeeklyHoursRecord>((grid, weekday) => {
    const window = byDay.get(weekday);
    grid[weekday] = window ? { open: window.openTime, close: window.closeTime } : CLOSED;
    return grid;
  }, {} as WeeklyHoursRecord);
}

/** Where the branch is in its own day: weekday, minutes past midnight, local date. */
export function localMoment(
  at: Date,
  timezone: string,
): { weekday: Weekday; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // `hour12: false` alone yields "24:00" at midnight in some ICU versions; h23 is
    // the cycle that actually means 00–23.
    hourCycle: 'h23',
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekday = read('weekday').slice(0, 3).toLowerCase() as Weekday;

  return {
    weekday: WEEKDAYS.includes(weekday) ? weekday : 'mon',
    minutes: Number(read('hour')) * 60 + Number(read('minute')),
    date: `${read('year')}-${read('month')}-${read('day')}`,
  };
}

/** A `@db.Date` column is a UTC-midnight instant; its calendar date is its prefix. */
function toLocalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function crossesMidnight(window: OpeningWindow): boolean {
  const open = toMinutes(window.openTime);
  const close = toMinutes(window.closeTime);
  if (open === null || close === null) return false;
  // Trust the column, but a close time at or before the open time is overnight
  // whatever the flag says — otherwise one bad row silently closes a late kitchen.
  return window.overnight || close <= open;
}

/** Previous weekday, wrapping Monday back to Sunday. */
function dayBefore(weekday: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(weekday);
  return WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length];
}

export function isOpenNow(branch: BranchAvailability, at: Date): boolean {
  if (!branch.isActive) return false;
  if (!branch.acceptingOrders) return false;
  if (branch.pausedUntil !== null && branch.pausedUntil.getTime() > at.getTime()) return false;

  const { weekday, minutes, date } = localMoment(at, branch.timezone);

  for (const closure of branch.closures) {
    if (date >= toLocalDate(closure.fromDate) && date <= toLocalDate(closure.toDate)) return false;
  }

  for (const window of branch.windows) {
    const open = toMinutes(window.openTime);
    const close = toMinutes(window.closeTime);
    if (open === null || close === null) continue;

    if (window.weekday === weekday) {
      // An overnight window is open from its start until midnight; the tail after
      // midnight belongs to the next calendar day and is handled below.
      if (crossesMidnight(window) ? minutes >= open : minutes >= open && minutes < close) {
        return true;
      }
    }

    // Yesterday's overnight service, still running: 00:30 falls inside 23:00–02:00.
    if (window.weekday === dayBefore(weekday) && crossesMidnight(window) && minutes < close) {
      return true;
    }
  }

  return false;
}
