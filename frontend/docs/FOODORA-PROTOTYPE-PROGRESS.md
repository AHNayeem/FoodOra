# FoodOra Prototype Progress

Tracks execution of `GAP - Implement v2.md`. Updated at the end of every session.

---

## Completed Phase

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

---

## Current Phase

None in progress. Phases 1 and 2 complete. Next per the spec: **PHASE 3 — Rider
Delivery + Earnings Unification (G04, G05, G39, G40)**.

---

## Validation

| Gate | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | **PASS** (exit 0, no diagnostics) |
| Lint | `bun run lint` | **PASS** (no findings) — `.claude/**` added to `eslint.config.mjs` ignores, so the gate reports on application code again |
| Build | `bun run build` | **PASS** (all routes compiled) |

### Flows actually exercised

Verified by driving the real modules and the real persisted store (throwaway
harnesses, not committed), plus a dev-server smoke test of every touched route:

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
| Dev-server render of `/`, `/admin`, `/dashboard`, `/account/orders`, `/orders/[id]` | 200, no new errors |

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

### Deliberately deferred (not omissions)

* **`OrderFinancials.riderEarning` is always null.** The shape is final and reuses
  `DeliveryPayout`, so there is one payout formula rather than two — but a payout
  needs trip geometry (route distance, zone, peak hour) that the order does not
  carry. Filling it is G04, which is Phase 3's assigned gap. `TransitionPatch`
  already accepts `riderEarning`, so Phase 3 hands it in and nothing else moves.
* **No `services/finance.ts` yet.** Phase 2's two readouts consume `lib/settlement`
  directly, the way the overview already consumes `lib/analytics`. The seam
  belongs with its first real consumers — the restaurant earnings page and the
  admin payout run, both Phase 8. Adding it now would have created a second
  unused read path beside the one G41 already flags.
* **`SettlementStatus` reaches `pending`, never `processing`/`paid`.** Both
  require a payout run, which is Phase 8. `buildVendorSettlements` already
  accepts `payouts` and `adjustments` and projects the status from them, so
  Phase 8 supplies data rather than changing logic.

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
  running. `BACKEND_ORDERS=0`, so the order path Phases 1–2 touch is the mock one.

No architectural violations were introduced this session.

---

## Next Phase

**PHASE 3 — Rider Delivery + Earnings Unification (G04, G05, G39, G40).**

What Phases 1–2 leave ready for it:

1. `TransitionPatch.riderEarning` and `OrderFinancials.riderEarning` are typed and
   wired — Phase 3 computes a `DeliveryPayout` for the real order and passes it to
   `advance(id, "completed", …)`. No type or machine change needed.
2. `OrderRiderEarning.cashCollected` is the field the discarded `cashCollected`
   flag (G05) belongs in.
3. `services/delivery.RiderContext.completed` remains the injection point for
   bridging a real `Order` into the rider's earnings/wallet/history without a
   second code path.
4. `dispatchRider(order, fleet, zoneId)` is still the single dispatch chokepoint
   for G40's availability truth.
