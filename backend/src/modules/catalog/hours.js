/**
 * hours.js — "is it open right now", and the fold back to `WeeklyHours`.
 *
 * BACKEND-REQUIREMENTS §3 row 4 names this as module 4's work: **`isOpen` is
 * derived from the branch's hours in the branch's timezone and never stored.**
 * `catalog.prisma` says the same thing from the other side — `VendorBranch.timezone`
 * is "the only honest basis for 'is it open right now'". A stored boolean would be
 * wrong twice a day and wrong for every branch in a different zone.
 *
 * Everything here is pure: instants and rows in, booleans out. That is what lets
 * the whole of it be tested without a database or a clock, and why the service
 * can answer `isOpen` for a hundred branches in one pass without a round trip.
 *
 * ## The local clock, without a library
 *
 * `Intl.DateTimeFormat` with a `timeZone` is the timezone database Node already
 * ships, so a branch in `Asia/Dhaka` and one in `America/New_York` are both
 * answered correctly — daylight saving included — with no dependency and no
 * offset arithmetic of our own. `hourCycle: "h23"` matters: without it midnight
 * formats as hour `24` in several locales and every "is it after opening"
 * comparison inverts once a day.
 *
 * ## Three window shapes, not one
 *
 * `BranchHour` is a *row per window*, which is why it is a table rather than the
 * frontend's `WeeklyHours` JSON — a lunch service and a dinner service on the
 * same day cannot both fit in one `DayHours`. So:
 *
 *  - `isOpenNow` considers **every** window, including one that started
 *    yesterday and has not closed yet (`overnight`, a 23:00–02:00 service);
 *  - `foldWeeklyHours` collapses each day to the **first** window, because that
 *    is all `types/common.ts::DayHours` can carry. The loss is real and stated
 *    in the M4 doc rather than hidden: the read model shows "10:00–15:00" for a
 *    split day whose second service the *open/closed* answer still honours.
 */

/** `types/common.ts::Weekday`, in the order the frontend's `WeeklyHours` keys it. */
export const WEEKDAYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/** `Intl`'s three-letter English weekday → our vocabulary. */
const WEEKDAY_BY_LABEL = Object.freeze({
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
});

/** One formatter per timezone, built once. There are a handful of zones and many branches. */
const formatters = new Map();

function formatterFor(timezone) {
  const cached = formatters.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

/**
 * Is this string a timezone this Node knows?
 *
 * `VendorBranch.timezone` is a `VarChar(64)` with no CHECK behind it, so a typo
 * is a row PostgreSQL is happy with and `Intl` throws a `RangeError` on. Asked
 * once per zone and cached, because the cost is in the constructor.
 */
const validity = new Map();

export function isKnownTimezone(timezone) {
  if (typeof timezone !== "string" || timezone === "") return false;
  const cached = validity.get(timezone);
  if (cached !== undefined) return cached;
  let known = true;
  try {
    formatterFor(timezone);
  } catch {
    known = false;
  }
  validity.set(timezone, known);
  return known;
}

/**
 * An instant, as the branch's own wall clock reads it.
 *
 * `{ weekday: "tue", date: "2026-08-27", minutes: 923 }` — minutes since local
 * midnight, which is the unit every comparison below is in.
 *
 * An unknown timezone falls back to UTC rather than throwing. A branch with a
 * mistyped zone should read as *slightly wrong hours*, not as a discovery
 * endpoint that 500s; the caller is expected to log it, and the service does.
 */
export function localParts(instant, timezone) {
  const zone = isKnownTimezone(timezone) ? timezone : "UTC";
  const parts = {};
  for (const part of formatterFor(zone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    zone,
    fellBackToUtc: zone !== timezone,
    weekday: WEEKDAY_BY_LABEL[parts.weekday] ?? "mon",
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** `"09:30"` → `570`; anything unparseable → `null`. */
export function toMinutes(time) {
  if (typeof time !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  // `24:00` is a legitimate way to write "end of day" and is the only hour-24
  // value that means anything; `24:01` is a typo, not a time.
  if (hours === 24 && minutes !== 0) return null;
  return hours * 60 + minutes;
}

/** The weekday before this one — where an overnight window that is still open lives. */
const previousWeekday = (weekday) => WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7];

/**
 * A `BranchHour` row, normalised to minutes.
 *
 * `overnight` is trusted when set and *inferred* when not: a row reading
 * 23:00–02:00 with the flag unset is a data error whose only sane reading is the
 * one the times describe, and treating it as "closed all day" would silently
 * shut a branch that is serving. The inference is one-directional — a flag set
 * on a window that does not cross midnight is honoured as written, since
 * 10:00–10:00 with `overnight` means "all day".
 */
function normaliseWindow(row) {
  const open = toMinutes(row.openTime);
  const close = toMinutes(row.closeTime);
  if (open === null || close === null) return null;
  return { weekday: row.weekday, open, close, overnight: Boolean(row.overnight) || close <= open };
}

/**
 * Every window for one branch, keyed by weekday.
 *
 * Rows arrive in `sort` order (the repository asks for it); the order is kept,
 * because `foldWeeklyHours` takes the first of each day and "first" has to mean
 * the same thing in both functions.
 *
 * @param {Array<{ weekday: string, openTime: string|null, closeTime: string|null, overnight: boolean }>} rows
 *   `weekday` already translated to the API vocabulary (`"mon"`), not `MON`.
 */
export function windowsByWeekday(rows = []) {
  const byDay = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));
  for (const row of rows) {
    const window = normaliseWindow(row);
    if (window && byDay[window.weekday]) byDay[window.weekday].push(window);
  }
  return byDay;
}

/**
 * `WeeklyHours` — the seven-key object `types/common.ts` declares and the
 * components index by weekday.
 *
 * A day with no row, or whose row has null times, is `{ open: null, close: null }`:
 * `BranchHour`'s own comment says null/null means closed that day, and the
 * frontend renders exactly that as "Closed".
 */
export function foldWeeklyHours(rows = []) {
  const out = Object.fromEntries(WEEKDAYS.map((day) => [day, { open: null, close: null }]));
  for (const row of rows) {
    const day = out[row.weekday];
    // First usable window per day wins, and the rows arrive in `sort` order.
    if (!day || day.open !== null) continue;
    if (toMinutes(row.openTime) === null || toMinutes(row.closeTime) === null) continue;
    out[row.weekday] = { open: row.openTime, close: row.closeTime };
  }
  return out;
}

/** A `@db.Date` column, as the local calendar day it names. Prisma hands it back at UTC midnight. */
export function toDateKey(value) {
  if (!(value instanceof Date)) return null;
  return value.toISOString().slice(0, 10);
}

/** Is `localDate` inside any closure? `BranchClosure` dates are inclusive at both ends. */
export function closureOn(closures = [], localDate) {
  return (
    closures.find((closure) => {
      const from = toDateKey(closure.fromDate);
      const to = toDateKey(closure.toDate);
      if (!from || !to) return false;
      return from <= localDate && localDate <= to;
    }) ?? null
  );
}

/** Does the branch's local clock fall inside one of its windows? */
export function withinHours(rows, { weekday, minutes }) {
  const byDay = windowsByWeekday(rows);

  for (const window of byDay[weekday] ?? []) {
    if (window.overnight ? minutes >= window.open : minutes >= window.open && minutes < window.close) {
      return true;
    }
  }

  // A window opened yesterday and has not closed yet — the 23:00–02:00 service,
  // asked at 00:30.
  for (const window of byDay[previousWeekday(weekday)] ?? []) {
    if (window.overnight && minutes < window.close) return true;
  }

  return false;
}

/**
 * The whole of `Vendor.isOpen`, and the reason for it.
 *
 * `catalog.prisma` on `VendorBranch.acceptingOrders`: "`isOpen` on the read model
 * is `acceptingOrders AND within hours`". Four more conditions come from columns
 * the same file documents, and each one is a way a branch is shut while its
 * weekly grid says otherwise:
 *
 *  1. the **vendor** is not `active` — `paused` is the merchant's own switch,
 *     `suspended` is ours, and neither is open for business;
 *  2. the **branch** is not `active` — one location can be shut while the brand
 *     trades;
 *  3. `acceptingOrders` is off — the merchant's kill switch, which the column's
 *     comment says closes the branch "regardless of opening hours";
 *  4. `pausedUntil` is in the future — the same thing with an end time on it;
 *  5. a **closure** covers today, in local dates — a holiday or a refit;
 *  6. the local clock is outside every window.
 *
 * The `reason` is for logs and for the tests. Nothing renders it: the frontend's
 * `Vendor` carries a boolean, and a branch that is closed because it was
 * suspended must not announce that to a customer.
 *
 * @returns {{ open: boolean, reason: string|null, local: ReturnType<typeof localParts> }}
 */
export function isOpenNow({ vendorStatus, branch, hours = [], closures = [], now = new Date() }) {
  const local = localParts(now, branch?.timezone);
  const shut = (reason) => ({ open: false, reason, local });

  if (vendorStatus !== "active") return shut(`vendor-${vendorStatus}`);
  if (!branch) return shut("no-branch");
  if (branch.status !== "active") return shut(`branch-${branch.status}`);
  if (!branch.acceptingOrders) return shut("not-accepting-orders");
  if (branch.pausedUntil instanceof Date && branch.pausedUntil > now) return shut("paused");

  const closure = closureOn(closures, local.date);
  if (closure) return shut("closure");

  if (!withinHours(hours, local)) return shut("outside-hours");

  return { open: true, reason: null, local };
}
