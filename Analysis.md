# FoodOra Prototype Gap Analysis

*Read-only audit, 2026-08-27. No application code was modified.*

**Tree audited:** `frontend/` — 592 `.ts`/`.tsx` files, ~117,800 LOC.
**Note on placement:** this document is written to `Analysis.md` rather than the
prompt's `docs/FOODORA-PROTOTYPE-GAP-ANALYSIS.md`, because that path holds the
Phase 0 audit (2026-08-18) which `FOODORA-PROTOTYPE-PROGRESS.md` cites by
section throughout. Overwriting it would destroy the record the progress doc
reads against.

---

## A. Current System Summary

The prototype is substantially complete, and materially further along than the
Phase 0 audit describes. Twenty implementation phases have landed and the
progress doc's claim that *every gap in the original audit is closed* holds up
against the tree.

**What exists:**

* **95 routes** across six segments — `(marketing)` customer + public, `(auth)`,
  `(dashboard)` restaurant, `(rider)`, `(admin)`, `(qr)` dine-in.
* **One lifecycle definition.** `lib/order-machine.ts` (1,240 LOC) holds
  `TRANSITIONS` (a branching graph, not a list) and `ACTORS` (who may make each
  move). 17 statuses including `scheduled`, `delivery-failed`, `returned`,
  `refunded`. `transition()` is pure and appends an event log. Verified: no
  order status is assigned anywhere outside this module.
* **Domain layer** — 101 modules in `lib/`: settlement (758 LOC), delivery (558),
  order-lifecycle (560), rider-position (431), risk, serviceability, rbac, staff,
  coupons, review-moderation, cms, platform-settings, audit.
* **Seam layer** — 29 async services in `services/`, 35 Zustand stores with a
  uniform `hydrated` contract, 34 type modules, 37 mock fixtures.
* **Full four-role coverage** — customer discovery→checkout→tracking→OTP
  handover→review→refund; restaurant intake→kitchen→ready→handover→earnings→payout;
  rider online/offline→offer→pickup verification→OTP→failed-delivery→return→wallet;
  admin orders/customers/restaurants/riders/payouts/coupons/reviews/support/CMS/
  audit/analytics/settings/RBAC.
* **Beyond the four roles** — POS, QR dine-in menus, reservations, catering
  quotes, meal-plan subscriptions, blog/CMS, an AI assistant.
* **Demo engine** (`components/demo/demo-engine.tsx`) plays the actors nobody is
  driving, through the *same* store actions a tap goes through, so it cannot
  reach a state a person could not.
* **i18n** — `en`/`bn`/`ar` at exactly 4,815 keys each. Parity is exact.

**Gate results (run during this audit):**

| Gate | Result |
| ---- | ------ |
| `bun run typecheck` | ✅ pass |
| `bun run lint` | ✅ pass |
| `bun run build` | ❌ fails — `next/font/google` could not fetch *Plus Jakarta Sans* (network, not code). See A24. |
| `bun run verify:graphql` | ❌ fails — `backend/schema.gql` no longer exists. See A3. |
| `scripts/notifications-flow.ts` | ✅ pass |
| `scripts/rider-position-flow.ts` | ✅ pass |
| `scripts/platform-settings-flow.ts` | ✅ pass |
| `scripts/cms-flow.ts` | ✅ pass |
| `scripts/ai-flow.ts` | ✅ pass |

**The dominant finding is not a feature gap.** `backend/` has been emptied (moved
to `backend OLD/`) and `docker/` deleted, but `frontend/.env.local` still points
the app at `http://localhost:4000` with two live slices switched **on**. The
prototype's largest current defect is this configuration, not a missing screen.

---

## B. Missing / Incomplete Features

| ID | Area | Module | Missing / Problem | Current Status | Priority | Dependencies |
| -- | ---- | ------ | ----------------- | -------------- | -------- | ------------ |
| A1 | Shared | `frontend/.env.local` · `services/auth.ts` | `NEXT_PUBLIC_BACKEND_AUTH=1` points at the deleted API. Auth deliberately does **not** fall back (only catalog reads do), so login, register, OTP and password reset all fail against a server that no longer exists. | Broken | **P0** | none |
| A2 | Shared | `frontend/.env.local` · `services/catalog.ts` | `NEXT_PUBLIC_BACKEND_CATALOG=1`. Every catalog read attempts the dead API, blows the 5,000 ms deadline, then serves mock. Every server-rendered discovery page pays ~5 s per read before rendering. | Broken | **P0** | none |
| A3 | Shared | `scripts/verify-operations.ts` | The `verify:graphql` gate reads `../backend/schema.gql`, which is gone. A documented release gate now always fails. | Broken | **P0** | A4 decision |
| A4 | Shared | `lib/graphql/` · `config/backend.ts` | 1,691 LOC of GraphQL documents plus live bodies in 5 services (`auth` 9, `catalog` 12, `verification` 3, `cart` 2, `orders` 2 flag checks) have no server and no schema to validate against. Needs an explicit keep-or-excise decision, not silent rot. | Orphaned | P1 | A1–A3 |
| A5 | Shared | `docker/`, `.dockerignore` | Both deleted; `frontend/` has no `Dockerfile`. Nothing now documents how to run or ship the stack. | Missing | P2 | A4 |
| A6 | Admin | commission | `Vendor.commissionRate` is read-only everywhere — rendered in `admin/order-detail-view.tsx` and `dashboard/earnings-view.tsx`, resolved by `settlement.commissionRateFor`, and hardcoded to `null` by `vendor-onboarding.ts:599`. There is no surface to set or negotiate a rate. The prompt asks for admin commission management explicitly. | Missing | P1 | platform-settings |
| A7 | Shared | catalog vs serviceability | **Two distances disagree.** `Vendor.distanceKm` is a fixed seeded number (1.2, 2.4, 1.8 …) shown on every card and used to sort by distance; `lib/serviceability.ts:189` computes a real haversine distance from the customer's chosen area. Switching area changes serviceability but the card still reads 1.2 km. | Inconsistent | P1 | `stores/location` |
| A8 | Restaurant → Customer | `stores/menu` vs `services/catalog` | Menu drafts reach the **QR/dine-in** menu (`useMenuItem` in `components/qr/qr-item-row.tsx`) but not the public storefront — `app/(marketing)/restaurants/[slug]/page.tsx` is a Server Component reading `services/catalog` only. The same dish can show two prices in one session. | Inconsistent | P1 | server read |
| A9 | Restaurant → Customer | `stores/onboarding` vs `services/catalog` | `services/catalog` never reads the onboarding store. A suspended seeded restaurant still lists in discovery; an approved brand-new one never appears. | Inconsistent | P1 | server read |
| A10 | Customer | payment states | `PaymentStatus "failed"` is in the type and rendered by `checkout/order-confirmation.tsx:155`, but nothing ever writes it. Declines happen *before* the order exists (`authorisePayment`, card `0000`, locked after 3 by `risk.paymentLocked`), so no order can be in a failed-payment state. The branch is dead. | Mocked but incomplete | P2 | `order-machine` |
| A11 | Customer | loyalty | No points programme. `loyalty` exists only as a `CouponSource` label on one seeded coupon (`lib/mock/coupons.ts:189`) — no ledger, no earn, no burn. | Missing | P2 | wallet |
| A12 | Customer | referrals | Same shape: `referral` is a `CouponSource` label on `cpn_referral_reward`. No referral code issuance, no attribution, no reward trigger. | Missing | P2 | A11, coupons |
| A13 | Shared | currency | `"BDT"` is hardcoded as a fallback in 10+ modules (`settlement`, `finance` ×3, `coupons` ×2, `customers`, `vendor-onboarding`, `services/ai`). Now that `platform-settings` owns the country table, the default should resolve from it. | Inconsistent | P2 | platform-settings |
| A14 | Restaurant | staff / RBAC | `lib/staff.staffCan` is complete and enforced, but no session ever belongs to a staff member (no mail server, so an invitation is a record not a login). The entire per-staff permission path is unexercised. | Partial | P2 | auth |
| A15 | Restaurant | branches | A branch is recorded, not orderable — `Vendor` has one `location`, so an extra outlet lives on the application only. | Partial | P2 | catalog model |
| A16 | Shared | `components/ui/` | No shared `EmptyState` or `Skeleton` primitive (11 primitives, neither of them). 85 files hand-roll `length === 0`; 86 gate on `hydrated`. Behaviour is consistent, markup is not. | Partial | P2 | none |
| A17 | Shared | error boundaries | Only `app/error.tsx` and `app/not-found.tsx` exist. No per-segment `error.tsx` for `(admin)`, `(dashboard)`, `(rider)` or `account` — a throw in an operator surface loses the shell and drops the operator on the customer-facing error page. | Missing | P2 | none |
| A18 | Customer | geolocation | `navigator.geolocation` is never called. Origin is `DEFAULT_ORIGIN` (Gulshan 1, `services/catalog.ts:84`); the customer picks an *area label*, not a position. Root cause of A7. | Missing | P3 | A7 |
| A19 | Restaurant / Rider | file storage | Logo, cover and rider documents are URLs and reference numbers — no upload path anywhere. Stated on-screen rather than faked. | Partial | P3 | storage |
| A20 | Restaurant | map coordinates | Not editable (no geocoder); the address is free text while the coordinate riders navigate by stays put. | Partial | P3 | geocoder |
| A21 | Restaurant / Admin | analytics | No previous-period comparison on either dashboard. Needs a second window resolved and reconciled. | Partial | P3 | analytics |
| A22 | Shared | export | CSV only. A PDF needs a layout engine the prototype does not carry. | Partial | P3 | none |
| A23 | Shared | §10 verification | Scenarios A–G have never been driven in a browser in one sitting. The progress doc lists this as outstanding and it still is — no static check substitutes for it. | Missing | **P0** *(process)* | A1, A2 |
| A24 | Shared | `app/layout.tsx` | `next/font/google` fetches *Plus Jakarta Sans* at build time, so `bun run build` requires network and fails offline. The prototype is not reproducibly buildable in an air-gapped or CI-sandboxed environment. | Broken | P2 | none |
| A25 | Shared | §14 deliverable | The final summary the spec asks for once everything is done has not been written. | Missing | P2 | A23 |

---

## C. Critical End-to-End Gaps

The complete demo flow — **customer → restaurant → rider → delivery →
completion** — is fully implemented and, on the mock path, works. Only two
things prevent it being demonstrated *today*:

1. **A1 — nobody can sign in.** `NEXT_PUBLIC_BACKEND_AUTH=1` sends login to a
   deleted API, and auth is the one slice that deliberately never falls back
   (silently succeeding locally while failing server-side is the failure that
   rule exists to prevent). Every role's journey starts at a sign-in that
   errors. Setting the flag to `0` restores the whole flow.
2. **A2 — discovery is ~5 s per page.** The catalog *does* recover, but only
   after each read exhausts `BACKEND_TIMEOUT_MS`. A demo reads as broken long
   before it reads as slow.

Both are one-line configuration changes. Nothing in the lifecycle itself is
missing:

* `lib/order-machine.TRANSITIONS` covers all 17 statuses including the
  `delivery-failed → on-the-way | returned` fork and the four refund entries.
* Invalid transitions are refused by construction, and `ACTORS` refuses the
  wrong actor — the restaurant cannot mark an order delivered.
* OTP handover exists on both sides (`lib/delivery.handoverCodeFor` /
  `handoverMatches`), and `arrived` is what unlocks the customer's code.
* Settlement runs on delivery: commission, courier payout, refunds
  (`lib/settlement`, 758 LOC), and payouts are *executable* — `stores/payouts`
  exposes `payVendor`, `payRider`, `runVendorPayouts`, `runRiderPayouts`, `adjust`.
* Manual and automatic dispatch both exist, plus reassignment
  (`stores/orders.assignRider` / `reassignRider`).

The remaining end-to-end risk is **unverified**, not **unbuilt** (A23).

---

## D. Missing Modules

**Customer**
* Loyalty / points programme (A11)
* Referral programme (A12)
* Real geolocation (A18)
* Post-placement payment failure (A10)

**Restaurant**
* Orderable branches (A15)
* Staff sign-in — the account behind an invitation (A14)
* Logo / cover upload (A19)
* Editable map coordinates (A20)
* Period-over-period analytics (A21)

**Rider**
* *No missing modules.* Onboarding, availability, offers, pickup verification,
  OTP handover, failed delivery, return, earnings, wallet, history and live
  position are all present.

**Admin**
* Commission management (A6)
* Period-over-period analytics (A21)
* PDF export (A22)

**Shared / Core**
* A single source of truth for distance (A7)
* A server-shaped read that sees dashboard drafts and onboarding status (A8, A9)
* Domain-driven default currency (A13)
* `EmptyState` / `Skeleton` primitives (A16)
* Per-segment error boundaries (A17)
* A decision on the orphaned GraphQL layer (A4) and its gate (A3)
* Container / run documentation (A5)
* Offline-capable font loading (A24)

---

## E. Recommended Implementation Order

1. **Restore the frontend-only baseline** (A1, A2, A3) — set every
   `NEXT_PUBLIC_BACKEND_*` flag in `.env.local` to `0`, matching `.env.example`,
   which is already correct. Point `verify:graphql` at a committed schema copy or
   remove it from the gate list. *One config file. Unblocks everything else.*
2. **Drive §10 Scenarios A–G** (A23) — before any new code, and per §12, in a
   session that is not shaped by knowing how the code works.
3. **Resolve the orphaned backend seam** (A4, A5) — keep `lib/graphql` with a
   vendored `schema.gql`, or excise it and `config/backend.ts` together. Either
   is defensible; leaving it undecided is not.
4. **Close the three cross-system inconsistencies** (A8, A9, A7) — all three are
   the same shape: one server-shaped read that resolves catalog, menu drafts and
   onboarding status together. This is the "Phase E" the progress doc keeps
   deferring to, and it retires three rows at once.
5. **Commission management** (A6) — the last genuinely missing admin module.
6. **Domain-driven currency** (A13) — mechanical, and cheap once step 4's read
   exists.
7. **Payment failure states** (A10) — make the dead `"failed"` branch reachable,
   or delete it. A rendered state nothing can produce is worse than neither.
8. **Shell robustness** (A17, A16, A24) — per-segment error boundaries, then the
   two shared primitives, then a local font.
9. **Loyalty and referrals** (A11, A12) — genuinely new features; build on
   `stores/wallet` and `services/coupons`, which already carry the source labels.
10. **Remaining P3 polish** (A18–A22) and the §14 deliverable (A25).

---

## F. Prototype Readiness

**Core flow readiness — 100% built / 0% verified.** The lifecycle is complete,
single-sourced and machine-enforced; it has never been driven end to end in a
browser.

**Customer — ~92%.** Every flow the prompt lists exists. Gaps are loyalty,
referrals, real geolocation and a dead payment-failure branch.

**Restaurant — ~90%.** Intake through payout is complete. Gaps are structural
and honestly stated on-screen: branches, staff sign-in, uploads, coordinates.

**Rider — ~98%.** The most complete of the four. No missing module found.

**Admin — ~95%.** Fourteen surfaces, RBAC, audit log, executable payouts.
Commission management is the one real hole.

**Cross-system consistency — good, with three known folds.** Independently
verified against the five forbidden patterns of §11:

| Pattern | Result |
| ------- | ------ |
| Direct status mutation | ✅ clean — no order status assigned outside `lib/order-machine`; all hits are seed fixtures and UI column labels |
| Disconnected rider delivery | ✅ clean — `DeliveryJob.orderId` links every job; positions derive from `lib/delivery` stop geometry |
| Vendor fallback | ✅ clean — no `vendors[0]` fallback; the two `vendors[0]` hits are single-vendor offer links |
| Fake financial values | ✅ clean — no `Math.random()` outside a seeded RNG; every figure derives from the order book |
| Duplicate domain models | ✅ clean — `LatLng` is an alias of `types/common.Coordinates`, `Money` is defined once |

The three real folds (A7, A8, A9) are all the same missing server-shaped read,
and all three are documented as deliberate deferrals rather than discovered here.

**Overall prototype readiness — 93%.**

Roughly 5 points of that gap is verification debt (A23, A25) and 2 points is
configuration (A1–A3) — neither is construction. Excluding those, feature
completeness against the prompt's four-role checklist is ~96%: the genuinely
missing modules are commission management, loyalty and referrals.

**One-line summary:** this is a finished prototype pointing at a deleted backend.
Set the five `NEXT_PUBLIC_BACKEND_*` flags to `0` and the readiness question
becomes a verification question rather than an implementation one.
