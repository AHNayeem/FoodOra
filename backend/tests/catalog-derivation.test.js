/**
 * catalog-derivation.test.js — the two derived fields, without a database.
 *
 * `isOpen` and `distanceKm` are the whole of what BACKEND-REQUIREMENTS §3 row 4
 * asks module 4 to compute, and both are pure functions of a row and an instant —
 * so they are tested as such: a frozen clock, a hand-written window, and no
 * PostgreSQL. Everything that needs the database is in `catalog.test.js`, which
 * exercises the same functions through the real query and the real routes.
 *
 * The cases here are the ones a database test cannot state honestly, because they
 * need the clock to be somewhere specific: the minute a branch opens, the minute
 * it closes, half past midnight on an overnight service, and the same instant read
 * in two timezones.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closureOn,
  foldWeeklyHours,
  isKnownTimezone,
  isOpenNow,
  localParts,
  toDateKey,
  toMinutes,
  windowsByWeekday,
  withinHours,
  WEEKDAYS,
} from "../src/modules/catalog/hours.js";
import { distanceKm, toPoint } from "../src/modules/catalog/geo.js";

/** A Thursday, 12:00 UTC — 18:00 in Dhaka, 08:00 in New York. */
const THURSDAY_NOON_UTC = new Date("2026-08-27T12:00:00.000Z");

const window_ = (weekday, openTime, closeTime, extra = {}) => ({
  weekday,
  openTime,
  closeTime,
  overnight: false,
  sort: 0,
  ...extra,
});

/** An open-every-day grid, for the tests that are about something else. */
const allWeek = (openTime, closeTime) => WEEKDAYS.map((day) => window_(day, openTime, closeTime));

const branch = (extra = {}) => ({
  id: "vbr_test",
  timezone: "Asia/Dhaka",
  status: "active",
  acceptingOrders: true,
  pausedUntil: null,
  ...extra,
});

describe("1. the local clock", () => {
  it("reads an instant in the branch's own timezone", () => {
    const dhaka = localParts(THURSDAY_NOON_UTC, "Asia/Dhaka");
    assert.equal(dhaka.weekday, "thu");
    assert.equal(dhaka.date, "2026-08-27");
    assert.equal(dhaka.minutes, 18 * 60);

    const newYork = localParts(THURSDAY_NOON_UTC, "America/New_York");
    assert.equal(newYork.minutes, 8 * 60);
  });

  it("crosses the date line where the zone does", () => {
    // 20:00 UTC on Thursday is already Friday morning in Dhaka.
    const late = localParts(new Date("2026-08-27T20:00:00.000Z"), "Asia/Dhaka");
    assert.equal(late.weekday, "fri");
    assert.equal(late.date, "2026-08-28");
    assert.equal(late.minutes, 2 * 60);
  });

  it("renders midnight as minute 0, not as hour 24", () => {
    // The `hourCycle: "h23"` case. Without it this is 1440.
    const midnight = localParts(new Date("2026-08-27T18:00:00.000Z"), "Asia/Dhaka");
    assert.equal(midnight.minutes, 0);
    assert.equal(midnight.date, "2026-08-28");
  });

  it("falls back to UTC for a timezone this runtime does not know, and says so", () => {
    assert.equal(isKnownTimezone("Asia/Dhaka"), true);
    assert.equal(isKnownTimezone("Mars/Olympus"), false);
    assert.equal(isKnownTimezone(""), false);
    assert.equal(isKnownTimezone(null), false);

    const parts = localParts(THURSDAY_NOON_UTC, "Mars/Olympus");
    assert.equal(parts.fellBackToUtc, true);
    assert.equal(parts.zone, "UTC");
    assert.equal(parts.minutes, 12 * 60);
  });
});

describe("2. parsing a window", () => {
  it("reads HH:mm as minutes since midnight", () => {
    assert.equal(toMinutes("00:00"), 0);
    assert.equal(toMinutes("09:30"), 570);
    assert.equal(toMinutes("23:59"), 1439);
  });

  it("refuses anything else", () => {
    for (const value of [null, undefined, "", "9:5", "24:01", "10:60", "ten", "10:00:00", 600]) {
      assert.equal(toMinutes(value), null, `${String(value)} should not parse`);
    }
  });

  it("groups rows by weekday and keeps every window of a split service", () => {
    const rows = [window_("mon", "12:00", "15:00"), window_("mon", "18:00", "23:00", { sort: 1 })];
    assert.equal(windowsByWeekday(rows).mon.length, 2);
    assert.equal(windowsByWeekday(rows).tue.length, 0);
  });

  it("infers `overnight` from times that cross midnight", () => {
    const [inferred] = windowsByWeekday([window_("mon", "23:00", "02:00")]).mon;
    assert.equal(inferred.overnight, true);
  });
});

describe("3. within hours", () => {
  const rows = allWeek("10:00", "23:00");

  it("is open between open and close", () => {
    assert.equal(withinHours(rows, { weekday: "thu", minutes: 10 * 60 }), true);
    assert.equal(withinHours(rows, { weekday: "thu", minutes: 18 * 60 }), true);
  });

  it("is closed a minute before opening and at the closing minute", () => {
    assert.equal(withinHours(rows, { weekday: "thu", minutes: 10 * 60 - 1 }), false);
    // Half-open interval: 23:00 is when service stops, not the last minute of it.
    assert.equal(withinHours(rows, { weekday: "thu", minutes: 23 * 60 }), false);
  });

  it("honours a day the branch does not open", () => {
    const closedSunday = [...allWeek("10:00", "23:00").slice(0, 6), window_("sun", null, null)];
    assert.equal(withinHours(closedSunday, { weekday: "sun", minutes: 12 * 60 }), false);
    assert.equal(withinHours(closedSunday, { weekday: "sat", minutes: 12 * 60 }), true);
  });

  it("keeps an overnight service open past midnight, on the next weekday", () => {
    const late = [window_("fri", "23:00", "02:00", { overnight: true })];
    assert.equal(withinHours(late, { weekday: "fri", minutes: 23 * 60 + 30 }), true);
    assert.equal(withinHours(late, { weekday: "sat", minutes: 60 }), true, "01:00 Saturday");
    assert.equal(withinHours(late, { weekday: "sat", minutes: 2 * 60 }), false, "02:00 Saturday");
    assert.equal(withinHours(late, { weekday: "sat", minutes: 12 * 60 }), false, "Saturday lunch");
  });

  it("wraps from Sunday to Monday", () => {
    const late = [window_("sun", "22:00", "01:00", { overnight: true })];
    assert.equal(withinHours(late, { weekday: "mon", minutes: 30 }), true);
  });

  it("answers the second window of a split service", () => {
    const split = [window_("thu", "12:00", "15:00"), window_("thu", "18:00", "23:00", { sort: 1 })];
    assert.equal(withinHours(split, { weekday: "thu", minutes: 13 * 60 }), true);
    assert.equal(withinHours(split, { weekday: "thu", minutes: 16 * 60 }), false, "the gap");
    assert.equal(withinHours(split, { weekday: "thu", minutes: 20 * 60 }), true);
  });
});

describe("4. folding back to WeeklyHours", () => {
  it("produces all seven keys, whatever the rows say", () => {
    assert.deepEqual(Object.keys(foldWeeklyHours([])), [...WEEKDAYS]);
  });

  it("a day with no row is closed, not missing", () => {
    assert.deepEqual(foldWeeklyHours([]).mon, { open: null, close: null });
  });

  it("keeps the first window of a split day, which is all DayHours can hold", () => {
    const split = [window_("mon", "12:00", "15:00"), window_("mon", "18:00", "23:00", { sort: 1 })];
    assert.deepEqual(foldWeeklyHours(split).mon, { open: "12:00", close: "15:00" });
  });

  it("skips a null row to reach a real window", () => {
    const rows = [window_("mon", null, null), window_("mon", "10:00", "22:00", { sort: 1 })];
    assert.deepEqual(foldWeeklyHours(rows).mon, { open: "10:00", close: "22:00" });
  });
});

describe("5. closures", () => {
  const closure = { fromDate: new Date("2026-08-26T00:00:00.000Z"), toDate: new Date("2026-08-28T00:00:00.000Z") };

  it("reads a DATE column as the calendar day it names", () => {
    assert.equal(toDateKey(new Date("2026-08-26T00:00:00.000Z")), "2026-08-26");
    assert.equal(toDateKey("2026-08-26"), null);
  });

  it("is inclusive at both ends", () => {
    assert.ok(closureOn([closure], "2026-08-26"));
    assert.ok(closureOn([closure], "2026-08-27"));
    assert.ok(closureOn([closure], "2026-08-28"));
    assert.equal(closureOn([closure], "2026-08-25"), null);
    assert.equal(closureOn([closure], "2026-08-29"), null);
  });
});

describe("6. isOpen — every way a branch is shut", () => {
  const open = () =>
    isOpenNow({ vendorStatus: "active", branch: branch(), hours: allWeek("10:00", "23:00"), now: THURSDAY_NOON_UTC });

  it("is open when nothing says otherwise", () => {
    assert.equal(open().open, true);
    assert.equal(open().reason, null);
  });

  it("a paused or suspended vendor is closed, whatever its hours say", () => {
    for (const status of ["paused", "suspended", "pending", "draft", "rejected"]) {
      const verdict = isOpenNow({
        vendorStatus: status,
        branch: branch(),
        hours: allWeek("10:00", "23:00"),
        now: THURSDAY_NOON_UTC,
      });
      assert.equal(verdict.open, false, status);
      assert.equal(verdict.reason, `vendor-${status}`);
    }
  });

  it("a branch that is not active is closed while the brand trades", () => {
    const verdict = isOpenNow({
      vendorStatus: "active",
      branch: branch({ status: "paused" }),
      hours: allWeek("10:00", "23:00"),
      now: THURSDAY_NOON_UTC,
    });
    assert.equal(verdict.open, false);
    assert.equal(verdict.reason, "branch-paused");
  });

  it("the merchant's kill switch closes it", () => {
    const verdict = isOpenNow({
      vendorStatus: "active",
      branch: branch({ acceptingOrders: false }),
      hours: allWeek("10:00", "23:00"),
      now: THURSDAY_NOON_UTC,
    });
    assert.equal(verdict.open, false);
    assert.equal(verdict.reason, "not-accepting-orders");
  });

  it("`pausedUntil` closes it only while it is in the future", () => {
    const future = isOpenNow({
      vendorStatus: "active",
      branch: branch({ pausedUntil: new Date("2026-08-27T13:00:00.000Z") }),
      hours: allWeek("10:00", "23:00"),
      now: THURSDAY_NOON_UTC,
    });
    assert.equal(future.open, false);
    assert.equal(future.reason, "paused");

    const past = isOpenNow({
      vendorStatus: "active",
      branch: branch({ pausedUntil: new Date("2026-08-27T11:00:00.000Z") }),
      hours: allWeek("10:00", "23:00"),
      now: THURSDAY_NOON_UTC,
    });
    assert.equal(past.open, true);
  });

  it("a closure covering the branch's local date closes it", () => {
    const verdict = isOpenNow({
      vendorStatus: "active",
      branch: branch(),
      hours: allWeek("10:00", "23:00"),
      closures: [{ fromDate: new Date("2026-08-27T00:00:00.000Z"), toDate: new Date("2026-08-27T00:00:00.000Z") }],
      now: THURSDAY_NOON_UTC,
    });
    assert.equal(verdict.open, false);
    assert.equal(verdict.reason, "closure");
  });

  it("outside its hours it is closed, and the reason says which", () => {
    const verdict = isOpenNow({
      vendorStatus: "active",
      branch: branch(),
      hours: allWeek("19:00", "23:00"),
      now: THURSDAY_NOON_UTC, // 18:00 in Dhaka
    });
    assert.equal(verdict.open, false);
    assert.equal(verdict.reason, "outside-hours");
  });

  it("the same instant is open in one timezone and shut in another", () => {
    // 12:00 UTC is 18:00 in Dhaka and 08:00 in New York. A 17:00–22:00 service is
    // open in the first and not the second — which is the whole reason the column
    // exists.
    const hours = allWeek("17:00", "22:00");
    assert.equal(
      isOpenNow({ vendorStatus: "active", branch: branch(), hours, now: THURSDAY_NOON_UTC }).open,
      true,
    );
    assert.equal(
      isOpenNow({
        vendorStatus: "active",
        branch: branch({ timezone: "America/New_York" }),
        hours,
        now: THURSDAY_NOON_UTC,
      }).open,
      false,
    );
  });

  it("a vendor with no branch is closed rather than an exception", () => {
    const verdict = isOpenNow({ vendorStatus: "active", branch: null, now: THURSDAY_NOON_UTC });
    assert.equal(verdict.open, false);
    assert.equal(verdict.reason, "no-branch");
  });
});

describe("7. distance", () => {
  const gulshan = { lat: 23.7806, lng: 90.4152 };

  it("accepts a pair of coordinates and refuses everything else", () => {
    assert.deepEqual(toPoint(23.78, 90.41), { lat: 23.78, lng: 90.41 });
    assert.deepEqual(toPoint("23.78", "90.41"), { lat: 23.78, lng: 90.41 });
    for (const [lat, lng] of [[undefined, 90], [23, undefined], [91, 90], [23, 181], ["x", 90], [NaN, 0]]) {
      assert.equal(toPoint(lat, lng), null, `${String(lat)},${String(lng)}`);
    }
  });

  it("is zero at the same point and symmetric", () => {
    const banani = { lat: 23.7925, lng: 90.4078 };
    assert.equal(distanceKm(gulshan, gulshan), 0);
    assert.equal(distanceKm(gulshan, banani), distanceKm(banani, gulshan));
  });

  it("is a plausible great-circle distance", () => {
    // Dhaka to Chittagong is about 215 km straight-line.
    const chittagong = { lat: 22.3569, lng: 91.7832 };
    const km = distanceKm(gulshan, chittagong);
    assert.ok(km > 200 && km < 230, `got ${km}`);
  });

  it("rounds to one decimal — the precision the cards render", () => {
    const km = distanceKm(gulshan, { lat: 23.7925, lng: 90.4078 });
    assert.equal(km, Math.round(km * 10) / 10);
  });

  it("is null, never 0, when either point is missing", () => {
    assert.equal(distanceKm(null, gulshan), null);
    assert.equal(distanceKm(gulshan, null), null);
  });
});
