import type { Weekday } from "@/types";

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

// ---------------------------------------------------------------------------
// Weeks
//
// Settlement periods are weeks (the platform pays out weekly, which is what
// `lib/mock/pages` has always claimed), so the week needs a canonical reference
// string that sorts, round-trips and does not depend on a locale's idea of when
// a week starts. Monday-first, matching `WEEKDAYS`.
// ---------------------------------------------------------------------------

/** Local Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Local Sunday 23:59:59.999 of the week containing `date`. */
export function endOfWeek(date: Date): Date {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * ISO-8601 week reference for `date`, e.g. `2026-W34`.
 *
 * ISO rules rather than "week containing 1 January", so the reference agrees
 * with every accounting system that also uses them: weeks run Monday–Sunday and
 * week 1 is the one containing the first Thursday of the year — which is why a
 * date in early January can legitimately belong to the previous year's W52/W53.
 */
export function weekRef(date: Date): string {
  // Shift to the Thursday of this week; its calendar year is the ISO year.
  const thursday = startOfWeek(date);
  thursday.setDate(thursday.getDate() + 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** `2026-W34` → the local Monday 00:00 that starts it. Null if unparseable. */
export function weekRefStart(ref: string): Date | null {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(ref);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // Jan 4 is always in ISO week 1; step back to its Monday, then forward.
  const monday = startOfWeek(new Date(year, 0, 4));
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}
