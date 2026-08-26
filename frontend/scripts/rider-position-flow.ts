/**
 * G38 flow check — exercises the shared rider position end to end.
 * Run from the project root:
 *
 *     NODE_ENV=test bun scripts/rider-position-flow.ts
 *
 * Every assertion is a claim the phase makes in prose somewhere; this is where
 * those claims are checked against the code rather than against confidence. The
 * five the whole change rests on:
 *
 *  1. **One representation.** The customer's marker, the courier's map and the
 *     operations desk read one record. Checked by identity, not by inspection:
 *     the number each surface renders is derived from the same `RiderPosition`.
 *  2. **Deterministic.** The same delivery at the same instant is the same fix,
 *     every time — which is what lets three tabs agree without a backend.
 *  3. **Route-based.** The position sits on the optimised route's real geometry
 *     and advances along it, not along a stage count.
 *  4. **Lifecycle-aware.** The clock moves the marker *within* a leg and can
 *     never move it past a stop the rider has not reported; a finished or failed
 *     delivery freezes.
 *  5. **API-ready.** Swapping the provider changes every surface's fix and
 *     nothing else — no UI, no signature, no import.
 */
import { readFileSync } from "node:fs";

import type { DeliveryJob, Order, OrderStatus, Rider, RiderTrack } from "@/types";
import { locales, type Locale } from "@/config/i18n/config";
import { buildDemoOrders, buildJobOffers, deliveryZones, riders } from "@/lib/mock";
import { HANDOVER_CHECKS, transition, stagesFor, stageIndex } from "@/lib/order-machine";
import { handoverCodeFor } from "@/lib/delivery";
import { riderSnapshot } from "@/lib/order-lifecycle";
import { trackingProgress } from "@/lib/tracking";
import {
  isRiderOnRoute,
  mockRiderPositions,
  riderTrack,
  routePercent,
  setRiderPositionProvider,
  type RiderPositionProvider,
} from "@/lib/rider-position";
import { jobForOrder, riderTrackForOrder } from "@/services/delivery";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const MINUTE = 60_000;

/** Floating-point comparison — these are fractions of a route, not money. */
function near(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

// ── A delivery to drive ──────────────────────────────────────────────────────

/**
 * The order every assertion below runs on: a fresh delivery order, walked
 * forward with `lib/order-machine.transition` rather than constructed at each
 * status, so the event log the position reads is a log a real run would produce.
 */
function freshOrder(): Order {
  const order = buildDemoOrders(NOW).find(
    (o) => o.fulfillment === "delivery" && o.status === "placed" && o.address != null,
  );
  if (!order) throw new Error("no seeded delivery order in `placed`");
  return order;
}

const COURIER: Rider = (() => {
  const rider = riders.find((r) => !r.deletedAt);
  if (!rider) throw new Error("no seeded rider");
  return rider;
})();

/** Apply one transition, failing loudly if the machine refused it. */
function step(
  order: Order,
  to: OrderStatus,
  actor: Parameters<typeof transition>[2],
  patch: Parameters<typeof transition>[3] = {},
  at: number = NOW,
): Order {
  const result = transition(order, to, actor, patch, at);
  if (!result.order) throw new Error(`refused ${order.status} → ${to}: ${result.error}`);
  return result.order;
}

/**
 * The same delivery at each point of its life, on one timeline: confirmed at
 * T+0, ready at T+20, dispatched at T+22, collected at T+25, away at T+26.
 */
const T = {
  confirmed: NOW,
  ready: NOW + 20 * MINUTE,
  assigned: NOW + 22 * MINUTE,
  pickedUp: NOW + 25 * MINUTE,
  away: NOW + 26 * MINUTE,
  arrived: NOW + 38 * MINUTE,
  delivered: NOW + 39 * MINUTE,
};

const placed = freshOrder();
const confirmed = step(placed, "confirmed", "restaurant", { prepMinutes: 25 }, T.confirmed);
const ready = step(
  step(step(confirmed, "preparing", "restaurant", {}, NOW + 2 * MINUTE), "packing", "restaurant", {}, NOW + 15 * MINUTE),
  "ready",
  "restaurant",
  {},
  T.ready,
);
const assigned = step(
  ready,
  "rider-assigned",
  "admin",
  { rider: riderSnapshot(COURIER), assignment: "manual" },
  T.assigned,
);
const pickedUp = step(
  assigned,
  "picked-up",
  "rider",
  {
    handover: {
      code: handoverCodeFor(assigned.id, COURIER.id) ?? "",
      checks: [...HANDOVER_CHECKS],
    },
  },
  T.pickedUp,
);
const onTheWay = step(pickedUp, "on-the-way", "rider", {}, T.away);
const arrived = step(onTheWay, "arrived", "rider", {}, T.arrived);
const delivered = step(arrived, "delivered", "rider", { cashCollected: true }, T.delivered);
const failed = step(arrived, "delivery-failed", "rider", { reason: "customer-unavailable" }, T.delivered);
/** Called off after dispatch — a courier exists, and stops where they were. */
const cancelled = step(assigned, "cancelled", "admin", { reason: "other" }, T.assigned + MINUTE);
/** Called off before dispatch — there is no courier to have a position at all. */
const cancelledEarly = step(ready, "cancelled", "admin", { reason: "other" }, T.assigned);

/** The track for a state of this order, or a loud failure. */
function trackOf(order: Order, at: number): RiderTrack {
  const track = riderTrackForOrder(order, at, deliveryZones);
  if (!track) throw new Error(`no track for ${order.status}`);
  return track;
}

// ── 1. One representation, three surfaces ────────────────────────────────────
{
  console.log("\n— one representation —");

  const at = T.away + 5 * MINUTE;
  const track = trackOf(onTheWay, at);

  /**
   * The customer's map. `TrackingMap` renders `progress.fraction`; the whole
   * point of G38 is that this number *is* the courier's route fraction and is no
   * longer this screen's private arithmetic.
   */
  const customer = trackingProgress(onTheWay, at, track.position).fraction;
  check(
    "the customer's marker is the courier's position",
    customer === track.position.routeFraction,
    `${customer} vs ${track.position.routeFraction}`,
  );

  // The courier's own map (`RouteMap`) projects `track.position` directly, and
  // the desk renders `routePercent(track)`. All three therefore reduce to one
  // number — assert the desk's rounding is of the same fraction.
  check(
    "the operations desk reads the same fraction",
    routePercent(track) === Math.round(customer * 100),
    `${routePercent(track)}% vs ${Math.round(customer * 100)}%`,
  );

  /**
   * And it is genuinely shared, not coincidentally equal: the rider app resolves
   * the track through the same seam from the same order, so the two calls return
   * identical records.
   */
  const riderApp = trackOf(onTheWay, at);
  check(
    "the rider app and the customer resolve the same track",
    JSON.stringify(riderApp) === JSON.stringify(track),
  );

  /**
   * Before the phase, the customer's marker was a *stage* fraction. It is not
   * that any more — proving the two used to disagree, which is the gap.
   */
  const stageOnly = trackingProgress(onTheWay, at).fraction;
  check(
    "the stage estimate and the courier's real place differ",
    !near(stageOnly, track.position.routeFraction, 0.01),
    `${stageOnly} vs ${track.position.routeFraction}`,
  );
}

// ── 2. Deterministic ─────────────────────────────────────────────────────────
{
  console.log("— deterministic —");

  const at = T.away + 4 * MINUTE;
  const a = trackOf(onTheWay, at);
  const b = trackOf(onTheWay, at);
  check("the same delivery and clock give the same fix", JSON.stringify(a) === JSON.stringify(b));

  check("the fix says it is simulated", a.position.source === "mock");
  check("the fix names the delivery it belongs to", a.orderId === onTheWay.id);
  check("the fix names the courier", a.riderId === COURIER.id);
}

// ── 3. Route-based ───────────────────────────────────────────────────────────
{
  console.log("— route-based —");

  const at = T.away + 5 * MINUTE;
  const track = trackOf(onTheWay, at);
  const { position, path, stops } = track;

  check("the polyline is the origin plus every stop", path.length === stops.length + 1);
  check(
    "path[i + 1] is stops[i]",
    stops.every((s, i) => path[i + 1].lat === s.lat && path[i + 1].lng === s.lng),
  );

  // The fix is on the segment it says it is on.
  const from = path[position.legIndex];
  const to = path[position.legIndex + 1];
  check(
    "the fix lies on the leg it names",
    near(position.lat, from.lat + (to.lat - from.lat) * position.legFraction, 1e-9) &&
      near(position.lng, from.lng + (to.lng - from.lng) * position.legFraction, 1e-9),
  );

  // And it is the real geometry, not a straight line drawn between two labels.
  const job = jobForOrder(onTheWay, at, deliveryZones);
  check("the route carries measured legs", (job?.distanceKm ?? 0) > 0, String(job?.distanceKm));

  // It advances with the clock, monotonically.
  const samples = [0, 2, 4, 6, 8].map(
    (m) => trackOf(onTheWay, T.away + m * MINUTE).position.routeFraction,
  );
  check(
    "the fix advances along the route",
    samples.every((f, i) => i === 0 || f >= samples[i - 1]) &&
      samples[samples.length - 1] > samples[0],
    samples.join(" → "),
  );
}

// ── 4. Lifecycle-aware ───────────────────────────────────────────────────────
{
  console.log("— lifecycle-aware —");

  // Nobody dispatched: a route, but no courier on it.
  const unassigned = trackOf(ready, T.ready + MINUTE);
  check("an undispatched order has no courier on the route", unassigned.position.phase === "unassigned");
  check("…and no surface draws a marker for it", !isRiderOnRoute(unassigned));
  check("…while still describing the route", unassigned.stops.length === 2);

  // Dispatched, not yet collected.
  const toPickup = trackOf(assigned, T.assigned + MINUTE);
  const pickupStop = toPickup.stops[0];
  check("a dispatched courier is heading for the kitchen", toPickup.position.phase === "to-pickup");
  check(
    "…and is at the kitchen, which is where a real order's route starts",
    toPickup.position.lat === pickupStop.lat && toPickup.position.lng === pickupStop.lng,
  );
  check("…with the route not yet begun", toPickup.position.routeFraction === 0);

  // Collected, still at the counter.
  const atPickup = trackOf(pickedUp, T.pickedUp + MINUTE);
  check("a collected order is at the kitchen", atPickup.position.phase === "at-pickup");
  check("…not moving", atPickup.position.moving === false);
  check("…and has not started the ride", atPickup.position.routeFraction === 0);

  // Away.
  const away = trackOf(onTheWay, T.away + 5 * MINUTE);
  check("an order on the road is moving", away.position.phase === "to-dropoff" && away.position.moving);
  check(
    "…somewhere between the kitchen and the door",
    away.position.routeFraction > 0 && away.position.routeFraction < 1,
    String(away.position.routeFraction),
  );

  /**
   * The rule the whole tracker was rewritten around, now enforced for the map
   * too: the clock may take the marker to the kerb and no further. An hour past
   * the promised ETA with no `arrived` on the log is still not an arrival.
   */
  const overdue = trackOf(onTheWay, Date.parse(onTheWay.estimatedDeliveryAt) + 60 * MINUTE);
  check(
    "the clock cannot deliver the order",
    overdue.position.routeFraction < 1 && overdue.position.phase === "to-dropoff",
    String(overdue.position.routeFraction),
  );
  check("…and the stop is still open", overdue.completedStopIds.length === 1);

  // At the door, by the rider's own account.
  const atDoor = trackOf(arrived, T.arrived + MINUTE);
  const dropStop = atDoor.stops[1];
  check("an arrived courier is at the door", atDoor.position.phase === "arrived");
  check(
    "…exactly at the door, not near it",
    atDoor.position.lat === dropStop.lat && atDoor.position.lng === dropStop.lng,
  );
  check("…and stopped", atDoor.position.moving === false);

  // Handed over — and frozen there.
  const doneEarly = trackOf(delivered, T.delivered + MINUTE);
  const doneLate = trackOf(delivered, T.delivered + 120 * MINUTE);
  check("a delivered order completes the route", doneEarly.position.routeFraction === 1);
  check("…stops at the handoff", doneEarly.position.at === T.delivered);
  check(
    "…and does not move again",
    JSON.stringify(doneEarly.position) === JSON.stringify(doneLate.position),
  );

  // A failed handoff: at the door, stopped, short of the end.
  const failedEarly = trackOf(failed, T.delivered + MINUTE);
  const failedLate = trackOf(failed, T.delivered + 120 * MINUTE);
  check("a failed delivery stops the courier", failedEarly.position.phase === "ended");
  check("…at the door they reached", failedEarly.position.routeFraction === 1);
  check("…and not moving", failedEarly.position.moving === false);
  check(
    "…nor moving later",
    JSON.stringify(failedEarly.position) === JSON.stringify(failedLate.position),
  );

  // Called off with a courier already on it: stopped, and no further along than
  // the kitchen they had not left.
  const dead = trackOf(cancelled, T.assigned + 30 * MINUTE);
  check("a cancelled order stops its courier", dead.position.phase === "ended");
  check("…who never got anywhere", dead.position.routeFraction === 0);
  check("…and is not moving", dead.position.moving === false);

  // Called off before dispatch: nobody to have a position.
  const neverDispatched = trackOf(cancelledEarly, T.assigned + 30 * MINUTE);
  check(
    "an order cancelled before dispatch has no courier",
    neverDispatched.position.phase === "unassigned" && !isRiderOnRoute(neverDispatched),
  );
}

// ── 5. Preserved behaviour ───────────────────────────────────────────────────
{
  console.log("— preserved —");

  /**
   * A pickup order has no courier and no route, so nothing changed for it: the
   * tracker still answers with its own clock-smoothed stage estimate, which is
   * why `trackingProgress`' third parameter is optional rather than required.
   */
  const pickup = buildDemoOrders(NOW).find((o) => o.fulfillment === "pickup");
  if (!pickup) throw new Error("no seeded pickup order");
  check("a pickup order has no courier track", riderTrackForOrder(pickup, NOW, deliveryZones) === null);

  const stages = stagesFor(pickup.fulfillment);
  const expected = Math.max(0, stageIndex(pickup.status, pickup.fulfillment)) / (stages.length - 1);
  const fraction = trackingProgress(pickup, NOW).fraction;
  check(
    "…and still tracks by stage",
    pickup.status === "delivered" || pickup.status === "completed"
      ? fraction === 1
      : near(fraction, expected, 0.35),
    `${fraction} vs ~${expected}`,
  );

  /**
   * The synthesised multi-stop trip the rider app demonstrates batching with runs
   * through the same provider from its zone centre — the origin its router
   * measured the first leg from — so the trip screen did not get a second
   * position model either.
   */
  const zone = deliveryZones.find((z) => z.id === COURIER.zoneId) ?? deliveryZones[0];
  const offers: DeliveryJob[] = buildJobOffers(COURIER.id, NOW);
  const offer = offers[0];
  if (!offer) throw new Error("no synthesised offers");
  const synthetic = riderTrack({
    job: { ...offer, riderId: COURIER.id, acceptedAt: new Date(NOW).toISOString() },
    origin: { lat: zone.lat, lng: zone.lng },
    now: NOW + 3 * MINUTE,
  });
  check("a synthesised trip resolves through the same provider", synthetic !== null);
  check(
    "…from the zone centre its router used",
    synthetic?.path[0].lat === zone.lat && synthetic?.path[0].lng === zone.lng,
  );
  check(
    "…and has a courier on the road",
    synthetic != null && isRiderOnRoute(synthetic) && synthetic.position.routeFraction > 0,
    String(synthetic?.position.routeFraction),
  );
}

// ── 6. API-ready ─────────────────────────────────────────────────────────────
{
  console.log("— api-ready —");

  /** A stand-in for the eventual GPS/WebSocket feed. */
  const fakeGps: RiderPositionProvider = {
    source: "gps",
    track(input) {
      const base = mockRiderPositions.track(input);
      return base ? { ...base, position: { ...base.position, source: "gps" } } : null;
    },
  };

  const previous = setRiderPositionProvider(fakeGps);
  const live = trackOf(onTheWay, T.away + 5 * MINUTE);
  check("a registered provider reaches the surfaces", live.position.source === "gps");
  check(
    "…through the same seam, unchanged",
    live.stops.length === 2 && live.position.phase === "to-dropoff",
  );

  setRiderPositionProvider(previous);
  check(
    "…and the mock comes back",
    trackOf(onTheWay, T.away + 5 * MINUTE).position.source === "mock",
  );
}

// ── 7. Forbidden patterns (§11: no independent page-specific positions) ──────
{
  console.log("— no second position —");

  const read = (path: string) => readFileSync(path, "utf8");

  const surfaces = {
    "components/tracking/order-tracking.tsx": "riderTrackForOrder",
    "components/rider/live-trip-view.tsx": "riderTrackForOrder",
    "components/admin/live-ops.tsx": "riderTrackForOrder",
    "components/admin/order-detail-view.tsx": "riderTrackForOrder",
  };
  for (const [file, needle] of Object.entries(surfaces)) {
    check(`${file} reads the shared position`, read(file).includes(needle));
  }

  const routeMap = read("components/rider/route-map.tsx");
  check("the courier's map renders the shared fix", routeMap.includes("track.position"));
  check(
    "…and no longer counts completed stops for the marker",
    !routeMap.includes("riderIndex") && !routeMap.includes("done.size"),
  );

  const tracker = read("components/tracking/order-tracking.tsx");
  check(
    "the customer's map is fed the shared fix",
    tracker.includes("trackingProgress(order, now, track?.position)"),
  );

  /**
   * No real GPS, no socket, no polling — the mock is arithmetic and nothing else.
   * Comments are stripped first: the module header *names* the feeds it is not,
   * and a check that could not tell prose from code would be checking the prose.
   */
  const code = read("lib/rider-position.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const banned of [
    "navigator",
    "geolocation",
    "WebSocket",
    "EventSource",
    "fetch(",
    "setInterval",
    "Math.random",
  ]) {
    check(`the provider does not use ${banned}`, !code.includes(banned));
  }
}

// ── 8. Sayable in every locale ───────────────────────────────────────────────
{
  console.log("— i18n —");

  const catalogs = Object.fromEntries(
    locales.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]),
  ) as Record<Locale, Record<string, unknown>>;

  const lookup = (catalog: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((node, key) => {
      if (node && typeof node === "object") return (node as Record<string, unknown>)[key];
      return undefined;
    }, catalog);

  const PATHS = [
    "admin.fieldCourierPosition",
    "admin.courierAt",
    "admin.routePercent",
    ...[
      "unassigned",
      "to-pickup",
      "at-pickup",
      "to-dropoff",
      "arrived",
      "delivered",
      "ended",
    ].map((phase) => `admin.courierPhase.${phase}`),
  ];

  for (const locale of locales) {
    const missing = PATHS.filter((p) => typeof lookup(catalogs[locale], p) !== "string");
    check(`every phase is sayable in ${locale}`, missing.length === 0, missing.join(", "));
  }
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} assertions passed`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("G38 (live rider position) flow: all green");
