# FoodOra Prototype Gap Analysis

Repository-level audit of the frontend prototype (`frontend/`) as it stands on
2026-08-18 (branch `master`, HEAD `3f17830`). Read-only: no application code was
changed. Every claim below was verified against the file cited.

Supersedes nothing — `ORDER-LIFECYCLE-AUDIT.md` describes the state *before* the
lifecycle work, and most of its findings are now closed. This document records
what is still open.

---

## A. Current System Summary

**Stack.** Next.js 16 App Router / React 19 / TypeScript strict, Tailwind 4,
Zustand (persisted, `skipHydration` + explicit rehydrate everywhere), next-intl
with 3 locales (`en`/`bn`/`ar`) and RTL, Apollo GraphQL client behind per-slice
`LIVE.*` feature flags that default to **off** so the mock layer serves
everything (`config/backend.ts`).

**Layering is consistent and worth preserving.** `types/*` (domain models) →
`lib/mock/*` (deterministic, PRNG-seeded fixtures, clock passed in) →
`services/*` (async `Result<T>` seam, one file per domain) → `stores/*`
(persisted client state) → components. Replacing a mock with the backend touches
one layer.

**The order lifecycle is genuinely centralised.** `lib/order-machine.ts` owns 16
statuses, a transition *graph* (not a list), per-actor permissions, guards
(cancel window, OTP reveal, OTP lockout after 3 attempts) and derived
action lists (`restaurantActions` / `riderActions` / `customerActions`). Nothing
sets `status` directly. `stores/orders.ts` is a single persisted store all four
surfaces read and write, so accepting an order in the dashboard moves the
customer's tracker in another tab. `lib/notifications.ts` has an explicit
four-audience fan-out table and every committed transition emits through it.
`components/demo/demo-engine.tsx` + `lib/order-sim.ts` provide an autopilot that
plays absent actors through the *same* store action a human tap uses.

**Implemented and working:**

| Role | Working today |
|---|---|
| Customer | Discovery (directory, cuisines, categories, cafes/cloud-kitchens/home-chefs verticals), search with facets + sort, vendor page with sectioned menu, item customiser with option groups, single-vendor cart with conflict dialog, coupon engine, checkout (fulfillment, address book, scheduled slots, tip, tax, delivery-fee waivers, card/cash/wallet, simulated decline on card ending `0000`), order confirmation/receipt, event-driven live tracking with OTP reveal at the door, cancel with reason, refund request, order history, reviews with media, favorites, wallet ledger, coupon wallet, subscriptions/meal plans, reservations, catering quotes, QR dine-in, AI assistant, notification feed + browser push, settings with notification preferences |
| Restaurant | Live order board driven by the shared store (accept with prep time, reject with reason, preparing → packing → ready, "need more time", auto/manual dispatch, cancel with reason), kitchen queue, menu list with 86-ing, coupon issuing, review replies, reservations desk, POS Lite, QR menu builder, overview KPIs (live-merged) + charts |
| Rider | Shift toggle, real-order pool from the store (`LiveDeliveries`), real-order run (`LiveTripView`: collect → ride → arrive → OTP → delivered, with failure/return branch), synthesised multi-stop trips with real route optimisation, haversine distance, per-vehicle timings, peak/batch payout rules, earnings, wallet with cash-in-hand and remittance, trip history, profile with documents |
| Admin | Live operations board (in-flight orders, "stuck" detection, vendor load, fleet status, today's revenue — all derived from the shared store), CMS (collections, drafts, audit log, route metadata), notification broadcast composer |
| Shared | Order state machine, notification fan-out, demo autopilot + reset, 3 locales, theming, a11y baseline, error/not-found boundaries, route-level loading skeletons |

**Quality gates:** `bun run typecheck` → clean (exit 0). `bun run lint` → clean
(no findings).

---

## B. Missing / Incomplete Features

| ID | Area | Module | Missing / Problem | Current Status | Priority | Dependencies |
| -- | ---- | ------ | ----------------- | -------------- | -------- | ------------ |
| G01 | Core | Commission | No commission model exists anywhere — no rate on `Vendor`, no `commission` on `Order`, no platform take. `lib/mock/pages.ts:43` markets "Commission is published, payouts land weekly", which nothing implements | Missing | P0 | G02, G03 |
| G02 | Core | Settlement | The spec's final lifecycle step ("earnings/commission/settlement updated") has no representation. `completed` sets nothing financial (`lib/order-machine.ts:392`) | Missing | P0 | G01 |
| G03 | Core | Order completion | `delivered → completed` is only ever driven by the demo autopilot (`lib/order-sim.ts:62`). With autopilot off, no surface can complete an order — `advance(…, "completed", …)` has no call site outside `demo-engine.tsx:67` | Broken | P0 | — |
| G04 | Rider | Earnings ↔ real orders | Completing a real order never touches rider money. `LiveTripView` never calls `useRider.finishJob`, and earnings/wallet/history are built purely from `DeliveryJob` records (`services/delivery.ts:486,413,442`). A real delivery earns nothing | Inconsistent | P0 | G03 |
| G05 | Rider | Cash collection | `submitOtp` receives `cashCollected` and discards it (`components/rider/live-trip-view.tsx:142`). Cash taken at a real doorstep never reaches cash-in-hand or the remittance ledger | Broken | P0 | G04 |
| G06 | Admin | Order intervention | The admin surface is entirely read-only — `components/admin/live-ops.tsx` contains no button or handler. No manual rider assignment, no force-cancel, no unstick, despite `actorCan` granting `admin` every transition (`lib/order-machine.ts:207`) | Missing | P0 | — |
| G07 | Admin | Refund management | Nothing can approve or reject a refund. `RefundStatus` has `approved`/`rejected` (`types/order.ts:177`) but only the wallet path ever settles, automatically (`stores/orders.ts:177`). A cash/card refund request sits at `requested` forever | Broken | P0 | G06 |
| G08 | Restaurant | Onboarding / application | `/partner` is a marketing pitch page linking to `/register`. No application form, no document upload, no business details capture | Missing | P0 | G09 |
| G09 | Restaurant | Approval / rejection | `Vendor` has no lifecycle status field at all (`types/catalog.ts` — no `pending`/`approved`/`rejected`/`suspended`). Consequence: `getDashboardVendor` falls back to the flagship vendor for *any* management account (`services/vendor.ts:34`), so a newly registered owner manages somebody else's restaurant | Missing | P0 | G08 |
| G10 | Rider | Onboarding / application | `/rider` is a pitch page. `RegisterInput.role` only accepts `customer \| restaurant-owner` (`services/auth.ts:57`) — a rider cannot sign up. `getRiderProfile` matches an existing seeded rider by `userId` or returns null | Missing | P0 | G11 |
| G11 | Rider | Approval / activation | `Rider` has documents with `verified/pending/expired` (`types/delivery.ts:60`) but no rider-level approval state, and `profile-view.tsx:239` renders documents read-only. No upload, no submit, no approval | Partial | P0 | G10 |
| G12 | Admin | Restaurant management | No route. No vendor list, detail, suspend, or edit | Missing | P0 | G09 |
| G13 | Admin | Rider management | No route. No fleet list, document review, activate/deactivate | Missing | P0 | G11 |
| G14 | Admin | Orders management | No orders route. `liveOrders()` exists and is commented "the admin's live board" (`stores/orders.ts:340`) but only feeds the read-only KPI page; there is no order list, filter, detail, or lifecycle intervention | Missing | P0 | G06 |
| G15 | Admin | Customer management | No route. No user list, detail, block, or order-history view | Missing | P1 | — |
| G16 | Restaurant | Earnings / payouts | No earnings page, no payout/settlement view, no commission statement. Only order revenue KPIs on the overview | Missing | P1 | G01, G02 |
| G17 | Admin | Payout / settlement | No route, no ledger, no payout runs for either vendors or riders | Missing | P1 | G02 |
| G18 | Restaurant | Profile / hours / branches | No dashboard settings page. `components/vendor/opening-hours.tsx` only *renders* hours on the storefront; `WeeklyHours` is not editable. No multi-branch model — `Vendor` has one `location` | Missing | P1 | G09 |
| G19 | Restaurant | Menu authoring | `MenuManager` is a read-only list with an availability toggle; the file states "Full item authoring — the Menu Builder — lands in a later phase" (`components/dashboard/menu-manager.tsx:22`). No create/edit/delete of sections, items, prices, or option groups | Partial | P1 | — |
| G20 | Restaurant | Add-ons / variants | `FoodOptionGroup` is consumed correctly by the customiser but has no authoring surface | Missing | P1 | G19 |
| G21 | Restaurant | Inventory | Availability is binary only (`merchant.unavailable[]`). No stock counts, no auto-86 on depletion, no low-stock warning | Missing | P2 | G19 |
| G22 | Restaurant | Handover verification | Spec §8 asks the restaurant to verify the order at handover; `restaurantActions` offers a plain `handToRider` with no code or checklist (`lib/order-machine.ts:547`) | Partial | P1 | — |
| G23 | Restaurant | Analytics | Revenue, peak-hours and best-seller charts read only the synthesised week (`services/vendor.ts:64`); real store orders are merged into the KPI cards but not the charts (`components/dashboard/overview-view.tsx:117`). No date-range picker, no export | Mocked but incomplete | P2 | — |
| G24 | Restaurant | Staff / roles | No staff management. `User.permissions` exists and mock users carry slugs (`lib/mock/users.ts:40`) but nothing reads them | Missing | P2 | G31 |
| G25 | Customer | Support / disputes | `/help` is static FAQ + `mailto:` (`app/(marketing)/help/page.tsx:72`). No ticket creation, no order-level "report a problem", no dispute thread | Missing | P1 | G26 |
| G26 | Admin | Support / disputes | No route, no queue, no dispute resolution — despite `customer-support` being an admitted admin role (`components/admin/admin-shell.tsx:31`) | Missing | P1 | G25 |
| G27 | Customer | Rider/restaurant contact | Call and message buttons on the tracker are toast stubs (`components/tracking/order-tracking.tsx:522,530`). No chat thread, no call log | Partial | P2 | G25 |
| G28 | Admin | Coupon / offer management | Coupons can be issued by a restaurant (`stores/merchant.addCoupon`) but there is no platform-level campaign management, no approval, no performance view | Missing | P2 | — |
| G29 | Admin | Reviews / reports | No moderation queue, no report handling, despite `moderator` being an admitted role | Missing | P2 | — |
| G30 | Admin | Platform settings | No settings route. Tax rates, delivery-fee rules and zone parameters are hard-coded in `config/regions.ts` and `lib/mock/delivery-zones.ts` | Missing | P2 | G01 |
| G31 | Admin | RBAC | Gating is role-list membership only (`ADMIN_ROLES` in `admin-shell.tsx:30`, `MANAGEMENT_ROLES` in `dashboard-shell.tsx`, `RIDER_ROLES` in `rider-shell.tsx`). `User.permissions` is never checked anywhere; there is no permission helper and no per-section gating | Partial | P1 | — |
| G32 | Admin | Audit log | Exists for CMS only (`services/cms.ts:247`). No platform-wide audit trail; order transitions are logged per-order in `lifecycle.events` but never aggregated | Partial | P2 | G06 |
| G33 | Admin | Analytics / reports | Only today's KPI strip on the ops page. No trends, cohorts, vendor/rider league tables, or export | Missing | P2 | G23 |
| G34 | Customer | Scheduled orders | `scheduledFor` is captured at checkout and displayed (`components/checkout/order-confirmation.tsx:128`) but nothing gates the lifecycle on it — a scheduled order enters `placed` immediately and the board/autopilot treat it as ASAP | Partial | P1 | — |
| G35 | Customer | Reorder | The "reorder" button is a link to the vendor page (`components/account/order-history.tsx:161`), not a cart rehydration from the order's lines | Partial | P1 | — |
| G36 | Customer | Rating action | `customerActions` emits a `rate` action (`lib/order-machine.ts:602`) that no surface renders; rating is reached only via order history / reviews, and `lifecycle.rating` is written only by the autopilot's `completed` patch | Inconsistent | P2 | G03 |
| G37 | Customer | Location management | No location or delivery-area picker. Distance is measured from a fixed mock point — "Where distance is measured from while the app has no geolocation" (`services/catalog.ts:76`). Serviceability is never checked against `delivery-zones` | Missing | P2 | — |
| G38 | Customer | Live rider position | `TrackingMap` is an explicit CSS/SVG placeholder advanced by a clock-smoothed `fraction` (`lib/tracking.ts:132`), not by the rider's actual stop progress. The rider app has real geometry (`lib/delivery.ts`) that is never published to the customer | Mocked but incomplete | P2 | — |
| G39 | Rider | Two parallel delivery systems | `DeliveryJob` (synthesised, `lib/mock/delivery-jobs.ts`, drives offers/trip/earnings/wallet/history) and `Order` (real, drives `LiveDeliveries`/`LiveTripView`) coexist with no bridge. A rider can hold a synthesised trip and a real order at once — `getJobOffers` checks `busy: Boolean(activeJob)` (rider store) while `LiveDeliveries` checks `activeOrderForRider` (order store); neither knows about the other | Inconsistent | P0 | G04 |
| G40 | Rider | Online/offline vs dispatch | `useRider.online` gates the *synthesised* offer pool, but `dispatchRider` / `autoDispatch` (`stores/orders.ts:204`) can assign a real order to a rider who is off shift — shift state lives in a per-device store the dispatcher cannot read | Broken | P1 | G39 |
| G41 | Core | Dead read path | `services/vendor.getVendorOrders` (`services/vendor.ts:81`) is exported and unused — the board reads the store. A leftover from the pre-lifecycle split that will re-diverge if anyone wires it up | Inconsistent | P3 | — |
| G42 | Core | Single-device truth | "One source of truth" is one `localStorage` key. Two browsers, two demos: nothing is shared, and a reviewer opening the customer and dashboard in different profiles sees two unrelated worlds | Mocked but incomplete | P2 | — |
| G43 | Customer | Account verification | `register` returns `isVerified: true` unconditionally (`services/auth.ts:118`). OTP request/verify exists in the seam but no registration flow requires it | Partial | P2 | — |
| G44 | Core | Fraud / abuse | No representation: no failed-payment retry loop beyond the decline, no repeat-refund flagging, no coupon-abuse guard, no rider cash-limit enforcement on real orders | Missing | P3 | G07, G05 |
| G45 | Core | Order-level chat/notes trail | `OrderEvent.note` carries encoded strings (`delay:15`, `otp-failed:2`, `refund-requested`) parsed by convention, not a typed union — a note format change breaks the timeline silently | Inconsistent | P3 | — |

---

## C. Critical End-to-End Gaps

The demo flow **Customer → Restaurant → Rider → Delivery → Completion** runs
today and is the prototype's strongest asset. What it cannot do:

1. **It cannot finish itself.** The chain stops at `delivered` unless the demo
   autopilot is on. `completed` has no human actor on any surface (**G03**).
2. **Money never closes the loop.** A completed order produces no commission, no
   vendor settlement and no rider earning (**G01**, **G02**, **G04**, **G05**).
   The spec's last arrow is the one with no implementation behind it.
3. **The rider is two people.** Earnings, wallet and history describe a rider who
   ran synthesised trips; the delivery the customer watched belongs to a
   different record set (**G39**). A rider can be on two jobs at once, and
   dispatch can assign to a rider who is off shift (**G40**).
4. **Nobody can intervene.** When an order sticks — and the ops page *detects*
   stuck orders correctly — there is no action available on any surface but the
   restaurant's and the rider's own boards (**G06**, **G14**).
5. **Refunds are a dead end** for cash and card: requested, then nothing
   (**G07**).
6. **The supply side cannot be created.** No restaurant or rider can be
   onboarded and approved; the dashboard silently hands a new owner the flagship
   restaurant (**G08**–**G13**).

Everything else in section B is additive. These six are the ones that break the
story being told.

---

## D. Missing Modules

**Customer**
- Support tickets / order-level problem reporting (G25), rider chat (G27)
- Location & serviceability picker (G37)
- Scheduled-order handling (G34), cart-level reorder (G35)

**Restaurant**
- Onboarding application + approval state (G08, G09)
- Menu builder: sections, items, option groups (G19, G20), inventory (G21)
- Profile / hours / branches settings (G18)
- Earnings, commission statement, payouts (G16)
- Staff & roles (G24), reporting (G23)

**Rider**
- Onboarding application, document upload, activation (G10, G11)
- Unified job model bridging `DeliveryJob` and `Order` (G39, G04, G05, G40)

**Admin**
- Orders management + lifecycle intervention + manual assignment (G14, G06)
- Restaurants, riders, customers management with approval queues (G12, G13, G15)
- Refunds & disputes (G07, G26), reviews moderation (G29)
- Commission, payouts & settlement (G17)
- Coupons & campaigns (G28), platform settings (G30)
- RBAC enforcement (G31), platform audit log (G32), analytics (G33)

**Shared / Core**
- Commission + settlement domain (G01, G02) — the single largest missing entity
  in `User → Restaurant → Order → Order Items → Rider → Delivery → Payment →
  Commission → Settlement`
- Manual order completion (G03)
- Permission helper reading `User.permissions` (G31)
- Typed `OrderEvent` detail payloads instead of encoded notes (G45)

---

## E. Recommended Implementation Order

Dependency-aware, preserving the existing architecture (types → mock → service →
store → component; every mutation through `order-machine`):

1. **Close the lifecycle.** Manual `completed` action on the customer tracker and
   the admin board (G03). Extend `TransitionPatch`/`OrderLifecycle` rather than
   adding a parallel path.
2. **Money domain.** Add commission to `Vendor`/`Order` and a settlement record
   stamped by the `completed` transition (G01, G02). One new `lib/settlement.ts`
   beside `lib/checkout.ts`, consumed by all four surfaces.
3. **Unify the rider job model.** Make a real `Order` produce a `DeliveryJob`-
   shaped earning (or make earnings read both sources), fix the shift/dispatch
   split, record collected cash (G39, G04, G05, G40).
4. **Admin order controls.** `/admin/orders` with list, detail, timeline, manual
   assignment, force transitions — all through `advance(…, "admin", …)`, which
   the machine already permits (G14, G06).
5. **Refunds & disputes.** Approve/reject on the admin side, wired to the
   existing `RefundStatus` and wallet ledger; then the customer's report-a-problem
   entry point (G07, G25, G26).
6. **Supply onboarding.** Add a status field to `Vendor` and `Rider`, an
   application form on `/partner` and `/rider`, rider role in `RegisterInput`,
   and admin approval queues — this is also what fixes the flagship-fallback bug
   (G08–G13).
7. **Vendor settlement surfaces.** Restaurant earnings/payout pages and the
   admin payout run (G16, G17).
8. **Restaurant authoring.** Menu builder, option groups, profile/hours,
   inventory (G19, G20, G18, G21), handover verification (G22).
9. **Admin breadth.** Customers, coupons, reviews, settings, RBAC enforcement,
   audit log, analytics (G15, G28–G33).
10. **Customer polish.** Scheduled orders, true reorder, location picker, rating
    action, chat, verification (G34–G37, G43, G27).
11. **Secondary.** Fraud scenarios, dead-path cleanup, typed event notes, and a
    cross-device transport if the demo needs two machines (G44, G41, G45, G42).

---

## F. Prototype Readiness

| Dimension | Readiness | Assessment |
|---|---|---|
| Core order lifecycle | **80%** | State machine, guards, actor permissions, event log and notification fan-out are production-shaped. Ends one transition short of complete, and the financial consequence of completion is absent |
| Customer | **85%** | Discovery through tracking is the most finished part of the app. Gaps are peripheral (support, scheduling, reorder, location) rather than structural |
| Restaurant | **60%** | Order workflow is excellent and live. Everything *around* it — onboarding, profile, menu authoring, earnings, staff — is either read-only or absent |
| Rider | **55%** | Delivery execution and payout mathematics are both strong, but they belong to two disconnected systems, so the surface that looks most complete is the least consistent |
| Admin | **25%** | Observability only. A real operations desk needs to act, and this one cannot |
| Cross-system consistency | **65%** | `User → Restaurant → Order → Order Items → Rider → Delivery → Payment` holds. `Commission → Settlement` does not exist, and `Rider → Delivery` forks into two representations |
| **Overall prototype** | **≈62%** | A convincing demonstration of the customer↔restaurant↔rider order flow with an honest architecture underneath. Not yet a complete representation of the platform: the money half of the lifecycle and the entire administrative half are the two large holes |

---

## Read-only checks

| Check | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | **Pass** — exit 0, no diagnostics |
| Lint | `bun run lint` | **Pass** — no findings |

Build was not run (it would write `.next/`, and this audit is read-only).
