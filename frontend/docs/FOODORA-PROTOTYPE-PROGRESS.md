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
- Phase 10 — Restaurant Settings + Staff + Handover + Analytics Done
- Phase 11 — Admin Customer Management Done
- Phase 12 — Admin Coupons / Campaigns Done
- Phase 13 — Review Moderation Done
- Phase 14 — RBAC Done
- Phase 15 — Platform Audit Log Done

---

## Audit reference (Phase 0, 2026-08-19)

Kept because the remaining phases are planned off it. The per-phase write-ups for
Phases 1–10 were removed; the architecture each of them left behind is recorded
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

None in progress. Phases 1–15 complete.

### Phases 14–15 — RBAC + Platform Audit Log (2026-08-25)

**Done.** G31 and G32 closed together, and deliberately so: they are two halves of
one question. RBAC decides who may make a mutation; the audit trail records that
they did. Built in one session because every mutation site the trail has to record
is a mutation site the permission check has to guard, and visiting each of them
twice would have been two chances to disagree about which ones matter.

#### Phase 14 — RBAC (G31)

**The gap was not "there is no role model" — it was that nothing read the one that
existed.** `User.permissions` has been on the account type since the first commit
and had never been read by anything. The visible consequence was in
`components/admin/admin-shell`: an `ADMIN_ROLES` list admitted four roles to *all
eleven* sections, so a moderator could run a payout batch and a finance manager
could remove a review. Four decisions carry the phase:

| Question | Answer | Where it is stated |
|---|---|---|
| Where the rule lives | **`lib/rbac.ROLE_PERMISSIONS` — one table, and an account carries only what it holds *beyond* its role.** The same argument `lib/staff.STAFF_PERMISSIONS` makes for restaurant roles: a stored copy per account is how a platform ends up with support agents hired in March who cannot do what those hired in April can. | `lib/rbac.ts` header |
| Refuse or hide | **A section you cannot see is hidden from the nav and refused by the shell; an action you cannot take stays visible and disabled above one line naming the permission.** The open question the previous session flagged, settled once. Hiding the controls would leave an agent unable to tell whether a transfer button is missing because they may not press it or because the settlement is not payable. | `components/admin/read-only-notice.tsx` header |
| Where the check for a store action lives | **`stores/auth.sessionCan`, read by the store itself.** Ten stores hold the important mutations and every one already takes a `by: string` display label; threading the whole `User` through forty call sites would have been forty chances to pass the wrong one. The store asks the session; the *rule* stays in `lib/rbac`. | `stores/audit.ts` header, each guarded action |
| Legacy colon slugs | **Ignored, not normalised — and this is the one that would have been a real leak.** `orders:view` sits on `restaurant-owner`, where it plainly means "the orders at my restaurant". Reading it as `orders.view` handed every restaurant owner the platform order list and every rival's trade. §5.3 in another guise. | `lib/rbac.ts` header, `normalise` |

**The vocabulary is §6's sixteen plus four.** `support.view`, `support.manage`,
`content.manage` and `notifications.send` cover admin surfaces that already existed
(Phase 5's dispute queue, C26's content desk, C25's broadcast composer) and would
otherwise have been the only ungated pages in the section. `types/user.ts` lists
them apart from the sixteen so "the spec asked for this" stays distinguishable from
"this surface exists and needed a name".

**Both entry points §6 names are real, and `can` is the type-safe one.**
`PermissionAction<R>` is derived from the slug union, so `can(user, "orders",
"approve")` is a compile error rather than a check that quietly returns false — the
one failure mode an authorization layer must not have.

**Two gates, not one.** `canOpenAdmin` asks whether an account belongs in platform
operations; `permissionForAdminPath` asks whether it belongs on *this* page, from
the same table the nav filter reads — so a hidden link cannot be reached by typing
the URL. A refused page offers the first section the account *can* open, because a
marketing manager landing on `/admin` (which needs `orders.view`) would otherwise
see nothing but a wall.

**Four accounts were added to make it visible.** `support@`, `moderator@`,
`finance@` and `marketing@foodora.dev` (same demo password). Before RBAC they would
have been indistinguishable from the super-admin, which is why they did not exist.
All four carry `permissions: []` — the role table is the grant, and a seeded copy of
it is the duplication `lib/rbac` refuses. What each one sees:

```text
super-admin        all eleven sections
customer-support   live ops · orders · disputes · customers · restaurants · riders
moderator          live ops · orders · disputes · customers · restaurants · reviews
finance-manager    live ops · orders · restaurants · riders · payouts · audit
marketing-manager  live ops · orders · customers · campaigns · content · broadcasts
```

**The merchant side is untouched, and that is a scope statement rather than an
omission** — see *Deliberately deferred by Phases 14–15*.

#### Phase 15 — Platform Audit Log (G32)

**Done.** `/admin/audit`, gated on `audit.view`, with §6's seven-field record and
all ten of its important mutations recorded at the store that commits them.

**The gap was that the only trace of an admin decision was the decided entity.** An
order that says `cancelled`, a restaurant that says `suspended`, a settlement that
says `paid` — each answers *what* and none answers *who*. Four decisions:

| Question | Answer | Where it is stated |
|---|---|---|
| Where the actor comes from | **The session, read at commit time by `stores/audit.record`.** The consequence is stated rather than discovered: a mutation with nobody signed in — the demo autopilot — is recorded as `System` rather than dropped, because a trail with holes exactly where nobody was watching is worse than one that admits a machine acted. | `stores/audit.ts` header |
| Snapshot or join | **Snapshot.** `AuditActor` copies the name and role off the account. A live join would rewrite history on every promotion: the entry for a refund approved by a support agent would later read as approved by whatever that person became. | `types/audit.ts` (`AuditActor`) |
| One language or translated | **The `description` is written once, in English, at record time.** The `action` slug beside it *is* translated, so the log stays navigable in Bengali and Arabic; the sentence is the evidence and stays as typed. The precedent is C25's broadcast copy — "written once, sent as written". | `lib/audit.ts` header, `describeAudit` |
| CMS compatibility | **Adapted on read, never copied on write.** `lib/audit.fromCmsAudit` reads `CmsAuditEntry` into this shape inside `services/audit`; `stores/cms` is untouched and `/admin/cms` still shows its own richer nine-verb record. Copying content edits into a second store would have produced two records of one edit that drift the first time somebody reverts a document. | `lib/audit.ts` (`fromCmsAudit`), `services/audit.ts` header |

**`timestamp` is called `at`.** §6 names the field `timestamp`; `CmsAuditEntry.at`
has held that meaning since C26, `CmsRevision.at` beside it, and every other date
in the codebase is an `at`/`placedAt`/`settledAt`. Honouring "keep existing CMS
audit compatibility" is easier when the two records agree on the name of the same
field than when an adapter has to rename it.

**All ten of §6's mutations, at the store that commits them:**

```text
order intervention     stores/orders.advance         (actor === "admin" only)
rider assignment       stores/orders.assignRider · reassignRider
restaurant approval    stores/onboarding.decideVendor
rider approval         stores/onboarding.decideRider
refund decision        stores/orders.decideRefund · settleRefund
payout action          stores/payouts.payVendor · payRider · run* · adjust
coupon changes         stores/campaigns.addCampaign · setPaused · endCampaign
customer blocking      stores/customers.block · unblock
settings changes       stores/vendor-settings.save{Profile,Contact,Hours,Delivery}
permission changes     stores/staff.setPermission · edit (on a role change)
```

**Recorded in the store, not the component**, so a second surface calling the same
action cannot forget — the same reasoning `stores/orders` applies to notification
fan-out. Two consequences worth stating:

- **`order.intervened` is scoped to the `admin` actor**, and so is its permission
  guard. `advance` is also how a customer cancels, a restaurant accepts and a rider
  delivers; a blanket session check there would have broken every flow in the app,
  and a trail of every transition would be a worse duplicate of `lifecycle.events`.
- **`decideRefund` gained `by: "desk" | "system"`.** `advance` calls it itself to
  settle a wallet order the customer just cancelled, where there is nothing to
  decide. Guarding that path on `refunds.manage` would have made a customer's own
  cancellation fail unless they held an admin right. The default is `desk`, so a new
  caller is guarded unless it says otherwise.

**Ids are deterministic and deduped on both sides**, so a replayed mutation — a
second tab, a rehydrate, the autopilot — appends one entry rather than two.
`recordAudit` also rehydrates the log before appending when a mutation happens on a
surface that never opens the audit screen (a restaurant saving its delivery terms),
because appending into an unhydrated store would work only until something
rehydrated over it.

**`stores/audit.seed` refuses to seed while the order book is empty.** The seed
names a completed delivery, one that ended badly and a blocked account; seeding
before those stores are up would produce the four entries that need nothing and mark
the seed *done*, leaving the trail permanently missing every order-shaped line.

**The permission reference at the bottom of the screen is Phase 14 made visible** —
`lib/rbac.permissionsFor` of whoever is reading, so it cannot describe a set the
gates do not enforce.

### Phase 13 — Review Moderation (2026-08-25)

**Done.** G29 closed: `/admin/reviews` and `/admin/reviews/[id]`, with the reported
queue, the review itself, customer/vendor/order context, approve-or-leave,
hide/remove, the moderation reason and the moderation history the spec lists.

**The gap was not "reviews cannot be reported" — it was that a report went
nowhere.** `services/reviews.reportReview` said so in its own comment ("the report
goes nowhere in a prototype"): the flag on every review card thanked the reader and
dropped the objection on the floor. A restaurant being libelled had no recourse and
no moderator had a queue. Three decisions carry the phase:

| Question | Answer | Where it is stated |
|---|---|---|
| Where a decision lives | **A row beside the review, keyed on `reviewId`** — never a field on it. The corpus is synthesised (`lib/mock/reviews`) and a customer's own reviews live in their browser; neither can carry a platform decision. A review with no record has simply never been reported, so there is nothing to backfill and the store stays the size of the work the desk has done rather than growing a row per review. | `types/review.ts` (`ReviewModerationRecord`), `stores/review-moderation.ts` header |
| How a hidden review disappears **everywhere** | `ReviewContext` gained one field and `useReviewContext` joins it once. Every corpus the seam assembles — storefront, merchant board, rider profile, AI summary — filters on it, so no surface can forget. | `services/reviews.ts` (`ReviewContext.moderation`, `visible`), `stores/reviews.useReviewContext` |
| Hide vs remove | **Two decisions, not one with a severity flag.** Hiding is reversible and is what a borderline review gets while it is argued about; removal is the end of the argument, and `restoreReview` refuses it (`errors.removedIsFinal`) — which is what makes the confirmation on removal mean something. | `types/review.ts` (`ReviewModerationStatus`), `lib/review-moderation.ts` header |

**The queue is fed by real objections, from both sides.** The customer's flag now
opens a reason dialog (`components/reviews/report-review-dialog.tsx`) drawn from the
*same* closed vocabulary the desk cites when it acts — which is what makes "how
often is a report of this kind upheld" answerable — and the **merchant's** review
board gained a report control, because a restaurant is the party most likely to be
libelled and had no way to say so. One dialog, two `byRole` values.

**Grounds and prose are both required to take a review down**, exactly as blocking
an account is (Phase 11): the category is what gets counted, the sentence is what
the author and the restaurant are owed if either disputes it. Approving and
restoring ask for neither — a review that broke no rule needs no argument, and
demanding one teaches moderators to type a full stop.

**The author keeps their own words.** `getMyReviews` is the one read that does *not*
drop a moderated review: it returns the status beside the list and
`/account/reviews` says "hidden by moderation", because a review invisible
everywhere and explained nowhere is worse than either outcome.

**The seed runs the real domain.** `lib/mock/review-reports.ts` picks reviews by
*rule* ("their worst review", "a five-star with a photo") rather than by index, then
builds each record by calling `reportReviewRecord` and the decision function — so a
seeded record cannot be in a state the domain would refuse, and its log is
indistinguishable from one produced on this device.

### Phase 12 — Admin Coupons / Campaigns (2026-08-25)

**Done.** G28 closed: `/admin/coupons` creates a platform campaign and sets its
eligibility, validity, usage limit, discount and minimum order; deactivates and
reactivates it; ends it; and shows each one's redemptions, discount given and basket
value. **The coupon engine was reused, not rewritten** — `lib/coupons.evaluateCoupon`
is still the only evaluator, and the three open questions the previous session
recorded were settled before any code was written:

| Question | Answer | Where it is stated |
|---|---|---|
| What separates a platform campaign from a restaurant coupon *in the type* | **One `Coupon`, one engine, separated by `source`.** `lib/coupons.isPlatformCampaign` is the single test, and it reads `source`, not `scope`: a platform campaign can be limited to one restaurant (a funded launch promotion) and still be the platform's to start, pause and pay for, while a `source: "vendor"` code belongs to the merchant's book however widely it applies. Two types would have meant checkout validating against two engines. | `lib/coupons.isPlatformCampaign`, `campaigns-view.tsx` header, and `campaigns.separationNote` on screen |
| Whether deactivating a live campaign invalidates carts that already hold it | **Yes — at apply *and* at redeem.** `pausedAt` is a real column on `Coupon` and `evaluateCoupon` refuses it with `reason.paused`; checkout re-prices the wallet on every basket change, drops the applied coupon and shows the reason. A held ticket reads *paused* in the wallet rather than vanishing, because a deactivation is reversible. | `types/coupon.ts` (`pausedAt`), `lib/coupons.couponStatus` / `evaluateCoupon`, `coupons-view.tsx` (paused sits with what you hold) |
| Who bears the discount | **Not changed, and not silently:** Phase 2 already decided it in `lib/settlement.commissionFor` — a discount reduces the commissionable base, "both sides give something up". A platform-funded line that leaves the vendor whole is a change to `OrderFinancials`, the GraphQL wire format and every settled period, and it belongs to a financial phase rather than to the campaign editor. Recorded under *Deliberately deferred* rather than half-built. | `lib/settlement.ts:100-110` (unchanged), and the deferral below |

**`pausedAt` is the one field the shared engine gained**, and it is a column rather
than a moved date on purpose: `endsAt` is what a campaign was *promised* to run
until, and collapsing the two would lose which of them stopped the code and make
resuming indistinguishable from extending. `CouponStatus` gained `paused` and its
tests are ordered the way a person would explain them — spent-out, then the closed
window (an expired campaign is over whatever the desk did to it), then the desk's
pause, which outranks `scheduled` because a campaign deactivated before it opens is
not going to open on Monday.

**Deactivating and ending are different controls because they are different
decisions.** A pause is one tap either way; ending closes the window for good and
asks first. Ending reuses the merchant board's existing `applyEnded`, so a finished
campaign stays readable and its performance keeps counting — the same UPDATE a
backend would run.

**An admin-created campaign is a real campaign.** `PlatformCampaignContext` is
threaded into the *customer* reads as well as the board (the C16/C18/C21 context
pattern), so a code created here is claimable in the wallet, applies at checkout and
is refused there once deactivated. An admin surface whose writes no customer surface
can see would have been exactly the disconnected copy §5.2 forbids.

**Performance is derived, never stored.** `buildCouponPerformance` counts a
campaign's live days deterministically from its id, so the board's redemptions,
discount and basket value cannot drift from each other and a reload never reshuffles
them (§5.4).

### Phase 11 — Admin Customer Management (2026-08-25)

**Done.** G15 closed: `/admin/customers` and `/admin/customers/[id]`, with the
list, search, segments, sort, detail, account status, order history, spending
summary, support tickets and block/unblock the spec asks for.

The three open questions the previous session recorded were settled before any
code was written, and each answer is stated in the file that acts on it:

| Question | Answer | Where it is stated |
|---|---|---|
| What identifies a customer | **The normalised phone**, and `Customer.id` is derived from it (`customerIdFor`). Not a minted `User`: the synthesised names have no accounts behind them, and inventing one per name would have been the "disconnected copy" §5.2 forbids. Not a new `Order.customerId` either — that is a GraphQL wire-format change plus a store migration to backfill a value nobody ever collected. | `types/customer.ts` header, `lib/customers.ts` header |
| Where blocking is enforced | **Checkout**, at submit, before `placeOrder`. Phase 7's lesson applied: a suspension that never reaches dispatch suspends nothing, so the chokepoint was named first and `isPhoneBlocked` was written for it. | `components/checkout/checkout-view.tsx`, the guard's own comment; `stores/customers.isPhoneBlocked` |
| Gross or net spending | **Both, labelled.** `grossSpend` counts only orders the customer was actually charged for — `payment.status` of `paid` or `refunded`, the same test `openRefundOwed` uses — and `netSpend` takes the settled refunds off. Nothing is re-summed from prices: the charge test and the refund amounts are read off the order records. | `types/customer.ts` (`CustomerStats`), `lib/customers.customerStats` |

**The list is derived, not stored.** This is the phase's one structural decision
and everything else follows from it. `lib/customers.buildDirectory` folds the
shared order and ticket stores into one row per phone and hangs a managed account
record off it where one exists; `stores/customers` persists **only the accounts
somebody has acted on**. Two consequences worth stating:

* A reviewer who checks out with a phone number nobody has seen appears in
  `/admin/customers` on the next render, because there is no table anyone has to
  remember to write to.
* There is no cached `lifetimeSpend` anywhere, so the spending summary a moderator
  blocks somebody over cannot drift from the money the platform settles (§5.4).

Blocking a *derived* row mints its managed record as part of the same action
(`stores/customers.moderate`), so the persisted set stays the size of the work the
desk has actually done rather than growing a row per guest checkout.

**The two write paths are deliberately asymmetric.** Blocking demands grounds
*and* a written reason of at least 8 characters — the category is what gets
counted, the sentence is what the person is owed when they appeal, which is the
same rule vendor suspension already follows. Unblocking asks only for
confirmation, with an optional note: a reinstatement that is hard to perform is a
reinstatement that quietly does not happen.

**Nothing was rewritten.** No change to `Order`, `SupportTicket`, `User`, the
order machine, the GraphQL wire format, or any store's persisted shape. The four
touched files gained an import and a few lines each: a nav entry and a rehydrate
in `admin-shell`, a block gate in `checkout-view`, a reset call in `demo-bar`, one
line in the `types` barrel.

### Phase 10 — Restaurant Settings + Staff + Handover + Analytics (2026-08-25)

**Done.** All four gaps closed: G18 (settings/hours/branches), G22 (handover
verification), G23 (restaurant analytics) and G24 (staff/roles). Every open
question the previous session listed was settled *before* implementation rather
than mid-phase, and each answer is recorded in the code that acts on it:

| Question | Answer | Where it is stated |
|---|---|---|
| Export format | CSV from the already-derived rows. A PDF needs a renderer the prototype does not have, and a button producing a blank-looking page is worse than no button. | `lib/export.ts` header |
| Delivery settings vs. platform zones | A restaurant sets its own fee, minimum, free-over threshold and ETA window. Zones stay the platform's (G30, unassigned) and are shown read-only with who to ask. | `components/dashboard/settings/delivery-panel.tsx` header + `zones.readOnly` on screen |
| Whether a branch becomes a second `Vendor` | **No** — Phases 6–7's decision is honoured, not overturned. A branch stays a record on `VendorApplication.branches`, edited through `stores/onboarding.editVendor` so it lands in the reviewer's audit log. | `types/vendor-settings.ts` header, `branches-panel.tsx` header, and `branches.notOrderable` on screen |
| Permissions now, or defer to Phase 14 | Build the grant table, the fold and `staffCan` now — they are correct today. Do **not** fake a session for an invited colleague. The screen says enforcement is not yet platform-wide. | `types/staff.ts` + `lib/staff.ts` headers, `staff.notEnforced` on screen |

**One pre-existing bug was found and fixed**, because it broke this phase's own
binding constraint. `lib/mock/vendor-orders.ts` derived both `id` and
`orderNumber` from a *minute-granular* `placedMs`, so with a dozen-plus orders a
day drawn from a few hundred minute slots two of them collided regularly:
`buildVendorSettlements` was listing **83 order ids for 81 orders** on the
flagship's book. That is one order counted twice — exactly the failure
`services/finance.mergeOrders` warns about in its own comment, arriving from
inside the synthesiser rather than from the merge — and it was over-reporting
Phase 8's restaurant earnings and the platform payout run as well as this phase's
analytics. The fix adds seconds derived from the index within the day, so the
instant (and therefore the identity) is unique by construction rather than by
luck; determinism is untouched. Verified catalog-wide: no vendor's synthesised
week now contains a duplicate id or reference, and every settled order lands in
exactly one settlement line.

**Verification session, 2026-08-25 — no code changed.** Phases 8 and 9 were
re-checked against §6 of `GAP - Implement v2.md` because the doc's *Next Phase*
section still named Phase 8 and could not be trusted on its own. Both are in fact
complete; every item on both spec checklists was confirmed against the file that
implements it, not against this document. The stale *Next Phase* section has been
rewritten to Phase 10 and the architecture the two phases left behind is now
recorded under *Important Architecture → Added in Phases 8–9*, which was the
missing piece that made the doc read as if Phase 8 were still open.

What was confirmed, item by item:

| Spec item (§Phase 8) | Confirmed in |
|---|---|
| earnings, pending + available balance, gross, commission, net | `components/dashboard/earnings-view.tsx` → `/dashboard/earnings` |
| commission statements | `components/finance/commission-statement.tsx` |
| settlement history | `earnings-view.tsx` — one row per period, expanding into its statement |
| payout history | `earnings-view.tsx` — separate section, read-only by design |
| vendor settlements, rider remittance, status, period filter, payout runs, totals | `components/admin/payouts-view.tsx` → `/admin/payouts` |
| details | `components/admin/payout-detail-view.tsx` → `/admin/payouts/[id]` |

| Spec item (§Phase 9) | Confirmed in |
|---|---|
| sections: create / rename / reorder / delete / enable-disable | `menu-builder.tsx` via `useMenu` — reorder is up/down buttons, not a drag handle |
| items: create / edit / delete / price / description / image / availability / dietary | `components/dashboard/menu/item-editor.tsx` (+ spice level) |
| option groups: create / edit / delete / required / min-max / option prices | `item-editor.tsx` — `OptionGroupEditor` |
| inventory: quantity, low-stock threshold, out-of-stock, automatic unavailable, manual adjustment | `components/dashboard/menu/stock-dialog.tsx` + `lib/menu.stockStateOf` |
| the customer customiser consumes the same menu/option data | `components/menu/use-menu-item.ts`, read by `add-to-cart-button.tsx` and `qr-item-row.tsx` |

Two spec constraints were checked specifically, because they are the ones a
plausible-looking implementation would miss:

* **"Use the Phase 2 financial domain. Do not invent separate financial numbers."**
  Held. Every figure on both surfaces resolves through `lib/settlement` over the
  commission records orders already carry. `earnings-view` takes all of its numbers
  from `services/finance.getVendorEarnings` and imports no arithmetic of its own;
  `payouts-view` calls `getPlatformPayouts` and reaches into `lib/settlement` only
  for `isPayable` and `settlementTotals`, which are that domain's own functions. So
  there is no second set of numbers to keep in step.
* **"Do not introduce a second menu model."** Held. `MenuSectionWithItems` lives in
  `types/catalog` and is re-exported by `services/catalog`, so the builder's fold and
  the storefront's read return the same shape. The customiser resolves its dish
  through `lib/menu.effectiveItem` — the same fold the merchant's board uses — so a
  group the restaurant authored is the same `FoodOptionGroup` record the customer
  configures and the cart line prices, not two readings of one.

---

## Validation

| Gate | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | **PASS** (exit 0, no diagnostics) |
| Lint | `bun run lint` | **PASS** (no findings) — `.claude/**` added to `eslint.config.mjs` ignores, so the gate reports on application code again |
| Build | `bun run build` | **PASS** (all routes compiled) |

Re-run on 2026-08-25 after Phases 14–15, all three still **PASS** (typecheck exit 0,
lint no findings, build compiled every route including the new `/admin/audit`).

Re-run on 2026-08-25 after Phases 12–13, all three still **PASS** (lint reports no
findings; three unused-import warnings raised by the new components were fixed
rather than left). The build's route table lists `/dashboard/earnings`,
`/dashboard/menu`, `/admin/payouts`, `/admin/payouts/[id]`, `/dashboard/analytics`,
`/dashboard/settings`, `/admin/customers`, `/admin/customers/[id]` and now
`/admin/coupons`, `/admin/reviews` and `/admin/reviews/[id]`, which is the compiled
evidence that Phases 8–13 are wired and not merely present as files. A dev-server
smoke test returned **200** for all eleven touched routes (`/admin`,
`/admin/coupons`, `/admin/reviews`, `/admin/reviews/[id]`, `/admin/customers`,
`/dashboard/reviews`, `/dashboard/coupons`, `/account/coupons`, `/account/reviews`,
`/offers`, `/restaurants/bella-napoli`) with no runtime error in the log.

One transient build failure is worth naming so it is not mistaken for a
regression: `bun run build` occasionally aborts with `Failed to fetch
'Plus Jakarta Sans' from Google Fonts`. It is `next/font` reaching the network at
build time and nothing to do with any phase — the same tree builds cleanly on
retry (confirmed three consecutive times).

Message catalogues were checked the same way, because a builder whose labels are
missing is a builder that renders blank: `menuBuilder` (104 keys), `finance` (95)
and `dietary` (7) are key-for-key identical across `en`, `bn` and `ar`, and every
`t("…")` key these components ask for resolves — including the nested
`finance.errors.settlementNotPayable` that `lib/settlement` returns as a
`PayoutError`.

Phase 10 added three namespaces — `handover` (22 keys), `analytics` (48) and
`vendorSettings` (161) — plus additions to `dashboard`, `delivery` and `admin`.
All three locales are **key-for-key identical** (4041 keys each, zero symmetric
difference), every literal `t("…")` in the new and changed components resolves,
and each dynamic key union was enumerated and checked member by member (the four
handover checks and their hints, the five range presets, the five settings tabs,
the five staff roles and their hints, the three staff statuses, all eleven
permissions, the four permission origins, and every `SettingsError` / `StaffError`
/ `OnboardingError` member the surfaces can render).

Phases 12–13 added two namespaces — `campaigns` (96 keys) and `moderation` (118) —
plus 17 keys under `reviews` (the report dialog and its seven grounds, the two
`moderated.*` lines and `errors.alreadyModerated`), `coupons.status.paused`,
`coupons.reason.paused`, `coupons.errors.pausedCode`, and `admin.navCampaigns` /
`admin.navReviews`. All three locales are **key-for-key identical** (4405 keys each,
up from 4169, zero symmetric difference), and every dynamic key union was enumerated
member by member — the four campaign kinds, five segments, four sorts and seventeen
`CampaignError` members; the five queue segments, three queue sorts, four moderation
statuses, six log actions, three reporter roles, five toasts and nine
`ModerationError` members; the seven report grounds; and all five `CouponStatus`
members now that `paused` exists. **250 keys × 3 locales checked, none missing.**

The catalogues were parsed the harder way as well, because key symmetry does not
catch a malformed plural: every message in `campaigns`, `moderation`, `reviews`,
`coupons` and `admin` was parsed and formatted with `intl-messageformat` —
next-intl's own ICU engine — at counts 0, 1, 2, 3 and 11, so the `=0` / `one` /
`other` branches of the Bengali and Arabic plurals were each rendered rather than
merely present. **11,190 formats parsed and rendered, none failed.**

Phase 11 added one namespace — `customers` (126 keys) — plus `admin.navCustomers`
and `checkout.errors.accountBlocked`. All three locales are **key-for-key
identical** (4169 keys each, zero symmetric difference), every literal `t("…")` in
the two new components resolves, and each dynamic key union was enumerated member
by member (the seven segments, the five sorts, the seven block reasons, the three
moderation actions and the five `CustomerError` members the surfaces can render).

The catalogues were also checked the harder way, because key symmetry does not
catch a malformed plural: every `customers.*` message in all three locales was
parsed and formatted with `intl-messageformat` — next-intl's own ICU engine — at
counts 0, 1 and 3, so the `=0` / `one` / `other` branches of the Bengali and
Arabic plurals were each rendered rather than merely present. **384 messages
parsed and formatted, none failed.**

That last check caught a real defect before it shipped: `next-intl` reads a `.` in
a key as a path separator, so a literal `"orders.manage"` key under
`staff.permission` could never have resolved and the permission editor would have
rendered eleven raw slugs. The catalogue now nests them (`permission.orders.manage`),
which mirrors the slug exactly rather than transforming it in the component. The
same pass also found `dashboard.errors.cashNotConfirmed` missing — a
`TransitionError` member the restaurant board's toast could ask for — and added it.

One standing build note, unrelated to any phase: `bun run build` logs
`[catalog] vendor failed against the API and fell back to the mock layer` once per
prerendered restaurant page, because `config/backend.ts::LIVE` has the catalog slice
on and no GraphQL server answers on `localhost:4000` during a build. The fallback is
the designed behaviour and the build succeeds; the noise stays until the API runs or
the flag is unset.

### Flows actually exercised

Verified by driving the real modules and the real persisted store (throwaway
harnesses, not committed — 156 domain checks and 58 store checks for Phases 6–7,
57 domain/seam checks and 37 store checks for Phase 3, **269 checks for Phase 10**
across four harnesses (57 on the handover, 126 on settings and staff, 80 on
analytics and the CSV export, 6 on order-book uniqueness), **141 checks for
Phase 11** across two harnesses (115 on the customer domain, 26 on the store and the
checkout gate), and **230 checks for Phases 12–13** across three harnesses: 94 on the
campaign engine, its seam and the customer surfaces, 99 on the moderation domain, its
seed and the queue, and 37 on the two new stores), plus a dev-server smoke test of
every touched route:

| Flow | Result |
|---|---|
| **Phase 12 — status** a live campaign reads active; `pausedAt` makes it paused; an expired-and-paused campaign reads *expired* (the window wins); a campaign deactivated before it opens reads *paused* rather than "not started"; a spent-out ticket reads used whatever the desk did | PASS |
| **Phase 12 — the pause bites** `evaluateCoupon` refuses a paused campaign with `reason.paused` and prices it at zero; claiming it is refused with `errors.pausedCode`; applying it at checkout is refused; an ended one is refused as `reason.expired`. This is the seam `checkout-view.tsx` calls at apply *and* at redeem, so a deactivation stops a discount rather than colouring a row | PASS |
| **Phase 12 — separation** no vendor-sourced code and no granted ticket is ever a platform campaign; every offer-minted code is one; the board's rows are all platform campaigns, and vendor codes and grants are counted but not listed; the merchant board is unchanged and no platform-only campaign leaks into it | PASS |
| **Phase 12 — the seed** every coupon carries `pausedAt: null`, codes are unique across the whole catalogue, the four platform seeds exist, and the desk seed deactivates exactly one *live* platform campaign and is deterministic | PASS |
| **Phase 12 — the board** segment counts sum to the total and do not collapse when a segment is picked; every status has a row on a first visit; search matches code/title/description and narrows the counts too; the redemptions sort is descending; ending-soon ranks live campaigns by end date and puts them first; performance is byte-identical across two reads | PASS |
| **Phase 12 — creation** sixteen refusals fire exactly once each (bad code; a code taken by an offer *or* by a restaurant; empty title; 0% and 101%; cashback over 100; zero fixed amount; a zero cap; negative minimum; zero usage limit; 0- and 400-day durations; a start in the past and 91 days out; unknown category). A valid one normalises its code, derives `category` scope from the eligibility set, de-duplicates slugs, zeroes a free-delivery value, and lands the window on the offsets asked for | PASS |
| **Phase 12 — deactivate / reactivate / end** pausing a live campaign works and is refused twice; resuming clears the stamp and is refused when it is already running; both are refused on a restaurant code (`errors.notPlatform`), a grant, an unknown id and an ended campaign; ending closes the window (the row reads expired and keeps its performance) and is refused twice | PASS |
| **Phase 12 — end to end** a campaign created on `/admin/coupons` appears in the customer's claimable rail, is claimable and applies at checkout — and after one tap of *Deactivate* it leaves the rail, refuses the claim, reads *paused* on the ticket already in the wallet, and is refused at the till | PASS |
| **Phase 13 — reporting** the first report mints a pending record and logs itself with grounds and prose; the same reporter is refused a second time and the record stays byte-identical; a second reporter is appended; a report on a hidden or removed review is refused; a report on an *approved* review re-opens it and clears the old decision | PASS |
| **Phase 13 — decisions** hiding refuses missing grounds and a note under eight characters, then stamps status, grounds, who and when and appends one event; hiding twice is refused; restoring a hidden review returns it to *approved* and clears the grounds; restoring, approving or hiding a **removed** review is refused (`errors.removedIsFinal`); a note changes nothing but the log; the log is append-only, time-ordered, and its event ids are unique | PASS |
| **Phase 13 — the seed** is deterministic, covers all four statuses across six restaurants, resolves every record to a real review in the corpus it names, never puts two records on one review, carries grounds *and* prose of at least eight characters on every taken-down record, leaves no stale reason on a pending or approved one, includes a review with two reports, and still resolves when built for yesterday | PASS |
| **Phase 13 — the queue** resolves every record with its review, restaurant, order and author, and counts (rather than renders) a record whose review no longer exists; totals agree with the rows; segment counts sum to the total and do not collapse when a segment is picked; the default is what is waiting; the critical filter keeps only 2★ and below; the reports sort is descending and the lowest sort ascending, both stable across calls and independent of input order; multi-word search is an intersection over the comment, author, reference, restaurant and the report prose | PASS |
| **Phase 13 — the decision bites** a hidden review and a removed one both leave the restaurant's page *and* its filtered total, and are present again when the same corpus is read without the decisions; a merely reported review stays up. This is the seam the storefront, the merchant board, the rider profile and the AI summary all read, so one decision removes it from four surfaces | PASS |
| **Phase 13 — the author** keeps their own hidden review in `/account/reviews` and is told it is hidden, while the same review is off the restaurant's page | PASS |
| **Phase 13 — the store** a report mints one row; the same reporter is refused twice; deciding on a review nobody reported is refused and mints nothing; hide → restore leaves `report,report,hide,restore` in the log; a reset rebuilds the seeded queue and drops this device's own decision | PASS |
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
| **Phase 10 — handover** the code is 4 digits, deterministic, never equal to the order's doorstep OTP, and null when no courier is assigned | PASS |
| The code is bound to the *assignment*: another courier's code is refused, and a courier dispatch never sent cannot produce one | PASS |
| `picked-up` refused with no handover, with a partial checklist, and with a wrong code — order byte-identical after each refusal | PASS |
| Accepted with all four checks and the right code; stamps `handoverVerifiedAt` at the transition instant, records the checks in the domain's own order, appends exactly one event, leaves the attempt counter alone | PASS |
| Code entry tolerates separators (`12 34`) | PASS |
| Restaurant, rider and admin may all complete it and all three are gated; the customer is still refused (`errors.notPermitted`) | PASS |
| Three failures lock the handover (`errors.handoverLocked`) and the right code is then refused too; two failures do not lock; each failure logs its own event | PASS |
| `requiresHandover` is false for a pickup order and for a delivery with no courier — absences, not exemptions | PASS |
| All three surfaces' action lists *derive* the prompt from the machine (`restaurantActions`, `riderActions`, `adminActions`); admin's `picked-up` falls back to a plain confirm when there is nothing to verify | PASS |
| The demo autopilot proposes a collect, carries a valid handover patch, and the machine accepts it — it satisfies the same guard rather than bypassing it | PASS |
| v5 → v6 migration: backfills the counter, records an already-collected order as verified at its own `picked-up` event, invents **no** checklist, idempotent, and returns a modern order by reference | PASS |
| Seeded working set: every collected order is stamped verified at its `picked-up` event time, none carries a fabricated checklist, uncollected orders stay unverified, still deterministic | PASS |
| **Phase 10 — settings** an empty draft folds to the *same object* (no re-render churn); the fold renames the listing, patches the address without moving the coordinates, and leaves rating, review count and commission rate alone | PASS |
| A blank promo headline becomes null rather than an empty badge; a refused save leaves the draft untouched by reference | PASS |
| Profile validation: short description, no cuisine and empty name each refused | PASS |
| Contact falls back to the application, is empty (not invented) with no application, and a saved contact wins over both | PASS |
| Hours: an all-closed week refused; a half-filled day refused; identical open/close refused; an unparsable time refused; **overnight service (18:00–02:00) allowed**; one trading day is enough | PASS |
| Delivery: neither mode refused, pickup-only fine, negative fee/minimum/free-over refused, reversed and zero-floor ETA windows refused; the fold carries fee, ETA and free-over to the listing the storefront prices from | PASS |
| Delivery modes resolve from the *application* (`Vendor` has no such field) and the four numbers from the listing | PASS |
| Branches: deterministic id from vendor + instant, validation on all four fields, edit in place keeps the id, editing an absent branch refused, removal and no-op removal both correct | PASS |
| `effectiveSettings` reads branches from the application and never from the draft, and reports `authored` correctly both ways | PASS |
| **Phase 10 — staff** the owner record is minted active, keyed on the *account* not the clock (so a second device finds it rather than minting a rival owner), and holds every permission | PASS |
| Role grants are materially distinct: kitchen cannot see earnings, manager cannot manage staff or settings, cashier cannot edit the menu | PASS |
| Invite: duplicate address refused case-insensitively *per restaurant*, the same person may work at two, bad email refused, an optional phone still validated, empty phone stored as null, id deterministic | PASS |
| An invited member holds **no** permissions until activated; activation stamps its date; activating an active member is refused (`errors.illegalTransition`); the graph forbids returning to `invited` | PASS |
| Deactivation stamps its own date, keeps the start date, and folds the member to **nothing** — a deactivated colleague cannot do their old job | PASS |
| The last *active* owner cannot be deactivated or demoted; an **invited** second owner does not count as cover; with two active owners both moves are allowed | PASS |
| Permissions are stored as the *difference* from the role: turning on what the role grants records nothing, turning it off records a revoke, granting-then-revoking leaves neither, and a revoke beats a grant | PASS |
| Only an invitation can be withdrawn (and as a soft delete); an active member and the owner's own account record are both refused | PASS |
| `teamFor` scopes to one restaurant, orders active before invited, and hides soft-deleted members | PASS |
| **Phase 10 — analytics** every preset resolves; windows snap to whole days and are stable across a clock tick inside the same day; a reversed custom range is swapped, an unparsable one falls back to the default rather than producing `NaN` bounds, an absurd one is clamped to 730 days | PASS |
| Windowing is by *placement* for every figure, so revenue, commission and the cancellation count describe the same set of orders | PASS |
| Revenue and order count exclude every bad ending; AOV is revenue over orders; completed counts `completed`; cancelled counts every failure mode | PASS |
| **Commission and net revenue are read off the stamped `OrderFinancials.commission` records, never recomputed** — verified by summing the records directly, and by `net + commission` equalling the *commissionable* base rather than the gross | PASS |
| Buckets: daily to a fortnight, weekly beyond; a 90-day window yields ≤14 legible buckets; the buckets sum to the reported revenue and order count; the series is oldest-first | PASS |
| Peak hours and top products are the windowed orders', ranked by units, and never exceed the order count | PASS |
| The report is deterministic, and an empty window reports zeros rather than `NaN` | PASS |
| **One order book, two readings:** `getVendorAnalytics` and `getVendorEarnings` quote the same currency, and analytics' commission and net revenue equal the earnings page's over the same window — the spec's "analytics must use actual shared order data", checked rather than asserted | PASS |
| A vendor with no listing and no orders resolves to a zeroed report rather than throwing | PASS |
| CSV: CRLF, commas quoted, embedded quotes doubled, full numeric precision, null cells empty — and a leading `=`, `+`, `-` or `@` neutralised, so a dish called `=Wagyu (2kg)` is not a formula in the restaurant's own spreadsheet | PASS |
| Export filename is slugged, date-stamped, stable for the same window, and still produced for a vendor whose name slugs to nothing | PASS |
| **Order book (the fix)** no vendor's synthesised week contains a duplicate id or reference; the unioned platform book has none; every settled order lands in exactly one settlement line; no duplicate vendor+period; determinism survives; every seeded order is distinct | PASS |
| Dev-server render of `/`, `/dashboard`, `/dashboard/analytics`, `/dashboard/settings`, `/dashboard/orders`, `/dashboard/earnings`, `/dashboard/menu`, `/admin`, `/admin/orders`, `/delivery`, `/account/orders` | 200, no new errors |
| The two new routes render under `bn` and `ar` with no `MISSING_MESSAGE` / `IntlError` in the dev log | PASS |
| **Phase 11 — identity** formatting variants of the same number (`+880 1711 223344`, `(017) 1122 3344`) collapse to one key and one id; different numbers never collide; the id is URL-safe and carries no phone number; an empty number resolves to `cus_unknown` rather than an empty id | PASS |
| **Phase 11 — blocking** a block stamps status, grounds, who and when and appends one log entry carrying the moderator's prose; a *second* block is refused (`errors.alreadyBlocked`) and leaves the record byte-identical; a note shorter than 8 characters is refused; missing grounds are refused | PASS |
| Unblocking restores the status and clears grounds, `blockedAt` and `blockedBy` — and keeps both entries in the log, so what happened survives the reinstatement; unblocking an active account is refused; the note is optional | PASS |
| A note changes no status, carries no grounds, and is refused when it says nothing; two actions committed at the same instant keep distinct event ids | PASS |
| **Phase 11 — money is derived, never invented** gross counts only orders the customer was charged for (a pending cash order in flight is excluded); settled refunds subtract; an over-refund clamps net spend at zero rather than going negative; the average is over charged orders and is `0` not `NaN` when there are none | PASS |
| Favourite restaurant, last delivery area, average rating and first/last order date are all read off the order records; a customer with no orders reports zeroes and nulls rather than throwing; only *live* tickets count as open | PASS |
| **Phase 11 — the join** orders and tickets match on the normalised phone regardless of how either was typed; soft-deleted orders are skipped; an empty phone matches nothing rather than everything | PASS |
| **Phase 11 — the directory** a guest with orders and no managed row appears unbidden, unverified, with `joinedAt` set to their first order and their newest name; a managed row's block survives an incoming order while its *name* is refreshed from it; a seeded account with no orders is still listed, with zero spend; the list is sorted by most recent activity | PASS |
| **Phase 11 — search** multi-word search is an intersection over name, phone, email, reference and area; segment counts narrow with the search box but do **not** collapse when a segment is picked; never-ordered is not counted as lapsed; every sort is descending on its own key and the name tie-break makes the order independent of input order | PASS |
| **Phase 11 — the seed** is deterministic; ids match their phones and are unique; it contains a verified, an unverified, a blocked and a never-ordered account plus one linked to the `usr_customer` sign-in; every blocked seed carries grounds *and* prose; no active seed carries a stale block stamp | PASS |
| **Phase 11 — the store** blocking a guest who has only ever been an order contact mints exactly one account row, keeps the name from their order, and is then refused a second time; blocking an unknown id is refused; unblocking reinstates without deleting the row and leaves both decisions in the log; seeding twice is idempotent | PASS |
| **Phase 11 — the gate bites** `isPhoneBlocked` refuses the blocked number, refuses it written with spaces, and lets an unrelated number through; after an unblock the same number passes again. This is the seam `components/checkout/checkout-view.tsx` calls at submit, so a block stops an order rather than colouring a row | PASS |
| **Phase 14 — effective permissions** resolved for all eight seeded accounts: customer, restaurant owner and rider hold **nothing**; the super-admin's `*` expands to all twenty; the four desk accounts hold exactly their role's set and no more | PASS |
| **Phase 14 — the colon-slug leak** `orders:view` on `restaurant-owner` grants nothing. Verified by regression: the first implementation normalised `:`→`.` and admitted `owner@foodora.dev` to platform operations with `orders.view` — the whole platform order list. Caught before commit and the normalisation now refuses the legacy form | PASS |
| **Phase 14 — nav and route agree** for all five desk roles the set of paths `permissionForAdminPath` + `hasPermission` allow is exactly the set the nav renders; a deep path (`/admin/orders/ord_1`, `/admin/cms/pages/x`) resolves to its section's permission and bare `/admin` does not swallow it; a path outside `/admin` resolves to `null` | PASS |
| **Phase 14 — the guards bite in the domain, not just the button** signed in as `moderator@foodora.dev`, `decideVendor`, `customers.block`, `payVendor` and `advance(…, "admin")` each return `errors.notPermitted`; signed in as the super-admin the same four calls proceed (the payout returning its own `errors.settlementNotPayable`, which is the domain rule and not the permission) | PASS |
| **Phase 14 — the customer flows are untouched** `advance` is guarded only on the `admin` actor, so a customer cancellation, a restaurant acceptance and a rider delivery are unaffected; `decideRefund`'s internal wallet settlement passes `by: "system"` and is not guarded. Confirmed by the autopilot's transition table containing no `admin` actor | PASS |
| **Phase 15 — all ten mutation groups record** driving the real stores as the super-admin produced `order.intervened`, `order.rider-assigned`, `restaurant.decided`, `rider.decided`, `refund.decided`, `payout.paid`, `payout.run`, `coupon.created`, `coupon.paused`, `customer.blocked`, `settings.changed` and `permission.changed`, each with a readable sentence and the entity it names | PASS |
| **Phase 15 — the seed names real entities** built from the live working set, it picks a completed delivery, one that ended badly and a blocked account by *rule*; every description resolves (no `undefined`, no doubled full stop) and the four desk accounts appear as actors | PASS |
| **Phase 15 — replay appends once** recording the same mutation twice at the same instant yields one entry (deterministic id, deduped on write and on read); the seam's counts and actor list are computed over the unfiltered set so a filter cannot hide its own options | PASS |
| **Phase 15 — the seam joins both sources** `getAuditLog` merges the platform log with `stores/cms.audit` through `fromCmsAudit`, sorted newest-first; `auditRows` yields the eight-column CSV `lib/export.toCsv` expects; the action filter narrows correctly | PASS |
| **Phase 15 — recording survives an unhydrated store** `recordAudit` rehydrates before appending, and falls back to an in-memory append where persistence is unavailable. Verified by regression: the first implementation dropped the entry when `persist.rehydrate` was absent | PASS |
| **Phases 14–15 — dev-server smoke test** `/admin`, `/admin/audit`, `/admin/orders`, `/admin/payouts`, `/admin/reviews`, `/admin/coupons`, `/admin/cms`, `/dashboard/settings`, `/account/orders` | 200, no runtime error in the log |
| **Phases 14–15 — the message keys** caught by that smoke test: next-intl refuses a `.` **inside** a key, so the first `audit.action` block threw `INVALID_KEY` on every render. The nineteen action labels are now nested by resource (`action.order.intervened`), which is the slug's own dot read as the message path. Zero `INVALID_KEY` after the fix | PASS |
| Directory derived over the *seeded* device: every seeded order's contact is present, total net spend is non-zero, and no row's net exceeds its gross | PASS |
| Dev-server render of `/admin/customers`, `/admin/customers/[id]`, `/admin/orders` and `/checkout` under `en`, `bn` and `ar` | 200, no new errors |

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

No architectural violations were introduced by Phases 6–7, and none by Phases 1–7
as a whole.

---

### Added in Phases 8–9

```text
lib/settlement.ts          (extended: rider settlements, payout minting, adjustments, totals)
lib/payout-search.ts       (pure: one query object, both ledgers)
   ↓
stores/payouts.ts          (the transfers themselves — the one financial fact that is not derived)
   ↓
services/finance.ts        (the seam Phase 2 deferred: getVendorEarnings · getPlatformPayouts · getPayoutStatement)
   ↓
components/finance/*       (shared: commission statement · status chip · payout filters)
   ↓
/dashboard/earnings · /admin/payouts · /admin/payouts/[id]

types/menu.ts              (MenuDraft · MenuItemStock · StockState · MenuBoardSection · OptionGroupDraft)
   ↓
lib/menu.ts                (pure: sections, items, option groups, stock, and `buildMenuBoard` — the fold)
   ↓
stores/menu.ts             (one draft per vendor, expressed in the catalog's own types)
   ↓                                    ↘
components/dashboard/menu/*              components/menu/use-menu-item.ts
   (builder · item editor · stock)         ↓
   ↓                                     add-to-cart-button · qr-item-row → ItemCustomizer
/dashboard/menu
```

* **Everything financial stays derived except the transfer.** A commission is
  stamped on an order at completion (Phase 2) and every settlement, balance and
  total is recomputed from those stamps on demand. `stores/payouts` holds the single
  fact that *cannot* be recomputed — that money moved, at an instant, run by a named
  account, with a reference somebody can quote. A settlement's `paid` status is then
  projected back **from** the payout by `lib/settlement`; no status is written
  anywhere. That is why Phase 8 needed no change to `buildVendorSettlements`: it was
  already clock-injected and already accepted `payouts` and `adjustments`, so the
  phase supplied data rather than logic.
* **`services/finance.ts` is the seam Phase 2 deliberately deferred.** Phase 2
  recorded that a finance service with one consumer would be a wrapper; Phase 8 gave
  it the two real consumers it was waiting for — the restaurant's earnings page and
  the platform's payout run — and the module exists now for that reason and not
  before.
* **A period is paid at most once, guarded on the period and not the settlement.**
  The guard is `vendorId`/`riderId` + `periodRef`, because a settlement object is
  recomputed on every render and its identity is not stable across a rehydrate. A
  replay — second tab, double click, restored store — has to find the *period*
  already paid.
* **Two ledgers, one screen, one query.** A vendor settlement and a rider
  settlement are the same shape over different payees, so `/admin/payouts` makes
  them tabs over one `PayoutQuery` rather than two routes, and the filter, the
  status counts and the totals row are shared components. The totals row totals the
  **filtered** rows: a total that ignored the filter is the most plausibly wrong
  number the screen could show.
* **The restaurant's payout column is read-only on purpose.** A restaurant does not
  run its own payout — the desk does, on `/admin/payouts` — so the earnings page
  shows the result of a run and never a control that would start one.
* **Pending and available are two different facts.** Pending is money from the
  period still running; available is money from closed, unpaid periods. Collapsing
  them into one "balance" is what makes a restaurant think it can withdraw this
  week's takings.
* **The authored menu is a diff, not a second menu.** The catalog is a read-only
  seed (and, behind `LIVE.catalog`, a server-owned table), so `stores/menu` holds one
  draft per vendor — created rows, field patches, removals, ordering, stock —
  expressed in the catalog's own types, exactly the arrangement
  `stores/merchant.unavailable` has always used for the 86 switch.
  `lib/menu.buildMenuBoard` folds it back over the catalog and that fold is the only
  reader, so there is no second menu model to keep in step.
* **The customiser resolves through the same fold.** This is Phase 9's explicit spec
  requirement and the one a plausible implementation would miss. The storefront menu
  is server-rendered and cannot see a client draft, but its *interactive* half can:
  `useMenuItem` folds the draft through `lib/menu.effectiveItem`, so an option group
  the restaurant authored is the same `FoodOptionGroup` record the customiser renders
  and the cart line prices. It returns the prop unchanged before hydration — the
  first client render has to match the server's, and assuming an edit exists while
  the draft is still being read would swap a price under the customer's cursor. It
  returns null for a deleted dish, because a cached page must not keep something
  orderable after the restaurant removed it.
* **Availability is derived from the count, never stored beside it.** The 86 switch
  stays in `stores/merchant.unavailable` where the POS already reads it, and the
  automatic out-of-stock state comes from `lib/menu.stockStateOf` over the quantity.
  A boolean written next to a count is how a menu ends up with a dish that is in
  stock and unavailable at the same time.
* **A required group with a minimum of zero cannot be saved.** The item editor
  raises the minimum with the required flag, and `optionGroupError` enforces it in
  `lib/menu` rather than in the dialog — otherwise the customiser would render a
  group it claims is required and let the customer past it.
* **Section reorder is two buttons, not a drag handle.** Deliberate: it has to be
  operable by keyboard and on a phone in a kitchen, and a drag handle is neither.
* **No second lifecycle, no second store, no service reading a store.** Nothing in
  `lib/` reads a store in either phase; the order machine is untouched; the payout
  run emits its notifications through the same routing gate as everything else, so
  money moving cannot be silent to the person receiving it.

No architectural violations were introduced in Phases 1–9. Both stores state their
Phase E exit in their own header: `stores/payouts` becomes a cache of a server-owned
`payouts` table and `payVendor` becomes a mutation call; `stores/menu` replays its
patches as catalog mutations and the draft becomes an optimistic cache. Neither
action signature changes.

---

### Added in Phase 10

```text
types/order.ts             (OrderLifecycle: handoverAttempts · handoverVerifiedAt · handoverChecks)
   ↓
lib/delivery.ts            (handoverCodeFor — hashed from order + COURIER, beside otpFor)
lib/order-machine.ts       (`picked-up` guard, HANDOVER_CHECKS, lockout, recordHandoverFailure)
   ↓
stores/orders.ts           (failHandover; v5 → v6 migration)
   ↓
components/orders/handover-dialog.tsx   (shared: board · rider trip · admin order page)

types/vendor-settings.ts   (VendorSettingsDraft · VendorSettings — a diff, not a second listing)
types/staff.ts             (StaffMember · StaffRole · StaffPermission)
   ↓
lib/vendor-settings.ts     (pure: the fold `effectiveVendor`/`effectiveSettings`, validators, branches)
lib/staff.ts               (pure: the grant table, `effectivePermissions`, `staffCan`, the graph, guards)
lib/export.ts              (pure: toCsv + the browser half, kept apart)
   ↓
stores/vendor-settings.ts  (one draft per vendor)   stores/staff.ts  (one flat table, FK on the row)
   ↓                                    ↘
components/dashboard/settings/*          stores/onboarding.editVendor   (branches' only home)
   ↓
/dashboard/settings   (tabs: profile · hours · delivery · branches · staff)

types/dashboard.ts         (AnalyticsRange · VendorAnalytics · RevenuePoint.spanDays)
   ↓
lib/analytics.ts           (resolveRange · ordersInRange · revenueBuckets · analyticsFor)
   ↓
services/finance.ts        (getVendorAnalytics — beside getVendorEarnings, over ONE order book)
   ↓
components/dashboard/analytics-view.tsx + analytics-range.tsx
   ↓                                    ↘
/dashboard/analytics                      overview-view.tsx  (its three charts now read the same call)
```

* **The handover code is a property of the *assignment*, not a secret.** It is
  hashed from the order id **and the assigned courier's id**, which is what makes
  it verify something the prototype can actually verify: a courier dispatch never
  sent cannot produce it, and `reassignRider` retires the old code with nothing
  having to remember to. It is deliberately *not* claimed to be confidential —
  both parties are standing at one counter and the courier's own app shows it — and
  `HandoverDialog` says so on screen. Derived rather than stored, for the same
  reason `otpFor` is: the board and the rider app reach the same value with no
  backend between them, and salted differently so the two codes on one order can
  never coincide.
* **The guard is in the machine, not in the dialog.** Three surfaces can collect an
  order — the restaurant's board, the courier's trip screen, the operations desk —
  and a check written into one dialog is a check the other two do not perform. So
  `transition()` refuses `picked-up` without both halves, `adminActions` derives
  the prompt from the graph, and **the demo autopilot has to satisfy the same guard**
  (it supplies the checklist and quotes the order's own code) rather than having a
  privileged path. Only three fields were added to `OrderLifecycle`, mirroring
  `otp`/`otpAttempts`/`otpVerifiedAt` exactly.
* **A migration records what happened, not what would have looked tidy.** An order
  that had already been collected is stamped verified *at its `picked-up` event's
  own time*, and its `handoverChecks` stays **empty** — an old handover happened and
  had no checklist behind it, which is the truth and is distinguishable on screen
  from one driven on this device. The seeded working set follows the same rule.
* **Settings are a diff over the listing, and the fold is the only reader.**
  `stores/vendor-settings` holds one draft per vendor expressed in the catalog's own
  fields; `lib/vendor-settings.effectiveVendor` folds it back. `DashboardShell` folds
  once and passes the result down the context every page already reads, so the topbar
  shows the same name the settings form is editing. The fold returns the *same object*
  for an empty draft, so a restaurant that has changed nothing pays nothing for it and
  no clock tick re-renders the tree. The storefront still reads the seed — it is
  server-rendered and cannot see a client draft — which is the same honest boundary
  Phase 9 drew for `useMenuItem`.
* **Two fields the catalog genuinely lacks are recorded, not invented.** `Vendor` has
  no phone number and no pickup/delivery switch, and both are things the spec asks a
  restaurant to set. They resolve from the onboarding application — where the
  applicant already answered them — and fall back to empty rather than to a plausible
  placeholder. That is the same call `types/menu.ts` made for stock counts.
* **Branches stayed a record.** Phases 6–7 declined to mint a listing per outlet
  because a second listing sharing one menu and one kitchen is a branch a customer
  could order from and nobody could fulfil. Phase 10 honours that instead of
  overturning it: branches live on `VendorApplication.branches` and are edited through
  `stores/onboarding.editVendor`, so the change lands in the reviewer's audit log and
  there is no second answer to how many outlets exist. The screen says so too.
* **A role grants permissions; a person carries only the difference.**
  `STAFF_PERMISSIONS` is the one answer to "what may a manager do", and a member
  stores `grants`/`revokes` — so changing the table reaches everybody who was not
  explicitly excepted, and there is no stored copy to drift. `effectivePermissions`
  folds it and returns **nothing** for a member who is not active, because that is
  what deactivation *is* — the same reasoning that routed rider suspension through
  the one availability chokepoint in Phase 7.
* **Analytics reads the shared order book and does no arithmetic on money.** The
  binding constraint for this phase was "analytics must use actual shared order
  data", and `getVendorAnalytics` sits beside `getVendorEarnings` in
  `services/finance` precisely so both go through `vendorOrderBook`: a resolver in
  another module would anchor the synthesised week to a different instant and the
  counts would drift from the money by a few orders. Commission and net revenue are
  read off the `OrderFinancials.commission` records the `completed` transition
  stamped in Phase 2 — multiplying revenue by 15% would look right and would
  disagree with `/dashboard/earnings` for every vendor on a negotiated rate.
* **The overview's second analytics path is gone.** Its three charts came off
  `getVendorDashboard`, which only ever saw the synthesised week, so they described a
  different set of orders from the KPI cards directly above them. They now read
  `getVendorAnalytics`, and `revenue`/`peak`/`bestSellers` were **removed** from
  `VendorDashboard` rather than left behind as the dead read path G41 already flags
  once.
* **A pure module still formats nothing.** `RevenuePoint` gained `spanDays`, not a
  pre-rendered label: `lib/analytics` has no `next-intl`, and hard-coding "Aug" into
  the domain layer is how a localised dashboard ends up with one English axis. The
  chart formats the bucket with the request's own formatter.
* **No second lifecycle, no second store reading another, no service reading a
  store.** Nothing in `lib/` reads a store in this phase either; the order machine
  gained one guard and one case rather than a parallel path; and both new stores state
  their Phase E exit in their own header — `stores/vendor-settings` replays its patches
  as catalog mutations, `stores/staff` becomes a cache of a server-owned `staff` table
  whose `invite` actually sends the mail. Neither action signature changes.

No architectural violations were introduced in Phases 1–10.

---

### Added in Phase 11

```text
types/customer.ts          (Customer · CustomerStats · CustomerRecord · CustomerModerationEvent)
   ↓
lib/customers.ts           (pure: normalisePhone · customerIdFor · block/unblock/note guards ·
                            customerStats · buildDirectory — the join, and every derived number)
lib/customer-search.ts     (pure: CustomerQuery · inSegment · filterCustomers · countBySegment)
lib/mock/customers.ts      (buildDemoCustomers(now) — profile + status only, no numbers)
   ↓
stores/customers.ts        (accounts the desk has acted on; `directory()` derives the rest
                            from stores/orders + stores/support at read time)
   ↓                                    ↘
components/admin/customers-view.tsx      components/checkout/checkout-view.tsx
components/admin/customer-detail-view.tsx   (the gate: isPhoneBlocked at submit)
   ↓
/admin/customers   ·   /admin/customers/[id]
```

**The phone is the join key, and that is a decision rather than a shortcut.** An
`Order` carries `contact.phone` and a `SupportTicket` carries `customerPhone`;
neither carries an account id, because checkout has always been open to guests.
The alternatives were both worse: minting a `User` per synthesised name invents
records §5.2 forbids, and adding `Order.customerId` means changing the GraphQL
wire format (`lib/graphql/order.operations`) and migrating every persisted order to
backfill a value nobody ever collected. `customerIdFor` hashes the normalised phone
instead — deterministic across devices and reloads, so a `/admin/customers/cus_…`
link is shareable, and a hash rather than the number itself because an id ends up
in a URL.

**What is stored is only what a person decided.** Profile, verification, account
status and the moderation log. Every countable — spend, order counts, disputes,
favourite restaurant, average rating — is derived on read by
`lib/customers.customerStats`, so there is no cached total that can drift from the
books (§5.4). `grossSpend` uses the order machine's own test for "was this customer
charged" (`payment.status` of `paid` or `refunded`, the condition `openRefundOwed`
guards on) rather than a second opinion about which statuses mean money moved.

**A block reaches a chokepoint.** Phase 7's lesson, applied: `stores/customers.isPhoneBlocked`
is read by `components/checkout/checkout-view.tsx` at submit, before `placeOrder`,
so blocking somebody in the admin directory refuses their next order. Checked at
submit rather than on the contact field, because the number can be edited up to the
last keystroke and refusing mid-typing would tell somebody they are blocked before
they have finished saying who they are.

* **No second lifecycle, no second store reading a service, nothing in `lib/`
  reading a store.** `lib/customers` and `lib/customer-search` are pure and
  clock-injected like `lib/support`, `lib/settlement` and `lib/onboarding`; the
  store reads the other two stores the way `stores/support.resolve` already does.
  The order machine is untouched, and no persisted shape changed — `stores/customers`
  is new at version 1, so no migration exists to get wrong.
* **The demo reset was extended, not left behind.** `resetCustomers` joins the
  other seven in `components/demo/demo-bar.tsx`: a block laid down during the last
  demonstration would otherwise silently refuse the next reviewer's checkout with no
  order history left on screen to explain why.
* **Phase E exit, stated in the store's own header.** `stores/customers` becomes a
  cache of a server-owned `customers` table and `block`/`unblock`/`addNote` become
  mutation calls; `buildDirectory` becomes the server's query. No action signature
  changes.

### Added in Phases 12–13

```text
types/coupon.ts            (Coupon.pausedAt · CouponStatus "paused" · CampaignRow ·
                            CampaignSegment · CampaignSort)
   ↓
lib/coupons.ts             (pure, unchanged evaluator: couponStatus now derives "paused";
                            evaluateCoupon refuses it; isPlatformCampaign / isGrantedCoupon)
lib/mock/coupons.ts        (PLATFORM_SEEDS · buildCampaignDeskSeed(now) — the desk's decisions,
                            never the catalogue's)
   ↓
services/coupons.ts        (PlatformCampaignContext · getPlatformCampaigns ·
                            createPlatformCampaign · setCampaignPaused · endCampaign;
                            the same context threaded into every customer read)
   ↓
stores/campaigns.ts        (created · paused · endedAt — decisions only, no performance;
                            useCampaignDesk() is the one place they are assembled)
   ↓                                    ↘
components/admin/campaigns-view.tsx      account/coupons-view · offers/claim-coupon ·
/admin/coupons                           checkout/checkout-view  (all read the desk)


types/review.ts            (ReviewReport · ReviewModerationRecord/Event/Status ·
                            ReviewReportReason · ReviewQueueRow + its context shapes)
   ↓
lib/review-moderation.ts   (pure: report/approve/hide/remove/restore/note guards ·
                            isReviewVisible · filterQueue · countBySegment · sortQueue)
lib/mock/review-reports.ts (buildReviewModeration(now) — reviews picked by rule, records
                            built by running the domain)
   ↓
services/reviews.ts        (ReviewContext.moderation · every corpus filtered through it ·
                            getModerationQueue · getModerationRow — the joins)
   ↓
stores/review-moderation.ts (one row per reported review; every write via the domain)
   ↓  (joined once by stores/reviews.useReviewContext)
components/admin/review-queue-view.tsx · review-moderation-detail.tsx
components/reviews/report-review-dialog.tsx  (customer *and* merchant report from it)
   ↓
/admin/reviews   ·   /admin/reviews/[id]
```

**One engine, one evaluator, one new column.** Phase 12 added `pausedAt` to `Coupon`
and `paused` to `CouponStatus` and changed nothing else about pricing. Every surface
that reads a coupon — the wallet, the deals page, the checkout picker, the merchant
book and the new campaign board — still asks `lib/coupons.evaluateCoupon`, so a
campaign the desk deactivates is refused everywhere at once and the refusal carries
its own reason (`reason.paused`) rather than being indistinguishable from an expiry.

**The desk's decisions are context, not a second catalogue.** `PlatformCampaignContext`
carries three fields (created, paused, ended-early) into the seam on every call — the
C16 `BookContext` / C18 `RiderContext` / C21 `VendorCouponContext` pattern for a
fourth time — and `stores/campaigns` holds *only* those decisions, keyed by coupon
id. A seeded campaign is never copied into the store, so a pause survives a change to
the campaign's terms and the terms still come from one place. Threading the same
context through the **customer** reads is what makes an admin-created campaign a real
campaign rather than a row in an admin table.

**A moderation decision is a row beside the review.** Phase 13 put nothing on
`Review` and touched no persisted review shape. `ReviewModerationRecord` is keyed on
`reviewId`, which is what lets the platform act on a review the catalogue synthesised
and a customer's browser holds — and what keeps the store the size of the work the
desk has done rather than one row per review. `ReviewContext` gained one field, joined
once in `useReviewContext`, and that single join is why hiding a review removes it
from the storefront, the merchant board, the rider profile and the AI summary
together, aggregate included.

**Both moderation surfaces follow Phase 11's asymmetry.** Taking something down
demands grounds *and* a note of at least eight characters (`MIN_MODERATION_NOTE`, the
same constant `lib/customers` uses); putting it back asks only for confirmation. A
reinstatement that is hard to perform is a reinstatement that quietly does not
happen. Removal is the one irreversible action in either phase, and it is the one the
domain refuses to undo rather than the one a dialog merely warns about.

* **Nothing was rewritten.** No change to `Order`, `OrderFinancials`, the order
  machine, `lib/settlement`, the GraphQL wire format, or any existing store's
  persisted shape. `stores/campaigns` and `stores/review-moderation` are both new at
  version 1, so there is no migration to get wrong. `services/reviews.reportReview`
  changed from a stub that discarded the report to a guard beside the real write; its
  one caller was updated in the same change.
* **The demo reset was extended again.** `resetCampaigns` and `resetModeration` join
  the other eight in `components/demo/demo-bar.tsx`, for the same reason the support
  queue is rebuilt with the orders: a campaign created for the last demonstration
  would still be claimable, and a decision left behind would hide a review the reset
  has just put back.
* **Phase E exit, stated in both store headers.** `stores/campaigns` becomes three
  columns on a server-owned `coupons` table and its three actions become mutations;
  `stores/review-moderation` becomes a `review_moderation` table with `review_id` as
  its key, and `ReviewContext.moderation` becomes a join. No action signature changes.

### Added in Phases 14–15

```text
types/user.ts              (PlatformPermission — §6's 16 + 4 · PermissionResource ·
                            PermissionAction<R>; User.permissions unchanged)
types/audit.ts             (AuditAction · AuditEntityKind · AuditActor · AuditEntry ·
                            AuditQuery; `at` is §6's `timestamp` — see the header)
   ↓
lib/rbac.ts                (pure: ROLE_PERMISSIONS · permissionsFor · hasPermission ·
                            can · ADMIN_ROUTE_PERMISSIONS · permissionForAdminPath ·
                            canOpenAdmin · firstAdminRouteFor)
lib/audit.ts               (pure: actorFrom · buildAuditEntry · describeAudit ·
                            fromCmsAudit · filterAudit · dedupe · isHighImpact)
lib/mock/audit.ts          (buildDemoAudit(orders, customers, applications, now) —
                            entities picked by rule from the live working set)
   ↓
services/audit.ts          (AuditContext · getAuditLog · getEntityAudit · auditRows;
                            the ONE place the platform log and the CMS trail are joined)
   ↓
stores/auth.ts             (+ currentUser · sessionCan · useCan · useHasPermission ·
                            useHasAnyPermission — thin; no rule decided here)
stores/audit.ts            (entries capped at MAX_AUDIT_ENTRIES · record() resolves the
                            actor from the session · recordAudit() for store guards)
   ↓
components/admin/admin-shell.tsx   (ADMIN_ROLES deleted; nav filtered and the route
                                    gated from the same table)
components/admin/read-only-notice.tsx  (the disabled-not-hidden convention, once)
components/admin/audit-log-view.tsx    /admin/audit
```

Guards and recording were added **in the store that commits the mutation**, so the
ten call sites listed in the phase write-up are the only places either concern
appears. No component decides a permission rule; no component records an entry.

* **`ADMIN_ROLES` is gone.** It was the only role check on the platform side and the
  one thing eleven sections shared; nothing replaced it with a second list.
* **The demo reset was extended again.** `resetAudit` joins the other nine in
  `components/demo/demo-bar.tsx`, and is called *last* on purpose: the trail names
  the orders, accounts and applications every reset above it has just rebuilt. It is
  re-seeded rather than emptied, because the log describes a fortnight of desk work
  that happened before the demonstration began.
* **Phase E exit, stated in both store headers.** `lib/rbac`'s tables become a
  `roles`/`permissions` join and `permissionsFor` becomes a claim on the access
  token; `ADMIN_ROUTE_PERMISSIONS` becomes the middleware's table unchanged.
  `stores/audit` becomes a paginated read of an `audit_log` table and `record`
  becomes a mutation — or, more likely, disappears, because a real backend writes its
  own trail server-side. `services/audit.getAuditLog`'s signature stays put either
  way.

No architectural violations were introduced in Phases 1–15.

---

## Next Phase

**PHASE 16 — Admin Analytics (G33).** Not started; needs an explicit instruction.
Phases 1–15 are complete and verified, so this is the first open item in §6's order.

### What the spec asks for

GMV/revenue, orders, completed, cancelled, refunded, commission, vendor
performance, rider performance, customer activity, top restaurants, top products,
delivery performance, a date range and an export — from shared prototype data, with
nothing fabricated where the domain already has an answer.

### What Phases 1–15 leave ready for it

1. **Every number it asks for already has one derivation.** `lib/settlement` owns
   commission and settlement, `services/delivery.riderEarningForOrder` owns rider
   pay, and both hang off `Order.lifecycle.financials` — stamped once at
   `completed`. §5.4 is satisfied by reading them rather than by re-deriving.
2. **The vendor-side version of this screen exists.** Phase 10 built
   `lib/analytics` (`resolveRange`, the bucketing, `RANGE_KEYS`) and
   `components/dashboard/analytics-view.tsx` with its CSV export. Phase 16 is the
   platform-wide read of the same shapes, and the date-range control and the export
   helpers are reusable as they are.
3. **The permission is already enforced.** `analytics.view` is in
   `lib/rbac.PLATFORM_PERMISSIONS` and held by finance, marketing and partner
   operations; adding `{ prefix: "/admin/analytics", permission: "analytics.view" }`
   to `ADMIN_ROUTE_PERMISSIONS` and one `NAV` entry is the whole of the gating work.
4. **The audit trail will answer the "who changed this" column for free.**
   `services/audit.getEntityAudit` already joins both sources per entity and has no
   reader yet.

### Open questions to settle before starting

* **Whether the platform's window is the vendor's window.** `lib/analytics` buckets
  a range for one restaurant's order book. Across 24 restaurants and a demo
  population the bucket count and the "compare to previous period" arithmetic are
  the same, but the *cost* is not — decide whether the platform read is derived per
  request or memoised on the store.
* **What "customer activity" means when the population is synthetic.**
  `admin.notifySegmentHint` already admits on screen that customer segment sizes are
  a generated demo population while restaurants and riders are counted for real.
  Phase 16 has to say the same thing about any customer-side chart, in the same
  words, or it will read as a real number.
* **Whether delivery performance is measured or stamped.** `Order.lifecycle.events`
  has the timestamps for on-time rates and average delivery duration; nothing
  currently aggregates them, and a seeded order's events are synthesised. Decide
  whether the seed's timings are good enough to publish as a KPI or whether the
  chart needs to say what it is looking at.

---

## Deliberately deferred by Phases 14–15 (not omissions)

* **Restaurant staff enforcement is unchanged, and `staff.notEnforced` stays on
  screen.** The previous session's note said Phase 14 was where that sentence came
  down. It does not, and the reason is the sentence's own: there is no mail server,
  nobody can sign in as an invited colleague, and `lib/staff.staffCan` therefore has
  no session to be asked about. Phase 14's vocabulary is entirely
  platform-scoped — every slug §6 lists is an admin surface — and
  `types/staff.StaffPermission` stays a separate vocabulary on purpose: folding them
  would give `settings.manage` two meanings, a vendor's opening hours and the
  platform's configuration. What changed on the merchant side is that its settings
  saves and permission edits now appear in the platform trail.
* **No server-side gate, because there is no server session.** The shell's gate is
  client-side, exactly as the vendor dashboard's has always been. Phase E's
  middleware reads the same `ADMIN_ROUTE_PERMISSIONS` table; nothing about the table
  changes when it does.
* **Review moderation is not in the audit log.** §6's list of important mutations
  does not include it, and `ReviewModerationRecord` already carries its own event
  log which `/admin/reviews/[id]` renders in full. A second, thinner record of the
  same decisions would be the duplication `fromCmsAudit` exists to avoid.
* **Support ticket moves are not in the audit log either**, for the same reason: the
  ticket carries its own thread and its own transitions, and §6's list names the
  refund decision — which *is* recorded — rather than the conversation around it.
* **No per-entity history panel yet.** `services/audit.getEntityAudit` exists and
  has no reader. An order's or an account's own trail belongs beside that entity, and
  adding four panels was outside a phase whose deliverable is the platform log.
* **`metadata` is flat and JSON-primitive.** Nested objects would not survive the
  `localStorage` round trip unchanged and would make the free-text filter unable to
  see inside its own data. A diff of what changed field-by-field is what
  `settings.changed` gives up for that: it records the *section*, not the fields, and
  says so.
* **The CMS trail's actor has no id and no role.** `CmsAuditEntry.by` was always a
  display name, so `fromCmsAudit` derives an actor id from it and labels the role
  `super-admin`. Two content editors sharing a display name would collapse into one
  entry in the actor filter — a real limitation of the older record, and not
  something an adapter can invent its way out of.
* **The log is per browser.** Said on the screen (`audit.deviceNote`) rather than
  implied, the same admission every persisted store in this prototype makes.

---

## Deliberately deferred by Phases 12–13 (not omissions)

* **Who bears a platform campaign's discount is unchanged.** `lib/settlement.commissionFor`
  still charges commission on `subtotal − discount` for every coupon, whoever issued
  it — Phase 2's stated reading of a funded promotion, "both sides give something up".
  A platform-funded line that leaves the vendor whole means a new field on
  `OrderFinancials`, a GraphQL wire-format change and a different answer for every
  settled period; that belongs to a financial phase, not to the campaign editor.
  Stated here rather than half-built.
* **Per-customer credits are still not issued from the admin desk.** Phase 5 left
  "wallet credit as an outcome is recorded, not paid" and named this phase as the
  machinery for it. `Coupon` already models a granted ticket (`claimable: false`,
  `source: "apology"`), and the board counts the grants that exist — but issuing one
  means putting a ticket in *one* customer's wallet, and in this prototype a wallet
  is a browser. A campaign is the honest platform-wide equivalent and is what was
  built; a support-issued credit needs the account model a real backend provides.
* **A campaign's terms cannot be edited after it is created.** Create, deactivate,
  reactivate and end are the spec's list. Editing a live campaign's value or window
  is a different question — it changes what a customer who already holds the code was
  promised — and inventing an answer to that was not in scope.
* **The campaign board does not manage restaurant codes.** By instruction: "keep
  restaurant coupons separate from platform campaigns". They are counted in the
  footer so the desk knows they exist, and `setCampaignPaused` / `endCampaign` refuse
  them with `errors.notPlatform` rather than silently doing nothing.
* **A reported review does not notify anybody.** The nav badge counts what is
  waiting, and that is all. `lib/notifications` fans out to customers, restaurants
  and riders; "the platform desk" is not an audience it has, and inventing one to
  carry a report would be a second, unread inbox.
* **A moderation decision does not notify the author or the restaurant either.** The
  author is told on `/account/reviews` when they next look, which is honest; a mail
  the prototype cannot send is not.
* **The author of a removed review is not penalised.** The queue shows how many of
  their reviews have been reported and how many were taken down — the fact a
  moderator decides on — but nothing suspends an account for it. Blocking a customer
  is Phase 11's action and remains a separate, deliberate decision with its own
  grounds.
* **Rider reviews can be moderated but are not surfaced by rider.** `subject` is
  carried on every record and the queue resolves a rider review's corpus correctly;
  what it cannot show is a *restaurant* context for one (`vendorId` is empty on the
  synthesised rider corpus, and the screen says so). A rider-side moderation view was
  not asked for.
* **Reports are not deduplicated across devices.** The domain refuses a second report
  from the same `by` label, which is the honest guard available without accounts; two
  browsers claiming the same name would count twice. `stores/reviews.reported` still
  holds the device-local list, so the button says "Reported" where it should.

---

## Deliberately deferred by Phase 11 (not omissions)

* **The customer's own surfaces are untouched.** A blocked customer meets the block
  at checkout and nowhere else — no banner on `/account`, no email. §5.5 lists the
  customer app among the things not to rewrite, and the spec's Phase 11 list is an
  admin list. Telling somebody they are blocked, and how to appeal, is a product
  decision with a notification and a copy deck behind it; inventing one here would
  have been the larger change.
* **Blocking does not touch their orders in flight.** An order already accepted is
  food a kitchen has committed to and a courier may be carrying. Stopping the *next*
  order is what a block is; cancelling live ones is an intervention the admin order
  page already offers, deliberately, one order at a time.
* **`isVerified` is read-only.** It is shown and filtered on, but a moderator cannot
  set it. Marking somebody verified from the desk would record a verification that
  never happened, which is the class of fake state Phases 2 and 5 both went out of
  their way to remove.
* **Moderation is gated by the admin shell, not by role.** `/admin/customers` admits
  the same four roles the rest of `/admin` admits. Restricting block/unblock to
  `moderator` and `super-admin` is **Phase 14 (RBAC)**, and `staffCan` — Phase 10's
  grant table — is the mechanism it will use. Adding a second, page-local permission
  check now would be the thing Phase 14 then has to unpick.
* **There is no platform audit log yet.** Moderation events live on the customer
  record, append-only and attributed, which is what a customer's own page needs.
  **Phase 15** builds the cross-entity log, and these events are a source for it
  rather than something it will have to reconstruct.
* **Two people sharing one phone are one row; one person with two numbers is two.**
  The honest consequence of joining on the phone, and it is stated in
  `types/customer.ts` rather than left to be discovered. It resolves itself the day
  accounts are real and `Order` carries a customer id — the directory's shape does
  not change, only what `buildDirectory` groups on.
* **No erase / export of a customer's data.** `BaseEntity.deletedAt` is on the record
  and honoured by every read here, so the soft-delete half already works; a
  right-to-erasure flow is not in §6's list for any phase and was not invented.

---

## Deliberately deferred by Phase 10 (not omissions)

* **A staff member cannot sign in, and the permissions are not enforced across the
  platform.** There is no mail server, so an invitation is a record saying somebody
  was asked rather than a login that exists. `lib/staff.staffCan` is the predicate
  Phase 14 (G31, RBAC) will ask from every shell — it is correct today and needs no
  change; what it is waiting for is a *session* belonging to a staff member to be
  asked about. The staff screen says this in plain words rather than only in a
  comment, which is the same call Phase 5 made in declining an assignee column on
  the support queue and Phases 6–7 made on the onboarding queues.
* **An edited profile is not visible on the storefront.** The listing the customer
  browses is server-rendered from the catalog and cannot see a client draft, so the
  fold reaches every dashboard surface and stops at the storefront. Identical to
  Phase 9's menu boundary, and stated for the same reason: resolving both from one
  query is Phase E's job, and adding a client read to the server page would be the
  second source of truth this arrangement exists to avoid.
* **A branch is recorded, not orderable.** Carried forward unchanged from Phases 6–7
  rather than quietly overturned — see the architecture note above. The screen tells
  the person adding an outlet that orders still come to the one kitchen.
* **Logo and cover are URLs, not uploads.** No file storage exists, and the field's
  own hint says nothing is uploaded. A picker that appeared to accept a photograph
  and kept nothing is the decoration Phases 6–7 refused for documents.
* **Map coordinates are not editable.** There is no geocoder, so the address is a
  free-text patch and the coordinate stays put, with the panel saying which point
  riders are navigating by. A hand-typed latitude would silently move the restaurant
  on the courier's map.
* **Delivery zones are read-only.** They are the platform's geography and decide how
  a delivery is priced and routed. G30 (platform settings) is assigned to **no phase**
  in the v2 spec, so the boundary is stated on the panel rather than crossed.
* **Analytics has no comparison against a previous period.** The spec's list does not
  ask for one, and a "+12% vs last month" figure needs a second window resolved and
  reconciled against the first — worth doing once (Phase 16's admin analytics needs
  the same thing) rather than twice differently.
* **The export is CSV only.** "Local/prototype export where practical" — a PDF needs
  a layout engine the prototype does not have, and the rows are already derived, so a
  spreadsheet is where a restaurant actually does the arithmetic the dashboard does
  not do for them.
* **The handover code is not confidential, and does not claim to be.** Both parties
  are at one counter and the courier's app shows it. It verifies *identity of
  assignment* — that this is the courier dispatch sent — and the dialog's own hint
  says exactly that. A code presented as a secret that the other party can read off a
  screen would be the kind of security theatre this prototype is meant not to have.
* **A migrated handover has no checklist.** Recorded as having happened with nothing
  behind it, because that is what happened. Backfilling four ticks nobody made would
  be a fabricated audit trail.

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
