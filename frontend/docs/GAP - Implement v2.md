# FoodOra — Production-Shaped Prototype Gap Implementation

You are working directly inside the **FoodOra repository**.

The repository contains:

`FOODORA-PROTOTYPE-GAP-ANALYSIS.md`

This document is the source of truth for the remaining prototype gaps, but **do not blindly trust it**. Verify every reported gap against the actual repository before changing anything.

Your goal is to transform FoodOra into a **coherent, end-to-end, production-shaped frontend prototype** while preserving all existing working functionality.

---

# 1. Critical Execution Rule

**DO NOT implement all phases in one continuous session.**

This specification is intentionally divided into bounded phases.

For each session:

1. Read only the relevant gap-analysis sections.
2. Inspect only the files/modules necessary for that phase.
3. Verify the existing implementation before changing it.
4. Implement only the assigned phase.
5. Reuse existing architecture and domain logic.
6. Validate the affected flows.
7. Run typecheck/lint when practical.
8. Summarize what changed and what remains.
9. Stop.

Do NOT start implementing future phases unless explicitly instructed.

Do NOT repeatedly re-audit the entire repository after every phase.

If the current phase is complete, stop rather than finding unrelated work.

---

# 2. Prototype Scope

This is a **frontend-only prototype**.

Do NOT implement:

* PostgreSQL
* Prisma
* GraphQL API
* Redis
* queues
* real payment providers
* real delivery providers
* real SMS/OTP providers
* real external integrations

The prototype must behave as if those systems exist.

All functionality must work through the existing mock/service/store/domain architecture.

The future architecture should remain:

```text
UI
 ↓
Store / Service
 ↓
Mock Repository / Domain
```

Later:

```text
UI
 ↓
Store / Service
 ↓
Real API
```

The UI should require minimal or no structural changes when real APIs are connected.

---

# 3. Existing Architecture Must Be Preserved

The current layering is:

```text
types
  ↓
lib / lib/mock
  ↓
services
  ↓
stores
  ↓
components / routes
```

Preserve this architecture.

Do not introduce a competing architecture merely because it is convenient for one feature.

Components must not directly depend on mock datasets for business operations.

Bad:

```tsx
const order = MOCK_ORDERS.find(...)
```

inside a component.

Preferred:

```text
Component
  ↓
Store / Service
  ↓
Domain / Mock Repository
```

All new mutations should have typed input/output boundaries.

---

# 4. First Session — AUDIT ONLY

Before implementing anything, perform a repository audit.

Read:

* `FOODORA-PROTOTYPE-GAP-ANALYSIS.md`
* relevant `types/*`
* relevant `lib/*`
* relevant `lib/mock/*`
* relevant `services/*`
* relevant `stores/*`
* relevant customer routes
* restaurant dashboard routes
* rider routes
* admin routes

Do NOT inspect every file unnecessarily.

Map the actual implementation of each reported gap.

Classify every gap as:

```text
COMPLETE
PARTIAL
MISSING
INCORRECT
BLOCKED
```

Identify dependencies between gaps.

Create a concise internal implementation map such as:

```text
G03 → order lifecycle
G01/G02 → financial domain
G04/G05/G39/G40 → rider/delivery
...
```

Do not implement anything during this audit session.

Do not spend excessive tokens explaining the repository.

The purpose of this phase is to establish the real implementation state.

---

# 5. Global Non-Negotiable Rules

## 5.1 Order lifecycle

`lib/order-machine.ts` remains the **single authority** for order lifecycle transitions.

Never introduce:

```text
direct status assignment
page-specific lifecycle logic
second order state machine
duplicate order lifecycle store
```

Every lifecycle mutation must use the existing domain transition mechanism.

Example:

```ts
advance(order, "admin", ...)
```

where appropriate.

If the existing state machine needs a legitimate new transition, extend the existing state machine rather than creating another one.

---

## 5.2 Shared domain truth

Customer, Restaurant, Rider and Admin must operate on the same prototype domain records.

Example:

```text
Customer places order
      ↓
Restaurant accepts
      ↓
Rider receives assignment
      ↓
Rider delivers
      ↓
Customer sees delivery state
      ↓
Order completes
      ↓
Commission calculated
      ↓
Restaurant settlement updated
      ↓
Rider earning updated
      ↓
Admin financial views updated
```

Do not create disconnected copies of the same entity.

---

## 5.3 No silent vendor fallback

Never silently use a flagship/default restaurant when the authenticated restaurant cannot be resolved.

A restaurant owner must only manage the vendor associated with their account.

---

## 5.4 Financial consistency

Do not create independent fake numbers in:

* restaurant earnings
* admin payouts
* settlements
* rider earnings
* analytics
* commission reports

Financial views must derive from the same underlying order/financial domain.

---

## 5.5 Existing functionality

Do NOT rewrite working systems unnecessarily.

Preserve:

* discovery
* search
* vendor pages
* menu customizer
* cart
* checkout
* coupon engine
* payment simulation
* tracking
* OTP delivery
* customer cancellation/refund request
* reviews
* favorites
* wallet
* reservations
* catering
* QR dine-in
* AI assistant
* restaurant order board
* kitchen workflow
* restaurant POS Lite
* restaurant QR menu
* rider delivery
* route optimization
* rider earnings concepts
* admin live operations
* CMS
* notification fan-out
* demo autopilot
* localization
* RTL
* theming
* accessibility

Only refactor existing functionality when necessary to remove a verified architectural inconsistency.

---

# 6. IMPLEMENTATION ORDER

Implement the following phases in separate bounded sessions.

---

# PHASE 1 — Core Order Completion

Gap:

`G03`

The current order lifecycle can reach `delivered`, but the user cannot properly complete the order.

Implement a real `completed` transition.

The action must:

* use `lib/order-machine.ts`
* respect actor permissions
* be exposed from appropriate customer/admin surfaces
* update all relevant downstream state

Do not bypass the state machine.

Completion must become the trigger for financial consequences.

Validate:

```text
delivered → completed
```

and verify the action cannot be repeated to create duplicate effects.

---

# PHASE 2 — Commission + Settlement

Gaps:

`G01`
`G02`

Create a proper financial domain.

Commission should support:

* commission rate
* gross order amount
* commission amount
* restaurant/vendor net amount
* platform amount
* order reference
* status
* timestamps

Commission must be deterministic.

Settlement should support:

* restaurant/vendor
* settlement period/reference
* gross amount
* commission
* adjustments
* net payable
* status
* payout/settlement date
* related orders

Prefer a dedicated domain such as:

```text
lib/settlement.ts
```

or the repository's existing equivalent.

Do not scatter financial calculations across React components.

Completion should conceptually perform:

```text
Order Completed
    ↓
Commission
    ↓
Vendor Settlement
    ↓
Rider Earning
    ↓
Financial events/views
```

The operation must be idempotent.

Repeated completion must not create duplicate:

* commissions
* settlements
* rider earnings

Validate the financial consequences through the actual prototype UI.

---

# PHASE 3 — Rider Delivery + Earnings Unification

Gaps:

`G04`
`G05`
`G39`
`G40`

Unify the existing `DeliveryJob` and real `Order` concepts.

Do not allow two independent realities.

A real order assigned to a rider must produce the same:

* active delivery
* history
* earning
* wallet
* cash-in-hand
* remittance
* completed job

state as the rider's normal delivery workflow.

Cash-on-delivery:

```text
OTP verification
→ cash collected
→ cash-in-hand increases
→ earning recorded
→ remittance liability recorded
```

Do not discard `cashCollected`.

Rider availability must have one authoritative truth.

Rules:

* offline rider cannot receive normal dispatch
* busy rider cannot receive conflicting work
* active rider state must match dispatch state
* order assignment must match rider job state

Validate with actual rider/customer/admin flows.

---

# PHASE 4 — Admin Order Operations

Create/complete:

```text
/admin/orders
```

Include:

* order list
* search
* status filters
* payment filters
* fulfillment filters
* date filters
* order detail
* customer information
* restaurant information
* rider information
* financial summary
* lifecycle timeline
* intervention controls

Admin actions may include:

* assign rider
* reassign rider
* allowed lifecycle transitions
* cancellation
* stuck-order inspection
* payment inspection
* delivery inspection

Every lifecycle mutation must still use:

```text
order-machine.ts
```

Do not bypass domain guards.

---

# PHASE 5 — Refunds + Support + Disputes

Gaps:

`G07`
`G25`
`G26`

Customer order-level support:

```text
Report a Problem
```

Categories:

* missing item
* wrong item
* damaged/spilled
* late delivery
* payment issue
* restaurant issue
* rider issue
* other

Create a proper support/dispute domain record.

Customer must see:

* ticket status
* related order
* submitted time
* events/messages
* resolution

Admin support queue must support:

* ticket details
* order context
* payment/refund context
* internal notes
* response
* approve/refuse resolution
* refund decision
* close/reopen

Refund lifecycle:

```text
requested
→ approved OR rejected
→ refunded/settled
```

Reuse/extend existing `RefundStatus`.

Represent wallet/card/cash refund states correctly even though providers are mocked.

---

# PHASE 6 — Restaurant Onboarding + Approval

Gaps:

`G08`
`G09`
`G12`

Upgrade:

```text
/partner
```

Collect:

* owner information
* restaurant information
* legal/business information
* phone/email
* address
* cuisine/category
* opening hours
* delivery configuration
* documents
* payout/bank information
* branches where supported

Vendor lifecycle:

```text
draft
pending
approved
rejected
suspended
```

Admin:

```text
/admin/restaurants
```

Support:

* search
* filtering
* pending applications
* details
* documents
* approve
* reject
* suspend
* reactivate
* edit

Approval must affect restaurant dashboard access.

Restaurant owners must only access their own vendor.

---

# PHASE 7 — Rider Onboarding + Approval

Gaps:

`G10`
`G11`
`G13`

Upgrade:

```text
/rider
```

Include:

* personal information
* contact information
* vehicle information
* emergency contact where appropriate
* documents
* document states
* application status

Rider lifecycle:

```text
draft
pending
approved
rejected
suspended
inactive
```

Admin:

```text
/admin/riders
```

Include:

* rider list
* availability
* applications
* profile
* documents
* approve
* reject
* activate
* deactivate
* suspend
* delivery summary
* earnings summary

Only approved/active riders may participate in normal dispatch.

---

# PHASE 8 — Restaurant Financials

Gaps:

`G16`
`G17`

Restaurant dashboard:

* earnings
* commission statements
* settlement history
* payout history
* pending balance
* available balance
* gross sales
* platform commission
* net earnings

Admin:

```text
/admin/payouts
```

or the repository's appropriate equivalent.

Support:

* vendor settlements
* rider payouts/remittance
* settlement status
* period filtering
* payout runs
* details
* totals

Use the Phase 2 financial domain.

Do not invent separate financial numbers.

---

# PHASE 9 — Restaurant Menu Builder

Gaps:

`G19`
`G20`
`G21`

Build a real menu authoring workflow.

Sections:

* create
* rename
* reorder
* delete
* enable/disable

Items:

* create
* edit
* delete
* price
* description
* image
* availability
* dietary attributes where supported

Option groups:

* create
* edit
* delete
* required/optional
* min/max selections
* option prices

Inventory:

* stock quantity
* low-stock threshold
* out-of-stock
* automatic unavailable state
* manual stock adjustment

The existing customer menu customizer must consume the same menu/option data.

Do not introduce a second menu model.

---

# PHASE 10 — Restaurant Settings + Staff + Handover + Analytics

Gaps:

`G18`
`G22`
`G23`
`G24`

Restaurant settings:

* profile
* logo/cover
* address
* phone
* opening hours
* delivery settings
* branches where supported

Staff:

* invite/add
* role
* permissions
* activate/deactivate

Handover:

Add explicit rider handover verification/checklist where appropriate.

Analytics must use actual shared order data.

Include:

* date range
* revenue
* order count
* average order value
* peak hours
* top products
* cancelled orders
* completed orders
* commission
* net revenue

Add local/prototype export where practical.

---

# PHASE 11 — Admin Customer Management

Gap:

`G15`

Create:

```text
/admin/customers
```

Include:

* customer list
* search
* filters
* detail
* account status
* order history
* spending summary
* support tickets
* block/unblock where appropriate

Use shared customer/order records.

---

# PHASE 12 — Admin Coupons / Campaigns

Gap:

`G28`

Admin must support:

* create platform coupon
* activate/deactivate
* eligibility
* validity
* usage limits
* discount
* minimum order
* performance/usage

Keep restaurant coupons separate from platform campaigns.

Preserve the existing coupon engine.

---

# PHASE 13 — Review Moderation

Gap:

`G29`

Create an admin moderation queue.

Include:

* reported reviews
* review details
* customer context
* vendor context
* order context
* approve/leave
* hide/remove
* moderation reason
* moderation history

Existing customer review functionality must continue working.

---

# PHASE 14 — RBAC

Gap:

`G31`

Implement reusable authorization.

Preferred API:

```ts
hasPermission(user, permission)
can(user, resource, action)
```

Use existing:

```text
User.permissions
```

Do not hard-code permission rules independently in components.

Support permissions such as:

```text
orders.view
orders.manage
refunds.manage
restaurants.view
restaurants.approve
riders.view
riders.approve
customers.view
customers.manage
payouts.view
payouts.manage
coupons.manage
reviews.moderate
analytics.view
settings.manage
audit.view
```

Apply permissions to:

* routes
* navigation
* buttons
* destructive actions
* admin operations

---

# PHASE 15 — Platform Audit Log

Gap:

`G32`

Create a platform-wide audit system.

Important mutations:

* order intervention
* rider assignment
* restaurant approval
* rider approval
* refund decision
* payout action
* coupon changes
* customer blocking
* settings changes
* permission changes

Audit record:

```text
actor
action
entity
entityId
timestamp
metadata
description
```

Keep existing CMS audit compatibility.

---

# PHASE 16 — Admin Analytics

Gap:

`G33`

Create admin analytics/reporting.

Use shared prototype data.

Include:

* GMV/revenue
* orders
* completed
* cancelled
* refunded
* commission
* vendor performance
* rider performance
* customer activity
* top restaurants
* top products
* delivery performance
* date range
* export

Do not fabricate numbers where shared domain data already exists.

---

# PHASE 17 — Customer Improvements

Gaps:

`G34`
`G35`
`G36`
`G37`
`G43`
`G27`

## Scheduled orders

Scheduled orders must not behave like ASAP orders.

Represent scheduling explicitly.

Conceptually:

```text
scheduled
→ queued
→ released
→ normal lifecycle
```

Fit this into the existing order state machine.

Do not create a second lifecycle.

## Reorder

Reorder must:

1. load original order
2. reconstruct items
3. reconstruct valid options
4. verify current availability
5. verify current prices
6. handle unavailable items
7. populate cart
8. navigate to cart/checkout

Do not merely navigate to the restaurant.

## Rating

Make the existing rating action actually usable.

## Location/serviceability

Implement customer location management and delivery-zone checking.

Show serviceability before checkout where appropriate.

## Verification

Do not automatically mark all registrations as verified.

Create a prototype verification abstraction that can later map to OTP/API.

## Contact

Replace toast-only contact stubs with a lightweight conversation/contact thread connected to the relevant order where appropriate.

---

# PHASE 18 — Consistency + Quality Gaps

Address:

`G41`
`G42`
`G44`
`G45`

G41:

Remove/fix dead vendor order read paths.

G42:

Improve cross-surface consistency wherever reasonable.

G44:

Add basic fraud/abuse representations.

G45:

Use typed order event payloads.

Avoid string-only event details such as:

```text
delay:15
otp-failed:2
refund-requested
```

Prefer structured typed payloads.

Do not over-engineer.

---

# 7. Deterministic Demo Data

Create coherent deterministic demo scenarios.

Do not create unrelated random values on each page.

## Customers

Include:

* normal customer
* verified state
* unverified state
* customer with orders
* customer with support tickets

## Restaurants

Include:

* pending
* approved
* rejected
* suspended
* active

## Riders

Include:

* pending
* approved
* active
* offline
* busy
* suspended

## Orders

Include:

* ASAP
* scheduled
* card payment
* cash payment
* completed
* cancelled
* refund requested
* refund approved
* refund rejected
* delayed/stuck
* rider assigned
* rider unassigned

## Financials

Include coherent:

* commissions
* settlements
* rider earnings
* cash collection
* payouts
* pending balances

All demo entities must reference each other correctly.

---

# 8. UX Requirements

Every newly implemented module must include, where applicable:

* loading state
* empty state
* error state
* success feedback
* validation
* destructive-action confirmation
* responsive UI
* accessible controls
* keyboard-friendly dialogs/forms
* mobile-friendly layout
* existing design system
* localization
* RTL compatibility

Reuse existing:

* buttons
* dialogs
* cards
* tables
* forms
* badges
* navigation
* layout primitives

Do not create visually disconnected interfaces.

---

# 9. Validation Rules

After each phase:

```text
1. Typecheck
2. Lint
3. Inspect affected UI flow
4. Fix regressions
```

Do not claim completion based only on file creation.

A feature is complete only when its actual prototype flow works.

At minimum, use the repository's available commands.

At the final phase run:

```bash
bun run typecheck
bun run lint
bun run build
```

If the repository uses different commands, use the existing package scripts instead.

Fix build/type/lint errors before finishing.

---

# 10. End-to-End Verification

After all implementation phases, start a fresh context/session for final verification.

Verify these scenarios using the actual prototype UI.

## Scenario A — Normal Order

```text
Customer places order
→ Restaurant accepts
→ Restaurant prepares
→ Rider assigned
→ Rider accepts
→ Rider picks up
→ Rider arrives
→ OTP verification
→ Delivered
→ Completed
→ Commission generated
→ Vendor settlement updated
→ Rider earning updated
→ Admin sees financial state
```

## Scenario B — Cash Order

```text
Cash order
→ Rider receives order
→ OTP
→ cash collected
→ cash-in-hand updated
→ earning recorded
→ remittance liability updated
```

## Scenario C — Refund

```text
Customer reports problem
→ Support ticket created
→ Admin reviews
→ Refund approved/rejected
→ Refund ledger/state updated
→ Customer sees updated status
```

## Scenario D — Restaurant Onboarding

```text
Restaurant applies
→ pending
→ Admin reviews
→ approve
→ Restaurant dashboard becomes active
→ Restaurant manages only its own vendor
```

## Scenario E — Rider Onboarding

```text
Rider applies
→ documents pending
→ Admin approves
→ Rider becomes active
→ Rider goes online
→ Dispatch can assign orders
```

## Scenario F — Admin Intervention

```text
Order becomes stuck
→ Admin sees order
→ Admin opens order
→ Admin reassigns rider / performs allowed intervention
→ shared state updates
```

## Scenario G — Reorder

```text
Completed order
→ Reorder
→ original items/options reconstructed
→ unavailable item handled
→ cart populated
→ checkout
```

---

# 11. Final Consistency Audit

Before finishing, search the repository for:

### Direct order status mutation

Find and eliminate inappropriate patterns such as:

```text
order.status =
status:
```

where they bypass the order domain.

### Disconnected rider delivery

Find duplicate delivery/earning logic that does not reference the real order.

### Vendor fallback

Find code that silently uses a default/flagship vendor.

### Fake financial values

Find dashboards that independently generate financial numbers instead of deriving them from shared domain records.

### Duplicate domain models

Find multiple incompatible representations of:

* orders
* riders
* restaurants
* earnings
* settlements
* menu items

Remove or reconcile only where necessary.

Do not perform unrelated broad refactoring.

---

# 12. Context Management Rule

This project is large.

Be conservative with context.

Do NOT:

* reread unrelated files
* dump huge files into the conversation
* repeat large analysis
* re-audit completed phases
* explain obvious implementation details
* implement unrelated improvements

When a phase is complete, provide a short summary and stop.

Use `/compact` between major implementation phases.

Use `/clear` before the final end-to-end verification session.

---

# 13. Phase Completion Report

At the end of each implementation session, report only:

```text
Phase:
Status:

Implemented:
- ...

Validation:
Typecheck: PASS/FAIL
Lint: PASS/FAIL
Build: PASS/FAIL/NOT RUN

Known remaining issues:
- ...
```

Do not claim PASS if the flow was not actually verified.

---

# 14. Final Deliverable

After all phases are complete, provide:

## Implemented

List completed gap IDs/modules.

## Important architectural changes

List major:

* domain
* service
* store
* state
* shared-data
* lifecycle

changes.

## End-to-end flows verified

List the scenarios actually tested.

## Validation

```text
Typecheck: PASS/FAIL
Lint: PASS/FAIL
Build: PASS/FAIL
```

## Remaining gaps

Only list genuinely remaining issues.

Do not claim a feature is complete unless the actual UI flow works.

---

# 15. Final Principle

The objective is NOT to add more pages.

The objective is to make FoodOra behave like a coherent real food-delivery platform.

Every major feature should follow:

```text
Data Model
    ↓
Deterministic Mock Data
    ↓
Domain / Service Seam
    ↓
Store / State
    ↓
UI
    ↓
Mutation
    ↓
Feedback
    ↓
Shared Surface Updates
    ↓
Realistic Demo Flow
```

The result must be:

**Frontend-only + backend-independent + production-shaped + API-ready + internally consistent.**

---

# START

If this is the first execution of this specification:

**Perform PHASE 1 — AUDIT ONLY. Do not implement any feature yet.**

If the audit has already been completed in a previous session, ask me which implementation phase to execute next, or use the explicitly specified phase.

Do not automatically implement all phases in one session.


# After complete every phase please update 'FOODORA-PROTOTYPE-PROGRESS.md'
