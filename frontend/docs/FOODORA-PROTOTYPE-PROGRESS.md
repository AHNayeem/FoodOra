# FoodOra Prototype Progress

Tracks execution of `GAP - Implement v2.md`. Updated at the end of every session.

---

## Completed Phases

### Session 1 — PHASE 0: AUDIT ONLY (2026-08-19)

Repository audited against `FOODORA-PROTOTYPE-GAP-ANALYSIS.md`. **No application
code was changed.** Every classification below was verified against the cited
file in this session, not taken on trust from the gap analysis.

**Verdict on the gap analysis: accurate.** All 45 reported gaps were confirmed;
none were found already fixed. Three corrections/additions are listed under
*Audit corrections*.

#### Gap classification

| ID | Gap | Class | Evidence verified this session |
|----|-----|-------|--------------------------------|
| G01 | Commission model | MISSING | `types/order.ts` — no `commission` on `Order`; `types/catalog.ts` `Vendor` — no commission rate |
| G02 | Settlement | MISSING | `lib/order-machine.ts` `case "completed"` sets only `life.rating` |
| G03 | Order completion | PARTIAL | Machine is ready (`delivered: ["completed"]`, `ACTORS.completed = ["system","customer"]`) but the only call site is the autopilot `lib/order-sim.ts:62`; `customerActions` never emits `completed` |
| G04 | Rider earnings ↔ real orders | INCORRECT | `services/delivery.resolveHistory` reads `DeliveryJob` only; `finishJob` is called from `components/rider/trip-view.tsx` (synthesised) and never from `live-trip-view.tsx` (real) |
| G05 | Cash collection | INCORRECT | `live-trip-view.tsx` `submitOtp({ otp, cashCollected })` destructures `cashCollected` and never uses it |
| G06 | Admin order intervention | MISSING | `components/admin/live-ops.tsx` — zero `onClick`, no `advance` import |
| G07 | Refund management | INCORRECT | `RefundStatus` has `approved`/`rejected` but only `owesWalletRefund` settles, automatically; no approve/reject surface. `RefundStatus` also has no terminal `refunded`/`settled` member |
| G08 | Restaurant onboarding | MISSING | `app/(marketing)/partner/page.tsx` renders `PitchPage`, CTA → `/register` |
| G09 | Vendor approval state | MISSING | `Vendor` has no status field; `services/vendor.ts:34-38` falls back to the flagship vendor for any management account |
| G10 | Rider onboarding | MISSING | `app/(marketing)/rider/page.tsx` is `PitchPage`; `RegisterInput.role` = `"customer" \| "restaurant-owner"` |
| G11 | Rider approval | PARTIAL | `RiderDocument.status` exists; `Rider` has no approval/lifecycle field |
| G12 | Admin restaurants | MISSING | `app/(admin)` contains only `admin`, `admin/cms`, `admin/notifications` |
| G13 | Admin riders | MISSING | same |
| G14 | Admin orders | MISSING | same; `liveOrders()` selector exists but only feeds the KPI page |
| G15 | Admin customers | MISSING | same |
| G16 | Restaurant earnings/payouts | MISSING | `dashboard-shell.tsx` NAV: overview, orders, kitchen, reservations, pos, menu, coupons, reviews, qr — no earnings |
| G17 | Admin payouts/settlement | MISSING | no route |
| G18 | Restaurant settings/hours/branches | MISSING | no settings route; `Vendor` has one `location`, `WeeklyHours` not editable |
| G19 | Menu authoring | PARTIAL | `menu-manager.tsx` — list + 86 toggle only; header comment admits the builder is deferred |
| G20 | Option-group authoring | MISSING | `FoodOptionGroup` consumed by the customiser, no authoring surface |
| G21 | Inventory | MISSING | `stores/merchant.unavailable: string[]` is the only availability state — binary |
| G22 | Handover verification | PARTIAL | `restaurantActions` `rider-assigned` → plain `handToRider`, no code/checklist |
| G23 | Restaurant analytics | PARTIAL | charts read `buildVendorOrders(...)`; no date range, no export |
| G24 | Staff / roles | MISSING | `User.permissions` never read |
| G25 | Customer support/disputes | MISSING | `/help` = static FAQ + `mailto:support@foodora.example.com` |
| G26 | Admin support/disputes | MISSING | no route, though `customer-support` is an admitted admin role |
| G27 | Rider/restaurant contact | PARTIAL | `order-tracking.tsx` call/message buttons are `toast.info` stubs |
| G28 | Admin coupons/campaigns | MISSING | only `stores/merchant.addCoupon` (vendor-issued) |
| G29 | Review moderation | MISSING | no route, though `moderator` is an admitted role |
| G30 | Platform settings | MISSING | hard-coded in `config/regions.ts`, `lib/mock/delivery-zones.ts`. **Not assigned to any phase in the v2 spec** |
| G31 | RBAC | PARTIAL | `ADMIN_ROLES` / `MANAGEMENT_ROLES` / `RIDER_ROLES` list membership only; no permission helper |
| G32 | Audit log | PARTIAL | `services/cms.ts` audit trail exists; nothing platform-wide |
| G33 | Admin analytics | MISSING | KPI strip only |
| G34 | Scheduled orders | PARTIAL | `scheduledFor` written at checkout, read only by `order-confirmation.tsx:128`; no lifecycle gate |
| G35 | Reorder | INCORRECT | `order-history.tsx` "reorder" is `href={/restaurants/${slug}}` |
| G36 | Rating action | PARTIAL | `customerActions` emits `rate`; no surface renders it. Rating is reachable only via order history / reviews |
| G37 | Location / serviceability | MISSING | `lib/mock/delivery-zones` is imported only by `delivery-jobs` and the mock barrel — never for customer serviceability |
| G38 | Live rider position | PARTIAL | `lib/tracking.ts` clock-smoothed fraction. **Not assigned to any phase in the v2 spec** |
| G39 | Two delivery systems | INCORRECT | `DeliveryJob` (offers/trip/earnings/wallet/history) and `Order` (`LiveDeliveries`/`LiveTripView`) share no bridge |
| G40 | Online/offline vs dispatch | INCORRECT | `lib/order-lifecycle.dispatchRider` filters on `deletedAt` + `rejectedRiderIds` only — shift state lives in `stores/rider` and is unreadable to it |
| G41 | Dead read path | CONFIRMED | `services/vendor.getVendorOrders` — the only match in the repo is its own definition |
| G42 | Single-device truth | PARTIAL | one `localStorage` key per store; inherent to the prototype |
| G43 | Account verification | INCORRECT | `services/auth.register` returns `isVerified: true` unconditionally |
| G44 | Fraud / abuse | MISSING | no representation found |
| G45 | Typed event payloads | INCORRECT | `note: \`delay:${minutes}\``, `\`otp-failed:${attempts}\``, `"refund-requested"` — encoded strings parsed by convention |

Counts: 22 MISSING · 13 PARTIAL · 9 INCORRECT · 1 CONFIRMED (dead code) · 0 COMPLETE · 0 BLOCKED.

#### Audit corrections to the gap analysis

1. **Lint no longer passes.** The gap analysis records `bun run lint` clean. It
   now reports 15 errors + 1 warning, **all** from the untracked
   `frontend/.claude/skills/**/*.cjs` plugin scripts (`no-require-imports`,
   `no-unused-vars`). No application file is implicated. `eslint.config.mjs`
   needs `.claude/**` in its ignore list before any phase can report a truthful
   lint gate. `bun run typecheck` is still clean.
2. **`getRiderProfile` has the same flagship-fallback bug as
   `getDashboardVendor`** (`services/delivery.ts`, ~line 425 region comment says
   so explicitly). Spec §5.3 names only the vendor case; the rider case belongs
   with Phase 7.
3. **`RefundStatus` cannot express Phase 5's lifecycle.** It is
   `none | requested | approved | rejected` — the spec's `refunded/settled`
   terminal state requires extending the union, not just adding UI.
4. **G30 and G38 are not covered by any of the 18 phases.** Both are P2. Flagged
   so they are a deliberate omission rather than an accident.

#### Implementation map (dependency-ordered)

```text
G03                      → order completion            → PHASE 1  (no deps; unblocks everything financial)
G01, G02                 → financial domain            → PHASE 2  (needs G03 as the trigger)
G04, G05, G39, G40       → rider/delivery unification  → PHASE 3  (needs G02 for the earning record)
G06, G14                 → admin order operations      → PHASE 4  (needs G03; benefits from G02)
G07, G25, G26            → refunds/support/disputes    → PHASE 5  (needs G06 surface + RefundStatus ext.)
G08, G09, G12            → vendor onboarding/approval   → PHASE 6  (G09 fixes the §5.3 fallback)
G10, G11, G13            → rider onboarding/approval    → PHASE 7  (needs G40's availability truth)
G16, G17                 → financial surfaces          → PHASE 8  (needs G02)
G19, G20, G21            → menu builder                → PHASE 9  (self-contained)
G18, G22, G23, G24       → restaurant settings/analytics→ PHASE 10 (G24 needs G31; G23 needs shared orders)
G15                      → admin customers             → PHASE 11
G28                      → platform coupons            → PHASE 12
G29                      → review moderation           → PHASE 13
G31                      → RBAC                        → PHASE 14 (retro-applies to phases 4-13)
G32                      → platform audit log          → PHASE 15 (retro-applies to phases 4-13)
G33                      → admin analytics             → PHASE 16 (needs G02, G23)
G34, G35, G36, G37, G43, G27 → customer improvements   → PHASE 17
G41, G42, G44, G45       → consistency/quality         → PHASE 18
(G30, G38)               → unassigned by the v2 spec
```

Key seams identified for the implementation phases:

* **Completion trigger (P1/P2):** `lib/order-machine.transition` `case "completed"`
  is the one place the financial cascade can be stamped; `stores/orders.advance`
  is the one place it can be committed (it already does exactly this pattern for
  the wallet refund, including the replay guard — reuse that shape).
* **Rider unification (P3):** `services/delivery.RiderContext.completed` is the
  existing injection point. A real `Order` can be projected into a
  `DeliveryJob`-shaped record and passed through `ctx`, so earnings/wallet/
  history need no second code path.
* **Availability truth (P3/P7):** `dispatchRider(order, fleet, zoneId)` is the
  single chokepoint — it needs the fleet's shift/approval state as an argument
  rather than `stores/rider` being per-device.
* **Vendor identity (P6):** `services/vendor.getDashboardVendor` is the only
  resolver; removing the fallback there fixes every dashboard surface at once.

#### Demo-data gaps against spec §7

`lib/mock/demo-orders.ts` seeds 14 orders covering placed/confirmed/preparing/
packing/ready/rider-assigned/on-the-way/arrived/completed/rejected/cancelled and
card/cash/wallet. **Absent:** any scheduled order, `delivery-failed`, `returned`,
`refunded`, and every refund state (`requested`/`approved`/`rejected`). No
vendor-status or rider-status variety exists because those fields do not exist
yet. Demo data must be extended alongside Phases 2, 5, 6 and 7 rather than in one
pass at the end.

### Session 2 — PHASE 1: Core Order Completion (G03) (2026-08-19)

`delivered → completed` now has a human actor on three surfaces. Nothing about
the lifecycle graph or the actor table changed — both already permitted it; what
was missing was a caller.

Implemented:

* `customerActions(order)` emits `{ to: "completed", key: "completeOrder" }` at
  `delivered`. The existing `rate` action was demoted from `primary` to `neutral`
  tone so the two do not compete; it is still unrendered (G36, Phase 17).
* `components/orders/complete-order-button.tsx` — one component, three consumers.
  Availability is asked of the machine (`canTransition` + `actorCan`), never
  derived from a status test, so it cannot outlive a change to the graph.
* `components/ui/confirm-dialog.tsx` — the "are you sure?" counterpart to
  `ReasonDialog`, built on the same `Modal` (Escape, backdrop, scroll-lock,
  focus-into-panel). Completion is irreversible, so it is confirmed.
* Customer tracker: a prompt panel at `delivered` ("Got everything?") with the
  completion CTA, above the existing action row.
* Customer order history: the same button on any delivered order, for a customer
  who has navigated away from the tracker.
* Admin ops board: a new **Awaiting completion** section fed by a new
  `awaitingCompletion(orders)` selector. Delivered orders are absent from
  `liveOrders()` by design, so before this they were visible on no admin surface
  at all — which is precisely where every order used to stop.

Idempotency is structural, not defensive: `TRANSITIONS.completed` is `[]`, so a
second completion is refused by the machine with `errors.illegalTransition`.

### Session 3 — PHASE 2: Commission + Settlement (G01, G02) (2026-08-19)

A financial domain, and completion wired to it as the trigger.

New:

* `types/finance.ts` — `OrderCommission`, `OrderRiderEarning`, `OrderFinancials`,
  `VendorSettlement`, `SettlementAdjustment`, `SettlementPayout`,
  `SettlementStatus`, `PlatformFinancials`.
* `lib/settlement.ts` — the whole money domain, pure and mock-free:
  `PLATFORM_COMMISSION_RATES` (per vendor type), `commissionRateFor`,
  `commissionFor`, `settleOrder`, `buildVendorSettlements`, `vendorBalance`,
  `platformFinancials`, `settledOrders`, `settlementId`.
* `lib/dates.ts` — `startOfWeek`, `endOfWeek`, `weekRef`, `weekRefStart`
  (ISO-8601 weeks; settlement periods are weekly, which is what
  `lib/mock/pages.ts` has always claimed).

Model:

* `Vendor.commissionRate: number | null` — a negotiated override; null means the
  standard rate for the vendor's `type`. Always resolved through
  `commissionRateFor`, never read directly. Bella Napoli is seeded at 0.18 so at
  least one vendor is off the standard rate.
* `Order.commissionRate: number` — snapshotted at placement, resolved
  server-side in `services/orders` (the cart carries no rate, so no client can
  send one). A renegotiation changes future orders, never history.
* `OrderLifecycle.financials: OrderFinancials | null` — stamped by the
  `completed` transition, in the machine, alongside the other derived fields.

Commission split follows the money as it actually moves: charged on subtotal less
discount; not on the delivery fee (the platform's), the tip (the rider's) or the
tax (the state's). Every pass-through is still recorded on the commission record
so a statement never re-derives anything from `order.pricing`.

Stored vs derived, deliberately:

* Commissions are **stored** — the rate that applied is a fact about the order.
* Settlements and platform totals are **derived** on demand from those records,
  grouped by the `settlementRef` stored on the order rather than by recomputing
  the week. Nothing that can be derived is stored, so a settlement cannot drift
  from the orders it is made of.

Surfaces (Phase 2's validation, not Phase 8's pages):

* Restaurant overview: an **Earnings** panel — gross, platform commission, net,
  plus this week's pending and the payable balance — derived over the same merged
  order set the KPI cards use, so the two agree by construction.
* Admin ops: a **Money today** strip — gross order value, platform commission,
  restaurants' net — from `platformFinancials`.

Demo data:

* `SeedSpec.closedAgoMin` — how long ago a finished order finished. Without it the
  back-dated event log of any completed order stretched to *now*, so a week-old
  order landed in this week's settlement. Two completed orders were added in the
  previous ISO week, which is what makes a **closed** (payable) settlement period
  exist at all — before this every balance was "pending" and the
  pending/available distinction was undemonstrable.

### Session 4 — PHASE 3: Rider Delivery + Earnings Unification (G04, G05, G39, G40) (2026-08-19)

One delivery reality, and a real delivery that pays.

The prototype had two: a `DeliveryJob` (synthesised, multi-stop — what paid the
rider and filled the wallet) and an `Order` (real — what a customer placed and a
restaurant cooked). They shared no code and no records. A rider could hold one of
each at once, delivering a real customer's food earned nothing, the cash taken at
the door was discarded, and dispatch could hand an order to a rider who had gone
home.

**The bridge goes one way on purpose.** New `lib/delivery-bridge.ts` derives a
`DeliveryJob` *from* an `Order`; the order stays the authority. Nothing is copied
into a second store to drift — ask for a real order's trip and you get one built
from the order as it stands. That is what lets the entire rider app keep running
on `DeliveryJob` while the truth lives on the order, with no screen having to know
which kind of work it is looking at.

New:

* `lib/delivery-bridge.ts` — `jobFromOrder`, `riderEarningFrom`, `jobStatusFor`,
  `cashCarriedOn`, `orderJobId`, `isOrderJob`. Pure; the caller resolves the two
  ends of the ride and passes them in.
* `lib/mock/drop-points.ts` — the per-zone residential geography, extracted from
  the trip synthesiser so a real order's drop and a synthesised one resolve to the
  same coordinates. `dropPointFor(area)` matches a free-text area both ways round.
* `stores/fleet.ts` — the shared availability board: `RiderShift` per rider,
  `isAvailableForDispatch`, `offShiftRiderIds`. One writer (`stores/rider`
  publishes from inside every action that changes availability), so it is a
  projection, not a second copy.
* `components/rider/use-rider-records.ts` — one reading of this rider's reality
  (`ctx`, `hydrated`, `online`, `activeJob`, `activeOrder`, `busy`), shared by six
  screens.
* `components/rider/payout-breakdown.tsx` — the earnings receipt, now shared by
  the synthesised trip and the real order's handoff screen.

Seam:

* `RiderContext.orders` — real orders go in as `Order`s and are converted to trips
  inside `services/delivery`. `resolveHistory` merges real → local → synthesised,
  deduped by trip id, real first. Earnings, today, history, wallet, cash position,
  ledger and remittance liability therefore account for a real delivery through
  *exactly* the same pure functions a synthesised one goes through — none of
  `lib/delivery.ts`'s arithmetic changed.
* `jobForOrder(order, now)` and `riderEarningForOrder(order, now)` — synchronous
  projections, like the existing `nextStopOf`.
* `orderTrips` is keyed by trip id, so the same order appearing twice in a caller's
  context cannot be earned from twice.

G05 — the cash:

* `TransitionPatch.cashCollected` and a new `errors.cashNotConfirmed` guard: a cash
  **delivery** cannot reach `delivered` unless the rider confirms the money changed
  hands. The doorstep dialog had always asked; `submitOtp` dropped the answer.
* Scoped to delivery. A cash *pickup* is paid at the vendor's till by the customer
  standing there — there is no rider's bag for it to be in.
* `cashDueOn(order)` moved into the machine (the guard needs it) and replaced three
  inline copies in the OTP dialog, the live trip screen and the live offer card.
* `cashCarriedOn` in the bridge is the *other* question — "did this order involve
  cash" — which is what the wallet and the remittance liability keep needing after
  the payment flips to paid.

G04 — the earning:

* Resolved in `stores/orders.advance` when `to === "completed"` and the caller has
  not supplied one, so every surface that can close an order produces the same
  number. The payout needs zone fares and route geometry the pure machine cannot
  see; the store injects it exactly as it injects `riders` into `dispatchRider`.
* **Anchored to the handoff, not the reading clock.** Peak pay depends on the hour,
  so deriving a delivered trip's payout from `now` would quietly change what a
  rider was paid on every re-read — and would disagree with the record stamped at
  completion. `payoutAt` uses the `delivered` event time.
* A completed order's trip reuses the payout stored in its financials rather than
  recomputing it. The books do not restate themselves.

G40 — one availability truth:

* `dispatchRider(order, fleet, zoneId, unavailable)` — availability is injected,
  because it spans two stores and `lib/` stays free of both.
* `unavailableRiderIds(orders)` unions the two halves: riders carrying an order
  (the orders store knows) and riders off shift or on a trip of their own (the
  shift board knows). `busyRiderIds(orders)` is now one selector instead of the
  admin board's private copy.
* `assignRider` refuses a rider already carrying something (`errors.riderBusy`) —
  checked in the store, because the restaurant's dialog, a rider taking a live job
  and auto-dispatch can all assign.
* `zoneIdForArea` moved to `lib/mock/delivery-zones.ts` from the orders store, so
  dispatch and the rider app cannot disagree about which zone a drop is in.

Surfaces:

* Rider home — the offer pool pauses for *either* kind of work in hand, and says
  which. `LiveDeliveries` refuses live orders while a synthesised trip is open.
* The shell's active-work bar covers a real order too. Losing a live delivery by
  tapping another tab was the clearest symptom of the two systems' mutual
  ignorance.
* The handoff screen shows what the delivery paid, through the shared receipt.
* Admin fleet board: three states (busy / off shift / free) instead of two. A
  rider who had gone home used to read as "free" while dispatch assigned to them.
* Assign-rider dialog: unavailable riders are shown struck out with the reason —
  handed back, on a delivery, or off shift — rather than silently assignable.

### Session 5 — PHASE 4: Admin Order Operations (G06, G14) (2026-08-19)

The operations desk got the two things it had no code for: a way to find an order,
and a way to do something about it.

`components/admin/live-ops.tsx` had zero `onClick` handlers, so "admin can
intervene" was a claim with nothing behind it, and there was no route where an
order could be looked up at all — the live board shows what is in flight, which is
the wrong shape for the question a support call opens with.

New:

* `app/(admin)/admin/orders` and `.../[id]` — a list and a detail route. A route
  rather than a panel so the notification fan-out can link straight to an order;
  `hrefFor("admin", order)` now returns `/admin/orders/<id>` instead of `/admin`.
* `lib/order-search.ts` — the whole query as one pure predicate: `OrderQuery`,
  `filterOrders`, `matchesOrderText`, `countByGroup`, `inStatusGroup`,
  `rangeStartMs`, plus `ALL_ORDER_STATUSES` / `ORDER_STATUS_GROUPS` /
  `ORDER_DATE_RANGES` as data. No clock, no store, no i18n — callers pass `now`,
  so the same query object can go into a URL, a test, or a `WHERE` clause later.
* `components/admin/orders-view.tsx` — search, six status-group chips with counts,
  and five precise filters (status, payment method, payment state, fulfilment,
  date). Each filter is independent; together they compose.
* `components/admin/order-detail-view.tsx` — customer, restaurant, payment,
  delivery, courier + trip, money, items and the lifecycle timeline, plus the
  intervention controls.

Domain:

* `order-machine.adminActions(order)` — **the intervention controls are the graph.**
  `TRANSITIONS[status]` with each guarded move labelled with what it needs
  collecting (`prompts`), so a new state or a new edge appears on the admin surface
  the moment it is added to the machine and cannot drift from what the machine will
  accept. `actorCan` is not consulted, because `admin` is the exemption the actor
  table already describes.
* `refunded` is deliberately excluded from `adminActions`: money going back has a
  decision behind it, and the bare status transition would return a customer's
  money with no record of who approved it. That is Phase 5's controls.
* `OrderAction.prompts` gained `"cash"` and `"confirm"` — the doorstep cash
  question (the `delivered` guard refuses without it) and a second look at
  anything irreversible.
* `order-lifecycle.stuckReason` / `isStuck` / `stuckOrders` — "needs attention" was
  written twice inside `live-ops.tsx`, once as a filter and once as a label, which
  is two chances for "stuck" to mean two things. One rule, returning a key and a
  number; the sentence stays with the surface. `live-ops` now reads it too, so both
  admin surfaces flag the same orders for the same reasons.
* `stores/orders.reassignRider(id, rider)` — expressed as the two transitions it
  actually is (`ready`, which is the machine's own unassign path, then a fresh
  assignment), so the timeline shows a reassignment as the two events it was and
  nothing writes `lifecycle.rider` directly. That also decides *when* it is
  possible, correctly: `ready` is only reachable from `rider-assigned`, so an order
  can be reassigned while the courier rides to the restaurant and not once the food
  is in the bag. Availability is checked before the release, so a refused
  reassignment leaves the order exactly as it was.

Reuse rather than reinvention: the detail page drives `PrepTimeDialog`,
`ReasonDialog`, `ConfirmDialog`, `AssignRiderDialog`, `OrderTimeline` and
`PayoutBreakdown` — every dialog the restaurant and rider surfaces already use.
`AssignRiderDialog` gained optional `title`/`body` so a reassignment is not
labelled "assign a rider" when one is already on it.

One thing deliberately *not* shown: an order that has not completed has no
commission record, and the money panel says its books are not worked out yet
rather than projecting one. A projected platform take on an in-flight order is the
audit's "fake financial value".

### Session 6 — PHASE 5: Refunds + Support + Disputes (G07, G25, G26) (2026-08-19)

A refund that can be decided, and somewhere for a complaint to go.

**The refund model was wrong, not merely incomplete.** `RefundStatus` ended at
`approved`, so there was no way to say "we agreed to pay this and the money has
actually gone back" — and cancelling a paid order flipped `payment.status`
straight to `refunded`, which told a customer their card had been credited when
nothing had touched it. That was the clearest instance of the audit's fake
financial value, and it is what Phase 5 fixes first.

Refund lifecycle (`types/order.ts`, `lib/order-machine.ts`):

* `RefundStatus` gains the spec's terminal member: `none → requested →
  approved | rejected → refunded`. `RefundMethod` (`wallet | card | cash`) is new.
* `OrderLifecycle` gains `refundMethod`, `refundDecidedAt`, `refundSettledAt` —
  the route, the decision and the money, which are three different facts.
* Ending a paid order now *opens* the refund at `requested` instead of claiming it
  is done: `openRefundOwed` runs in the `rejected` / `cancelled` / `returned`
  cases, and `payment.status` stays `paid` until something settles it.
* `approveRefund` (partial amounts, clamped to the total), `rejectRefund`,
  `settleRefund`, and the guards `isRefundable` / `canDecideRefund` /
  `canSettleRefund`. All pure, all clock-injected, all appending an event.
* `settleRefund` is separate from the `refunded` **status** on purpose: that status
  only exists for an order that ended badly, so a goodwill refund on an order the
  customer received and ate cannot use it without lying about the food. Both routes
  stamp the same fields through one private `stampRefundSettled`, so no consumer
  has to know which one ran.
* `stores/orders.decideRefund` / `settleRefund` — the decision is the machine's;
  the store moves the money. A wallet refund approves and settles in one commit
  because the ledger is ours and there is nothing to wait for; card and cash stop
  at `approved`, which is the honest state.
* The automatic wallet refund on cancellation now goes *through* `decideRefund`
  rather than crediting and advancing on its own, so an automatic refund and one an
  agent granted are the same shape and the same log.
* `platformFinancials` counts a refund when it is `refunded`, not when it is
  `approved` — money out, not money agreed to.
* Store v3 → v4 migrates old devices (`ensureRefundRecord`): a legacy `approved`
  becomes `refunded` (it was only ever written after the wallet was credited), and
  the old instant `payment.status` flip is recorded as settled rather than reopened
  — a migration must not turn a closed refund into a new liability.

Support domain (`types/support.ts`, `lib/support.ts`, `stores/support.ts`):

* `SupportTicket` with an append-only `events` log, the spec's eight categories, a
  six-state status graph (`open → in-review → awaiting-customer →
  resolved | rejected → closed`, reopenable from anywhere) and a `resolution`.
* Built exactly like the order machine: `TICKET_TRANSITIONS` refuses an illegal
  move, `createTicket` / `addMessage` / `moveTicket` / `resolveTicket` /
  `reopenTicket` are pure, and the store commits and emits notifications.
* **Visibility is a property of the event, not of the reader.** An internal note is
  `visibility: "internal"` and is filtered once, in `customerEvents`, so a
  customer-facing surface cannot leak one by forgetting a condition —
  `supportNotifications` drops it too, because a notification is a copy that leaves
  the building.
* A customer reply pulls an `awaiting-customer` ticket back onto the desk; an
  agent's reply does not move the status, because the agent decides where it goes.
* One live ticket per order: a second report about the same dinner continues the
  same conversation instead of opening a second row for one complaint.
* `stores/support.resolve` is the seam that keeps the two halves in step: it writes
  the **order** first and only lets the ticket claim a refund the order accepted.
  A resolution that promises money the order refused is the failure mode that
  would otherwise be one component away.

Surfaces:

* Customer — `ReportProblemDialog` (category + a required sentence) reached from
  the tracker and from order history, `/account/support` and
  `/account/support/[id]` with status, the order, when it was submitted, the
  thread, the resolution and a reply box while the ticket is live. New nav entry.
* Admin — `/admin/support` (queue with live/decided ordering, category filter,
  three KPIs including the longest wait) and `/admin/support/[id]`: the
  conversation beside the order, internal notes, a reply, the decision dialog
  (five outcomes, refund amount, the sentence the customer reads) and
  close/reopen. New nav entry, badged with the live count.
* `RefundControls` is one component used by both the ticket page and the admin
  order page, writing to the same store — so a refund granted from a ticket and
  one granted from the order are one record, not two claims.
* `components/support/ticket-thread.tsx` — one thread renderer for both sides;
  `showInternal` is the only difference.
* The tracker now distinguishes *approved* ("on its way back to your card") from
  *settled*, which the old model could not express.

Demo data:

* `SeedSpec` gains `via`, `endings` and `refund`. The off-path tail is walked as
  the chain it is, so `delivery-failed`, `returned` (failed at the door, then taken
  back) and the terminal `refunded` status exist for the first time — three
  statuses the audit recorded as absent.
* Every `RefundStatus` member is now demonstrable on some order: requested (a
  returned order awaiting a decision), approved (a card refund with the provider),
  rejected, refunded.
* `lib/mock/support-tickets.ts` seeds five tickets — untouched, in review with an
  internal note, awaiting the customer, resolved with a refund, refused. Each is
  built by the domain functions rather than hand-assembled, so a seeded ticket and
  a reviewer's are the same shape, and each attaches to an order whose seeded
  refund record matches the resolution.
* A courier is no longer double-booked by the seed. `courierFor` reserves a rider
  per *live* order, because the store enforces one order per rider and constructed
  seeds have to honour the same rule; finished orders still share couriers, which
  is what a fleet's history looks like.

---

## Current Phase

None in progress. Phases 1–5 complete. Next per the spec: **PHASE 6 — Restaurant
Onboarding + Approval (G08, G09, G12)**, which is not started and needs an
explicit instruction.

---

## Validation

| Gate | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | **PASS** (exit 0, no diagnostics) |
| Lint | `bun run lint` | **PASS** (no findings) — `.claude/**` added to `eslint.config.mjs` ignores, so the gate reports on application code again |
| Build | `bun run build` | **PASS** (all routes compiled) |

### Flows actually exercised

Verified by driving the real modules and the real persisted store (throwaway
harnesses, not committed — 57 domain/seam checks and 37 store checks for Phase 3
alone), plus a dev-server smoke test of every touched route:

| Flow | Result |
|---|---|
| `arrived → delivered → completed` as customer, through `stores/orders.advance` | PASS |
| Completion offered to customer and admin; refused for restaurant and rider | PASS |
| Second completion refused (`errors.illegalTransition`), order byte-identical after | PASS |
| Completion emits a notification through the existing fan-out | PASS |
| Delivered order enters the admin settle queue and leaves the live board | PASS |
| Commission arithmetic: commissionable = subtotal − discount; commission = base × rate; net + commission = base; platform take = commission + delivery fee; gross = order total | PASS |
| Rate snapshot matches the vendor's resolved rate; flagship's negotiated 0.18 honoured; four distinct rates across the catalog | PASS |
| Same order + same instant → identical record (deterministic); an existing record is never overwritten | PASS |
| Every settled order lands in exactly one settlement line; no duplicate vendor+period; each settlement nets out | PASS |
| Only the current ISO week is `open`; a closed period yields an available (payable) balance | PASS |
| Platform commission equals the sum of every settlement; GMV counts completed orders only | PASS |
| v2 → v3 store migration backfills the rate and the commission record on an already-completed order | PASS |
| **Phase 3** — cash delivery refused at `delivered` without confirmation (`errors.cashNotConfirmed`); an explicit "no" refused too; order does not move | PASS |
| Confirming the cash commits the handoff, flips the payment to `paid`, leaves nothing to collect, and still records the note as carried | PASS |
| A prepaid delivery needs no cash confirmation; a cash *pickup* is not gated | PASS |
| A real order yields one trip: two stops, both done once delivered, status `delivered`, the order's *own* OTP on the dropoff, real route distance | PASS |
| Payout lines add to the total; the tip passes through; a single order earns no batch bonus; base fare is the drop zone's | PASS |
| Payout does not move with the reading clock (re-derived 6h later, byte-identical) and the trip id is stable | PASS |
| Completion stores the rider earning without the caller supplying it; it names the courier, matches the trip's payout, and records the cash | PASS |
| A completed order's trip reuses the stored payout instead of recomputing it | PASS |
| A pickup order records no rider earning | PASS |
| Second completion refused; order byte-identical after; commission and earning each exist exactly once | PASS |
| The rider's day, week, wallet, ledger and cash-in-hand all move by exactly the real delivery's payout / cash — through the same functions a synthesised trip uses | PASS |
| The trip number links back to the customer's order number; history contains the delivery exactly once | PASS |
| The same order twice in the context is earned from once; an undelivered order earns nothing | PASS |
| Offer pool: idle+on-shift yields offers; holding work yields none; off shift yields none | PASS |
| Dispatch prefers the drop's zone, skips an unavailable rider, and returns null when nobody is free | PASS |
| Going offline in the rider app reaches the shared board and takes the rider out of auto-dispatch; coming back frees them | PASS |
| Accepting a synthesised trip removes the rider from dispatch; handing it back restores them | PASS |
| A second order for a rider already carrying one is refused (`errors.riderBusy`); a free courier takes it | PASS |
| Dev-server render of `/`, `/admin`, `/dashboard`, `/account/orders`, `/orders/[id]`, `/delivery`, `/delivery/wallet`, `/delivery/earnings`, `/delivery/history`, `/dashboard/orders` | 200, no new errors |
| **Phase 4** — `adminActions` equals `TRANSITIONS[status]` minus `refunded`, for every seeded status | PASS |
| Every action the admin surface offers is accepted by the machine once its prompt is satisfied | PASS |
| A cash delivery is prompted for the cash; a prepaid one only for confirmation; a completed order offers nothing | PASS |
| Empty query matches every order, newest first; payment / payment-state / fulfilment / date / group filters each hold, and compose | PASS |
| Search finds an order by number, customer, courier and area; two words are an intersection | PASS |
| Group counts follow the date window and ignore the group selection | PASS |
| `stuckReason`: a terminal order is never stuck; a fresh `placed` is not, a 6-minute-old one is; `ready` with no courier only after 5 minutes; overdue otherwise | PASS |
| Reassignment: same courier refused, busy courier refused with the order untouched, free courier accepted through two events (`ready:reassigned` → `rider-assigned`), old courier freed | PASS |
| Reassignment refused once the food is collected (`errors.illegalTransition`); the order stays with the courier holding it | PASS |
| A transition the actor table forbids is refused for the rider and accepted for `admin`, with `admin` recorded on the event | PASS |
| **Phase 5** — request → approve → settle: each step stamps its own field, a partial amount is honoured, an over-refund is clamped to the total | PASS |
| Approving does **not** move the money (payment still `paid`); settling flips it and keeps the decision date | PASS |
| A settled refund can be neither re-decided nor re-settled; refusing clears the amount | PASS |
| Cancelling a paid order opens a refund at `requested` with the route resolved, and does not claim the money is back | PASS |
| Cancelling an unpaid cash order opens nothing, and offers the customer no refund request | PASS |
| The `refunded` status and the standalone settle stamp identical fields; settling a completed order leaves its status alone | PASS |
| `platformFinancials` counts a settled refund and ignores an approved-but-unpaid one | PASS |
| Wallet cancellation walks the whole lifecycle in one commit (approved → refunded), credits the wallet exactly once, and leaves nothing to decide | PASS |
| A card refund stops at `approved`, waits, then settles on demand — amount preserved across both steps | PASS |
| Ticket graph: `closed` unreachable from `open`, illegal moves refused, every status reopenable | PASS |
| An internal note is a note, hidden from `customerEvents`, and produces no notification | PASS |
| A customer reply pulls an `awaiting-customer` ticket back to `in-review` | PASS |
| Resolving lands on `resolved`/`rejected` by outcome; reopening clears the resolution and the closure but not the log | PASS |
| A second report on the same order continues the same ticket as a message | PASS |
| Resolving with a refund writes the order first; a refund the order refuses leaves the ticket undecided and the order untouched | PASS |
| Refusing a ticket refuses the refund it was about | PASS |
| Seeded data: five tickets, each on a real order, one order each, every resolution matching its order's refund record, deterministic | PASS |
| Every `RefundStatus` member and the `delivery-failed` / `returned` / `refunded` statuses exist in the working set | PASS |
| No courier is double-booked across the seeded live orders | PASS |
| v3 → v4 migration: legacy `approved` becomes settled, the old instant payment flip is recorded as settled rather than reopened, an untouched order gains nulls only, idempotent | PASS |
| Dev-server render of `/admin/orders`, `/admin/orders/[id]`, `/admin/support`, `/admin/support/[id]`, `/account/support`, `/account/support/[id]` | 200, no new errors |

Not verified: a click-through in a real browser. No browser automation is
available in this environment, so the assertions above drive the store actions the
components call rather than the components themselves. The pre-existing
`[catalog] … fell back to the mock layer` warnings in the dev log are unrelated —
`LIVE.catalog` is on and degrading as designed.

---

## Important Architecture

### Added in Phases 1–2

```text
types/finance.ts
   ↓
lib/settlement.ts          (pure: rates, commission, settlements, platform totals)
   ↓
lib/order-machine.ts       (`case "completed"` stamps the commission record)
   ↓
stores/orders.ts           (commits it; v3 migration backfills old devices)
   ↓
overview-view / live-ops   (consume the domain; compute nothing themselves)
```

* **Completion is the financial trigger.** The commission record is stamped
  inside `transition()`, not by any caller — the same rule that puts the
  promised-ready time and the cash-payment settle there. Four surfaces can
  complete an order and all four produce identical books.
* **`lib/settlement.ts` stays pure.** No clock, no storage, no `lib/mock` import
  — callers pass `now` and the data, exactly as `stores/orders` passes `riders`
  into `dispatchRider`. Phase E swaps those inputs for queries and no consumer
  changes.
* **The rate is resolved at the service layer.** `services/orders` looks it up
  from the vendor at placement; the client never sends it, and `CartVendor` was
  deliberately left alone so no page-built snapshot can carry a stale rate.
* No new store was added. No competing lifecycle or second order model exists.

### Added in Phase 3

```text
lib/mock/drop-points.ts    (one geography for both kinds of trip)
   ↓
lib/delivery-bridge.ts     (pure: Order → DeliveryJob, and its rider earning)
   ↓
services/delivery.ts       (resolves the seed geography; RiderContext.orders)
   ↓                              ↘
stores/orders.ts                   stores/fleet.ts   (shared availability board)
(resolves the earning at            ↑
 completion; unions availability)   stores/rider.ts  (publishes from one write path)
   ↓
use-rider-records.ts       (one reading of the rider's reality, six screens)
```

* **The order is the authority; the trip is derived.** There is no second record
  and nothing to keep in step. `jobFromOrder` is called on demand and is
  deterministic, so a real delivery dedupes against itself by id.
* **One payout formula.** Both kinds of work go through `computePayout`, and a
  completed order's trip reuses the payout stored in its financials — so the
  rider's wallet and the order's books agree by construction, not by two places
  doing similar sums.
* **`statusFromProgress` answers for both.** Its signature was widened to the
  fields it reads, so the bridge asks *it* what an order's stops mean rather than
  writing a second status table.
* **Availability is injected, not looked up.** `dispatchRider` takes an
  `unavailable` set; the union of "carrying an order" and "off shift" is computed
  once in `stores/orders.unavailableRiderIds`. `lib/` stays free of both stores.
* No competing lifecycle was added. Every rider transition still goes through
  `lib/order-machine.transition`; the synthesised trip's own stop-completion rules
  still live in `services/delivery.completeStop`.

### Deliberately deferred (not omissions)

* ~~**`OrderFinancials.riderEarning` is always null.**~~ **Closed in Phase 3** —
  filled by `services/delivery.riderEarningForOrder`, resolved in the store at
  completion. No type or machine change was needed, as Phase 2 predicted.
* **A real order's drop coordinate is its *area's* centre, not its doorstep.**
  `DeliveryAddress` is a postal snapshot with no coordinates, so the geography is
  resolved from the seed's per-area points (`lib/mock/drop-points.ts`), falling
  back to the zone centre for an area the seed does not cover. Stated in the code
  rather than papered over: a fabricated doorstep coordinate would make the paid
  distance look more precise than it is. Phase E geocodes at checkout and every
  caller keeps working.
* **A rider with no shift record is treated as available.** Only one rider has a
  device in this demo, so holding the seeded fleet to a shift they can never clock
  into would leave dispatch with nobody to pick. A rider who *has* signed on is
  held to what they said — going offline removes them from the pool. The rule is
  documented on `isAvailableForDispatch`.
* **The zone cash limit is not yet enforced against real orders.** The wallet warns
  and the home screen nudges, as before; refusing work over the limit is G44
  (fraud/abuse, P3), not Phase 3's list.
* **No `services/finance.ts` yet.** Phase 2's two readouts consume `lib/settlement`
  directly, the way the overview already consumes `lib/analytics`. The seam
  belongs with its first real consumers — the restaurant earnings page and the
  admin payout run, both Phase 8. Adding it now would have created a second
  unused read path beside the one G41 already flags.
* **`SettlementStatus` reaches `pending`, never `processing`/`paid`.** Both
  require a payout run, which is Phase 8. `buildVendorSettlements` already
  accepts `payouts` and `adjustments` and projects the status from them, so
  Phase 8 supplies data rather than changing logic.

* **A cash refund settles by hand.** `RefundMethod` includes `cash` and the desk
  marks it returned; there is no cash-out ledger, because the platform does not
  hold the rider's float in this prototype. Stated rather than automated.
* **Wallet credit as an outcome is recorded, not paid.** `SupportOutcome.credited`
  writes the resolution; issuing an actual promotional credit is Phase 12's coupon
  machinery, and crediting the wallet here would be a second, unreconciled way of
  giving money back.
* **A ticket has no assignee.** The spec's admin list does not ask for one, and a
  queue with an owner column nobody sets is worse than none. `RBAC` (Phase 14) is
  where "who may work this" gets decided.
* **`SupportTicket` is not attached to a customer id.** The prototype has one
  customer account per device and the ticket snapshots the name and phone off the
  order, exactly as an order snapshots its vendor. Phase 11 (admin customers) is
  where a customer's ticket history needs the join.

### Preserved

Confirmed intact and to be preserved:

```text
types/*  →  lib/mock/*  →  services/*  →  stores/*  →  components/routes
```

* `lib/order-machine.ts` is genuinely the single lifecycle authority: 16
  statuses, a transition *graph*, per-actor `ACTORS` table, guards (cancel
  window, OTP reveal, 3-attempt lockout), and derived action lists. No file in
  the repo assigns `order.status` directly.
* `stores/orders.ts` is the one persisted store all four surfaces read/write;
  `advance()` is the only mutation path and it already emits notifications and
  performs a guarded follow-on transition (the wallet refund) — the template for
  Phase 2's financial cascade.
* `lib/notifications.ts` has an explicit four-audience fan-out table with a
  `completed` entry already present.
* Feature flags: every `config/backend.ts` `LIVE.*` flag defaults off, so the mock
  layer serves everything and each service already has a GraphQL branch behind it.
  Note for anyone reproducing: the untracked `.env.local` on this machine turns on
  `BACKEND_AUTH` and `BACKEND_CATALOG` with `BACKEND_FALLBACK=1`, which is why the
  dev log carries `[catalog] … fell back to the mock layer` warnings when no API is
  running. `BACKEND_ORDERS=0`, so the order path Phases 1–3 touch is the mock one.

### Added in Phase 4

```text
lib/order-search.ts        (pure: one query, one predicate)
lib/order-machine.ts       (`adminActions` — the graph, as controls)
lib/order-lifecycle.ts     (`stuckReason` — one attention rule, two surfaces)
   ↓
components/admin/orders-view.tsx        → /admin/orders
components/admin/order-detail-view.tsx  → /admin/orders/[id]
   ↓
stores/orders.reassignRider (two transitions, never a field write)
```

### Added in Phase 5

```text
types/support.ts + types/order.ts (RefundStatus/RefundMethod)
   ↓
lib/order-machine.ts       (refund lifecycle: approve / reject / settle + guards)
lib/support.ts             (pure: ticket graph, constructors, visibility filter)
   ↓
stores/orders.decideRefund / settleRefund   (the money — one writer)
stores/support.ts          (tickets; `resolve` writes the order first)
   ↓
components/admin/refund-controls.tsx   (shared: order page + ticket page)
components/support/ticket-thread.tsx   (shared: customer + desk)
   ↓
/account/support · /admin/support
```

* **The order remains the only record of money.** A ticket records a refund
  decision; `order.lifecycle.refund` *is* the refund. `stores/support.resolve`
  writes the order first and lets the ticket claim only what the order accepted.
* **Refund states are three separate facts.** Route (`refundMethod`), decision
  (`refundDecidedAt`) and money (`refundSettledAt`). Collapsing them is what made
  the old model announce a card refund the instant an order was cancelled.
* **Internal notes are filtered once.** `customerEvents` and
  `supportNotifications` are the two exits, and both check the event's own
  `visibility` rather than trusting the caller.
* **No second lifecycle.** Every order move still goes through
  `lib/order-machine.transition`; the ticket graph governs tickets only, and
  nothing in `lib/` reads a store.

No architectural violations were introduced in Phases 1–5.

---

## Next Phase

**PHASE 6 — Restaurant Onboarding + Approval (G08, G09, G12).** Not started; needs
an explicit instruction.

What Phases 1–5 leave ready for it:

1. `Vendor` still has no status field, and `services/vendor.getDashboardVendor`
   still falls back to the flagship vendor for any management account (§5.3). That
   fallback is the first thing Phase 6 has to remove, and doing so fixes every
   dashboard surface at once.
2. `/admin/restaurants` does not exist. `/admin/orders` is the template: a pure
   query module (`lib/order-search.ts`'s shape), a list component holding a query
   object, and a detail route with the domain's own action list as controls.
3. The approve/reject pattern now exists twice — the refund lifecycle and the
   ticket graph — and both are the same shape a vendor application needs: a status
   graph in `lib/`, guards asked rather than statuses tested, an append-only log,
   and a store action that commits and notifies.
4. `lib/notifications` has an explicit four-audience fan-out; a vendor application
   changing state needs an entry there rather than an ad-hoc message.
5. Demo data will need vendor-status variety, which `SeedSpec`'s pattern in
   `lib/mock/demo-orders.ts` and `lib/mock/support-tickets.ts` now demonstrates:
   seed the states through the domain's own constructors, not by hand.
