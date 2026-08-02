import type { Weekday } from "@/frontend/types";

/**
 * dates.ts — plain local calendar + clock-time primitives.
 *
 * Schedules are calendar things, not instants: a Thursday delivery is Thursday
 * wherever the customer is, and a 19:30 table is 19:30 in the dining room.
 * Dates are therefore plain "YYYY-MM-DD" keys converted at *local* midnight
 * (which avoids the UTC day shift `toISOString` introduces), and times of day
 * are plain "HH:mm" strings converted to minutes-since-midnight for arithmetic.
 *
 * Extracted from `lib/subscriptions.ts` in Phase C16, when table booking needed
 * the same vocabulary — two domains reading one implementation rather than two
 * that can drift.
 */

/** Weekdays, Monday-first (matches `WeeklyHours` and the `days` catalog). */
export const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const satisfies readonly Weekday[];

// ---------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** JS weeks start on Sunday; our vocabulary starts on Monday. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

// ---------------------------------------------------------------------------
// Clock times
//
// Opening hours, turn times and booking grids are all minute arithmetic on a
// single day. Doing it in minutes-since-midnight keeps every comparison a plain
// number compare, with one conversion in and one out.
// ---------------------------------------------------------------------------

/** "19:30" → 1170. Returns 0 for anything unparseable. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** 1170 → "19:30". Wraps past midnight so a late close stays a valid clock. */
export function fromMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(
    wrapped % 60,
  ).padStart(2, "0")}`;
}

/** Combine a plain date key and a "HH:mm" time into a local `Date`. */
export function atTime(dateKey: string, time: string): Date {
  const date = fromDateKey(dateKey);
  date.setMinutes(toMinutes(time));
  return date;
}
