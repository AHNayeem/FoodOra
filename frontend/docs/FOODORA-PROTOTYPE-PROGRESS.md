# FoodOra Prototype Progress

Tracks execution of `GAP - Implement v2.md`. Updated at the end of every session.

---

## Completed Phase

- Phase 0 — Audit Done
- Phase 1 — Core Order Completion Done
- Phase 2 — Commission + Settlement Done
- Phase 3 — Rider Delivery + Earnings Done
- Phase 4 — Admin Order Operations Done
- Phase 5 — Refunds + Support + Disputes Done
- Phase 6 — Restaurant Onboarding + Approval Done
- Phase 7 — Rider Onboarding + Approval Done
- Phase 8 — Restaurant Financials + Admin Payouts Done
- Phase 9 — Restaurant Menu Builder Done

---

## Audit reference (Phase 0, 2026-08-19)

Kept because the remaining phases are planned off it. The per-phase write-ups for
Phases 1–7 were removed; the architecture each of them left behind is recorded
under *Important Architecture* below.

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
   with Phase 7. **Both closed in Phases 6–7** — each now returns null and the
   shells say so.
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
pass at the end. **Closed for vendor and rider status in Phases 6–7**
(`lib/mock/vendor-applications.ts`, `lib/mock/rider-applications.ts`); scheduled
orders remain absent (Phase 17).

**Phase 8 closed the rider half of the seeded books** rather than by adding a seed
file: `stores/orders.withRiderEarning` fills a completed delivery's
`OrderRiderEarning` at seed and on the v4 → v5 migration, using the same
`services/delivery.riderEarningForOrder` the real `completed` transition calls.
So the courier payout list has real data without a second, hand-written set of
payout numbers to keep in step with the fare rules.

---

## Current Phase

None in progress. Phases 1–9 complete. Next per the spec: **PHASE 10 — Restaurant
Settings + Staff + Handover + Analytics (G18, G22, G23, G24)**, which is not
started and needs an explicit instruction.

---

## Validation

| Gate | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | **PASS** (exit 0, no diagnostics) |
| Lint | `bun run lint` | **PASS** (no findings) — `.claude/**` added to `eslint.config.mjs` ignores, so the gate reports on application code again |
| Build | `bun run build` | **PASS** (all routes compiled) |

### Flows actually exercised

Verified by driving the real modules and the real persisted store (throwaway
harnesses, not committed — 156 domain checks and 58 store checks for Phases 6–7,
57 domain/seam checks and 37 store checks for Phase 3), plus a dev-server smoke
test of every touched route:

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
| **Phase 6** — vendor graph: `draft → pending → approved` or `rejected`, `rejected → pending`, `approved → suspended → approved`; `approved → rejected` and `draft → approved` refused | PASS |
| `canManageVendor` / `isVendorLive` are true for `approved` and nothing else, over the whole union | PASS |
| A refusal or a suspension with no reason is refused (`errors.decisionReasonRequired`) and the record is left byte-identical | PASS |
| A refusal stamps the reason, the reviewer and the date, and appends an event; an approval clears the reason but keeps the log | PASS |
| Approval refused over a missing, a refused, or a lapsed required document (`errors.applicationIncomplete`); optional documents never block | PASS |
| `isDocumentValid` reads the clock rather than the stored status — a certificate verified last year and expired last month is invalid | PASS |
| A document review sets one document, leaves the rest alone, is logged as a `document` event, and does not move the application | PASS |
| An edit applies its patch, leaves untouched sections identical, is logged, and does not move the status | PASS |
| A refused application can be corrected and re-submitted through the *same* record; no second record is opened, and the whole history survives | PASS |
| Per-step validation: a blank draft reports on every step; a complete one on none; the review step re-runs all of them | PASS |
| An all-closed week, a reversed ETA range, delivery with no zone, and "neither delivery nor pickup" are each refused; pickup-only needs no zone | PASS |
| Payout: a bank transfer requires a branch, a mobile wallet does not | PASS |
| Approval mints the listing: named and slugged from the application, owned by the applicant, rating/reviews zero, not featured, standard commission rate, deterministic | PASS |
| A second approval is refused and mints nothing further | PASS |
| `getDashboardVendor` returns the owner's own restaurant, and **null** for an account that owns none — customer and admin accounts included (no flagship fallback, §5.3) | PASS |
| Applying twice from one account continues the same application and logs an edit; approving it opens *that* account's dashboard | PASS |
| Seeded data: every catalog listing has exactly one record, no two records claim one listing, four brand-new applications, every vendor status demonstrable, deterministic | PASS |
| The demo dashboard's restaurant stays approved and keeps its owner; the suspended seed carries a reason | PASS |
| **Phase 7** — rider graph adds `inactive`: `approved ↔ inactive`, `inactive → suspended`, `suspended → approved`; `approved → rejected` refused | PASS |
| `canDispatchToRider` is true only for `approved`; `canUseRiderApp` also admits `inactive` and `suspended` | PASS |
| `deactivate` needs no reason; `reject` and `suspend` do | PASS |
| Required documents follow the vehicle: a bicycle needs only an ID and is approvable on one; anything motorised needs a licence and is refused without it | PASS |
| A motorised application without a plate or a licence number is refused at the vehicle step | PASS |
| An emergency contact equal to the rider's own number is refused; so is an applicant under 18 or an unparsable birth date | PASS |
| Approval mints the fleet record: name, plate and zone carried, zero trips, neutral rating, profile photo dropped from the fleet document shape, deterministic | PASS |
| A newly approved courier appears on the fleet board and dispatch can pick them | PASS |
| Dispatch skips a suspended and a deactivated rider in their own zone and still finds somebody there; it returns null only when the whole fleet is blocked | PASS |
| Deactivating that courier blocks them again, and produces its own message rather than a suspension's | PASS |
| `getRiderProfile` returns the account's own rider and **null** otherwise (no flagship fallback, §5.3) | PASS |
| Seeded data: every fleet member has exactly one record, every rider status demonstrable, each zone keeps at least one dispatchable courier, deterministic | PASS |
| The seeded applications' documents are projected from `Rider.documents`, so Jamil's expired insurance is the same fact on both records | PASS |
| Search/filter (both queues): pending first and oldest-first, decided newest-first; text is an intersection over reference, people, licence, TIN, plate and phone; status, `awaitingOnly` and date window each hold | PASS |
| Status counts follow the search and the date window and ignore the status selection | PASS |
| Notifications: a submission reaches the applicant and the right admin queue; an approval links to the dashboard or the rider app; a refusal carries its reason; a draft or an edit notifies nobody | PASS |
| A demo reset drops the device-minted listings and fleet records and restores both seeded queues | PASS |
| Dev-server render of `/partner`, `/partner/apply`, `/rider`, `/rider/apply`, `/admin/restaurants`, `/admin/riders`, `/admin/restaurants/[id]`, `/admin/riders/[id]`, `/register`, `/dashboard`, `/delivery` | 200, no new errors |
| Every `t()` key the new surfaces use exists in `en`, and `bn`/`ar` carry an identical key set (0 shape differences) | PASS |

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

### Added in Phases 6–7

```text
types/onboarding.ts        (one application shape; `Vendor`/`Rider` gain no status field)
   ↓
lib/onboarding.ts          (pure: the shared paperwork — log, documents, payout, validators)
lib/vendor-onboarding.ts   (pure: the restaurant graph, guards, mint-a-listing)
lib/rider-onboarding.ts    (pure: the rider graph incl. `inactive`, mint-a-fleet-record)
lib/onboarding-search.ts   (pure: one query, one predicate, both queues)
   ↓
lib/mock/vendor-applications.ts · lib/mock/rider-applications.ts
   ↓
stores/onboarding.ts       (the single authority; mints on approval; emits notifications)
   ↓                                    ↘
services/vendor.getDashboardVendor       stores/orders.unavailableRiderIds
services/delivery.getRiderProfile/getFleet   (+ dispatchableFleet)
   ↓                                    ↘
components/onboarding/*    (shared: chip · log · documents · filters · stepper)
   ↓
/partner/apply · /rider/apply · /admin/restaurants · /admin/riders
```

* **One lifecycle per side, and the application carries it.** `Vendor` and `Rider`
  deliberately gain no status field: a copy on the catalog row would be a second
  answer to "is this restaurant live", and the two would disagree inside a session.
  The seed builds a record for every catalog listing and every fleet member, so
  there is no default to fall back to — `vendorStatusFor` returning null is a real
  answer, not a gap, and every caller gates on it explicitly.
* **The two silent fallbacks are gone (§5.3).** `getDashboardVendor` and
  `getRiderProfile` return null for an account that owns nothing, and the shells say
  so — showing the applicant where their application stands when there is one.
  Both take the device-minted records as an *injected* argument, the same seam
  Phase 3 used for rider availability, so no service reads a store.
* **Approval mints what it promises.** An application with no listing gets one at
  the moment it is approved, and a rider application gets a fleet record — otherwise
  "approved" would be a status with nothing behind it. The mint invents no numbers:
  rating, reviews, trips and acceptance rate all start at zero or neutral, because
  dispatch *ranks* on those and a seeded 4.5 would be §5.4's fake value.
* **Onboarding reaches dispatch through the existing chokepoint.**
  `stores/orders.unavailableRiderIds` now unions three facts — carrying an order,
  off shift, not cleared to work — and `dispatchRider`'s signature is unchanged.
  The manual assign dialog reads the same set, so the hand-picked path cannot offer
  work the automatic path would refuse.
* **Every reviewer control is derived from the graph.** `/admin/restaurants/[id]`
  and `/admin/riders/[id]` read `VENDOR_TRANSITIONS` / `RIDER_TRANSITIONS` rather
  than listing buttons, the way Phase 4's order page reads `adminActions` — so a
  screen can never offer a move the domain refuses.
* **A refusal or a suspension must carry a reason**, enforced in
  `decideVendorApplication` / `decideRiderApplication` rather than in the dialogs,
  and an approval cannot be granted over a missing, refused or lapsed required
  document. The clock is consulted for expiry, because a certificate is still
  stored as `verified` after it lapses.
* **One record per applicant.** Applying twice — or fixing a refusal and applying
  again — continues the same application (`rejected → pending` exists for exactly
  that), so the platform never holds two records of one restaurant or one courier.
* **No second lifecycle, no second store.** Nothing in `lib/` reads a store, the
  order machine is untouched, and the two onboarding collections live in one store
  because onboarding is one domain with two entities.

No architectural violations were introduced in Phases 1–7.

---

## Next Phase

**PHASE 8 — Restaurant Financials (G16, G17).** Not started; needs an explicit
instruction.

What Phases 1–7 leave ready for it:

1. `lib/settlement.ts` is already pure and clock-injected, and
   `buildVendorSettlements` already accepts `payouts` and `adjustments` and projects
   `SettlementStatus` from them — so Phase 8 supplies data rather than changing
   logic. `SettlementStatus` still only ever reaches `pending`.
2. **`PayoutAccount` now exists**, on every restaurant's and rider's application
   (`types/onboarding.ts`), collected by the two application forms and visible to a
   reviewer. A payout run has somewhere to send money to.
3. There is still **no `services/finance.ts`** — deliberately, as Phase 2 recorded.
   Phase 8 is where the seam belongs, because the restaurant earnings page and the
   admin payout run are its first two real consumers.
4. `/admin/restaurants` and `/admin/riders` are the template for a payout-run
   surface: a pure query module, a list holding one query object, and a detail route
   whose controls are the domain's own action list.
5. `stores/onboarding` is the pattern for a payout store: one authority, mutations
   only through `lib/`, an append-only log, and notifications emitted on commit.

---

## Deliberately deferred by Phases 6–7 (not omissions)

* **A suspended *seeded* restaurant still appears in discovery.** The dashboard is
  gated — which is what the spec asks for, so it cannot accept orders — but
  `services/catalog` is a server-shaped async read and the onboarding record is a
  client store, so the storefront listing is not filtered. Stated rather than
  half-fixed: adding a status field to `Vendor` purely so the catalog could filter
  it would create the second source of truth this phase exists to avoid. Phase E
  resolves both from one query.
* **A device-minted listing is not discoverable.** An approved brand-new restaurant
  gets a `Vendor` record and a dashboard, but it is not in the static catalog and has
  no menu, so it could not fulfil an order anyway. Its logo and cover are empty
  strings rather than a stock photograph of somebody else's restaurant.
* **Branches are recorded, not listed.** `Vendor` has one `location`, so an
  additional outlet lives on the application. A second listing sharing one menu
  would be a branch a customer could order from and nobody could fulfil.
* **Documents are references, not files.** There is no file storage in the
  prototype, so a document is recorded by its reference number and the form says so
  on screen. A file picker that appears to accept a PDF and keeps nothing is the
  kind of decoration this prototype is meant not to have.
* **`super-admin` no longer gets a restaurant dashboard.** It is in
  `MANAGEMENT_ROLES` and owns no vendor, so `/dashboard` now shows "no restaurant on
  this account" instead of the flagship's books. That is the §5.3 fix working, not a
  regression — the admin surfaces are `/admin/*`.
* **An application has no assignee, and no per-reviewer permissions.** RBAC is
  Phase 14; a queue with an owner column nobody sets is worse than none, and the
  same reasoning applied to support tickets in Phase 5.
* **Rider onboarding does not touch the shift board.** Suspending a rider removes
  them from dispatch through `unavailableRiderIds`; it does not force their shift
  off, because the shift is a statement about the rider and the suspension is a
  statement about the platform. Both are read together at the one chokepoint.
