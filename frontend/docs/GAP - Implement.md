# FoodOra — Complete Prototype Gap Implementation

You are working on the **FoodOra** repository.

I am providing a repository-level gap analysis report:

`FOODORA-PROTOTYPE-GAP-ANALYSIS.md`

Your job is to use this report as the **source of truth for the remaining prototype gaps** and implement the missing/partial functionality as a **complete, production-shaped frontend prototype**.

---

## 1. Core Objective

Turn the current FoodOra prototype from the state described in the gap analysis into a **complete end-to-end working prototype**.

This is NOT a backend implementation task.

### Important constraints

* Do NOT implement PostgreSQL, Prisma, GraphQL API, Redis, queues, or real external services.
* The database/backend architecture already exists conceptually and will be connected later.
* For now, everything must work through the existing mock/service/store architecture.
* The prototype must behave as if a real backend exists.
* Later, replacing mock services with API implementations should require minimal UI/domain changes.
* Do NOT throw away or rewrite working functionality.
* Preserve the existing architecture and conventions.

The existing layering is:

`types → lib/mock → services → stores → components`

Preserve this architecture.

---

# 2. First: Audit Before Coding

Read and understand:

* `FOODORA-PROTOTYPE-GAP-ANALYSIS.md`
* existing `types/*`
* `lib/*`
* `lib/mock/*`
* `services/*`
* `stores/*`
* `components/*`
* relevant customer routes
* restaurant dashboard routes
* rider routes
* admin routes

Do NOT blindly trust filenames or the report.

Verify the current implementation before changing it.

Create a short internal implementation plan based on the actual repository.

Do not spend excessive tokens explaining the plan to me. Work directly.

---

# 3. Non-Negotiable Architecture Rules

### Preserve the existing order architecture

`lib/order-machine.ts` remains the single authority for order lifecycle transitions.

Do NOT introduce:

* direct `status = ...`
* another order state machine
* duplicated order stores
* page-specific lifecycle logic

Every order lifecycle mutation must go through the existing domain transition mechanism.

### Preserve service seams

Mock implementations should remain behind:

`services/*`

Components should not become tightly coupled to mock data.

Example:

```text
Component
   ↓
Store / Service
   ↓
Mock implementation
```

Later:

```text
Component
   ↓
Store / Service
   ↓
GraphQL/API
```

The UI should not need a rewrite.

### Shared truth

Customer, Restaurant, Rider and Admin must operate on the same prototype domain records.

If an action happens in one surface, the other surfaces must reflect it.

Example:

Customer places order
→ Restaurant accepts
→ Rider gets assigned
→ Rider delivers
→ Customer sees delivery
→ Order completes
→ Commission calculated
→ Restaurant settlement updated
→ Rider earnings updated
→ Admin sees financial records.

---

# 4. Implementation Priority

Implement in this order.

Do not jump randomly between modules.

---

## PHASE 1 — CLOSE THE CORE ORDER LIFECYCLE

Fix:

* G03

The current lifecycle can reach `delivered`, but human users cannot properly complete the order.

Implement a real `completed` action.

It must be available from appropriate surfaces such as:

* customer tracking/order detail where appropriate
* admin order management

Respect the existing state machine and actor permissions.

Do NOT create a shortcut outside `order-machine.ts`.

The completion transition must trigger all appropriate downstream consequences.

---

# PHASE 2 — MONEY DOMAIN

Implement:

* G01 Commission
* G02 Settlement

Create a proper domain representation for:

### Commission

Support at minimum:

* commission rate
* gross order amount
* commission amount
* restaurant/vendor net amount
* platform amount
* order reference
* status
* timestamps

Commission should be calculated deterministically from the order/vendor configuration.

### Settlement

Support at minimum:

* vendor/restaurant
* settlement period/reference
* gross amount
* commission
* adjustments
* net payable
* status
* payout/settlement date
* related orders

Create a dedicated domain/service layer, preferably following the report recommendation such as:

`lib/settlement.ts`

Do not scatter financial calculations throughout components.

### Completion integration

When:

`delivered → completed`

the system should update the financial consequences.

Expected conceptual flow:

```text
Order Completed
    ↓
Calculate Commission
    ↓
Create/Update Vendor Settlement
    ↓
Create Rider Earning
    ↓
Update relevant financial views
    ↓
Emit lifecycle/financial events
```

Make this deterministic and idempotent.

Running the same completion action twice must not create duplicate earnings or settlements.

---

# 5. PHASE 3 — UNIFY RIDER DELIVERY + EARNINGS

Fix:

* G04
* G05
* G39
* G40

This is critical.

The current prototype has two disconnected systems:

1. `DeliveryJob`
2. real `Order`

Do not allow them to represent two different realities.

A real order assigned to a rider must eventually produce the same earning/wallet/history consequences as a normal delivery job.

Prefer a unified domain model or adapter rather than duplicating logic.

The rider should have:

* active delivery
* delivery history
* earnings
* wallet
* cash-in-hand
* remittance
* completed jobs

all reflecting actual orders.

### Cash collection

If an order is cash-on-delivery:

```text
OTP verification
→ cash collected
→ cash-in-hand increases
→ delivery earning recorded
→ remittance liability recorded
```

Do not discard `cashCollected`.

### Shift state

Fix dispatch so that:

* offline rider cannot receive normal dispatch
* active/busy rider cannot receive another conflicting job
* real orders and rider job state use the same availability truth

No rider should simultaneously appear:

* available in one module
* busy in another

---

# 6. PHASE 4 — ADMIN ORDER OPERATIONS

Implement:

`/admin/orders`

This should be a real operations module.

Include:

* order list
* search
* filters
* status filters
* payment filters
* fulfillment filters
* date filtering
* order detail
* customer information
* restaurant information
* rider information
* financial summary
* lifecycle timeline
* intervention controls

Admin must be able to perform appropriate operational actions such as:

* assign/reassign rider
* force allowed lifecycle transitions
* cancel order
* inspect stuck orders
* inspect payment state
* inspect delivery state

Every lifecycle action must still go through:

`order-machine.ts`

Use:

```text
advance(..., "admin", ...)
```

where appropriate.

Do not bypass domain guards.

---

# 7. PHASE 5 — REFUNDS + SUPPORT + DISPUTES

Implement:

* G07
* G25
* G26

### Customer

Add order-level:

**Report a Problem**

Possible categories:

* missing item
* wrong item
* damaged/spilled
* late delivery
* payment issue
* restaurant issue
* rider issue
* other

Create a proper support/dispute record.

Customer should be able to see:

* ticket status
* messages/events
* submitted time
* related order
* resolution

### Admin

Create support/dispute queue.

Admin can:

* view ticket
* inspect order
* inspect payment/refund information
* add internal note
* respond
* approve/refuse resolution
* approve/reject refund where applicable
* close/reopen ticket

### Refund lifecycle

Implement:

```text
requested
→ approved OR rejected
→ refunded/settled where applicable
```

Existing `RefundStatus` should be reused/extended instead of creating a conflicting model.

For wallet refunds, card refunds and cash scenarios, represent the state correctly even though actual payment providers are mocked.

---

# 8. PHASE 6 — RESTAURANT ONBOARDING + ADMIN APPROVAL

Implement:

* G08
* G09
* G12

### Restaurant application

Upgrade `/partner`.

Application should collect realistic information:

* owner information
* restaurant name
* legal/business information
* phone/email
* address
* cuisine/category
* opening hours
* delivery information
* documents
* bank/payout information
* branches if applicable

Use a prototype-friendly upload/document abstraction.

### Vendor lifecycle

Add explicit vendor status:

```text
draft
pending
approved
rejected
suspended
```

Do NOT silently fallback to the flagship vendor.

A restaurant owner must only manage the vendor associated with their account.

### Admin

Create restaurant management:

`/admin/restaurants`

Include:

* list
* search/filter
* pending applications
* details
* documents
* approve
* reject
* suspend
* reactivate
* edit

Approval must change what the restaurant owner can access.

---

# 9. PHASE 7 — RIDER ONBOARDING + APPROVAL

Implement:

* G10
* G11
* G13

Upgrade `/rider`.

Allow rider registration/application.

Include:

* personal details
* contact information
* vehicle information
* emergency/contact details where appropriate
* required documents
* document upload states
* application status

Rider lifecycle should include something like:

```text
draft
pending
approved
rejected
suspended
inactive
```

Add admin route:

`/admin/riders`

Include:

* rider list
* availability/status
* application queue
* profile
* documents
* approve/reject
* activate/deactivate/suspend
* delivery/earnings summary

Only approved/active riders should participate in normal dispatch.

---

# 10. PHASE 8 — RESTAURANT FINANCIALS

Implement:

* G16
* G17

Restaurant dashboard should have:

* earnings
* commission statement
* settlement history
* payout history
* pending balance
* available balance
* gross sales
* platform commission
* net earnings

Admin should have:

`/admin/payouts` or equivalent settlement management.

Include:

* vendor settlements
* rider payouts/remittance
* settlement status
* period filters
* payout runs
* details
* totals

Use the same underlying financial domain created in Phase 2.

No fake disconnected financial numbers.

---

# 11. PHASE 9 — RESTAURANT MENU BUILDER

Implement:

* G19
* G20
* G21

Create a real menu authoring experience.

Restaurant should be able to:

### Sections

* create
* rename
* reorder
* delete
* enable/disable

### Items

* create
* edit
* delete
* price
* description
* image
* availability
* dietary attributes where existing domain supports it

### Option groups

* create
* edit
* delete
* required/optional
* min/max selections
* option prices

### Inventory

Add:

* stock quantity
* low-stock threshold
* out-of-stock state
* automatic unavailable state
* manual stock adjustment

The existing customer customizer must consume the same menu/option data.

Do not create a second menu format just for the dashboard.

---

# 12. PHASE 10 — RESTAURANT PROFILE / HOURS / STAFF / ANALYTICS

Implement:

* G18
* G22
* G23
* G24

Restaurant settings:

* profile
* logo/cover
* address
* phone
* opening hours
* delivery settings
* branches if supported by the prototype model

Staff:

* invite/add staff
* role
* permissions
* activate/deactivate

Handover:

Restaurant should have an explicit rider handover verification step/checklist where appropriate.

Analytics:

Use actual shared order records where possible.

Add:

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

Add export UI using a prototype/local export implementation if practical.

Do not continue relying only on unrelated synthesised charts.

---

# 13. PHASE 11 — ADMIN CUSTOMER MANAGEMENT

Implement:

* G15

Create:

`/admin/customers`

Include:

* customer list
* search/filter
* customer detail
* account status
* order history
* spending summary
* support tickets
* block/unblock where appropriate

Use shared customer/order data.

---

# 14. PHASE 12 — ADMIN COUPONS / CAMPAIGNS

Implement:

* G28

Admin should be able to:

* create platform coupon
* activate/deactivate
* define eligibility
* define validity
* define usage limits
* define discount
* define minimum order
* inspect usage/performance

Restaurant coupons should remain distinct from platform campaigns.

Do not break the existing coupon engine.

---

# 15. PHASE 13 — REVIEW MODERATION

Implement:

* G29

Admin moderation queue:

* reported reviews
* review details
* customer/vendor/order context
* approve/leave
* hide/remove
* moderation reason
* moderation history

Existing customer reviews must remain functional.

---

# 16. PHASE 14 — RBAC

Implement:

* G31

The current role-list gating is insufficient.

Create a reusable permission system.

For example:

```text
hasPermission(user, permission)
can(user, resource, action)
```

Use the existing:

`User.permissions`

Do not hard-code permissions separately inside every component.

Support realistic permission groups such as:

* orders.view
* orders.manage
* refunds.manage
* restaurants.view
* restaurants.approve
* riders.view
* riders.approve
* customers.view
* customers.manage
* payouts.view
* payouts.manage
* coupons.manage
* reviews.moderate
* analytics.view
* settings.manage
* audit.view

Apply permissions to actual UI actions and routes.

---

# 17. PHASE 15 — PLATFORM AUDIT LOG

Implement:

* G32

Create a platform-wide audit system.

Audit important mutations:

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

Include:

* actor
* action
* entity
* entity ID
* timestamp
* metadata
* readable description

Keep the existing CMS audit functionality compatible.

---

# 18. PHASE 16 — ADMIN ANALYTICS

Implement:

* G33

Create an admin analytics/reporting module.

Include:

* GMV/revenue
* orders
* completed/cancelled/refunded
* commission
* vendor performance
* rider performance
* customer activity
* top restaurants
* top products
* delivery performance
* date range
* export

Use actual shared prototype data.

Avoid unrelated hard-coded numbers where the data exists elsewhere.

---

# 19. PHASE 17 — CUSTOMER IMPROVEMENTS

Implement:

* G34
* G35
* G36
* G37
* G43
* G27

### Scheduled orders

Scheduled orders should not behave like ASAP orders.

Represent appropriate scheduling state and prevent premature restaurant/rider processing.

Example:

```text
scheduled
→ scheduled/queued
→ released at scheduled time
→ placed/accepted...
```

The exact implementation should fit the existing order state machine rather than introducing a parallel lifecycle.

### Reorder

The reorder button must actually:

* load the original order
* reconstruct cart items
* reconstruct valid options
* verify current availability
* verify current prices
* handle unavailable items
* send customer to cart

Do not simply navigate to the vendor page.

### Rating

Make the existing `rate` action usable from the appropriate customer flow.

### Location/serviceability

Add customer location management and delivery-zone checking.

Customer should see whether an address is serviceable before checkout where appropriate.

### Account verification

Do not always mark registration as verified.

Create a prototype verification flow that can later map to OTP/API.

### Contact

Replace toast-only call/message stubs with prototype contact flows.

At minimum support a lightweight conversation/contact thread abstraction connected to the order.

---

# 20. PHASE 18 — SECONDARY CONSISTENCY / QUALITY GAPS

Address:

* G41 dead vendor order read path
* G42 prototype cross-surface consistency as far as reasonably possible
* G44 basic fraud/abuse representations
* G45 typed order event details

For G45, prefer a typed event payload structure instead of relying on strings such as:

```text
delay:15
otp-failed:2
refund-requested
```

Do not over-engineer this.

---

# 21. DEMO DATA REQUIREMENTS

The prototype must have enough deterministic demo data to demonstrate every major workflow.

Create realistic seeded scenarios for:

### Customers

* normal customer
* verified/unverified state where relevant
* customers with orders
* customers with support tickets

### Restaurants

* pending
* approved
* rejected
* suspended
* active

### Riders

* pending
* approved
* active
* offline
* busy
* suspended

### Orders

Include examples covering:

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

### Financials

Include:

* commissions
* settlements
* rider earnings
* cash collection
* payouts
* pending balances

Do not create random numbers independently in each page.

All demo data should have a coherent relationship.

---

# 22. UX REQUIREMENTS

The implementation should feel like a real SaaS product.

For every new module:

* proper empty state
* loading state
* error state
* success feedback
* confirmation for destructive actions
* validation
* responsive layout
* accessible controls
* keyboard-friendly dialogs/forms
* mobile-friendly dashboard where practical
* existing theme/design language
* existing localization system
* RTL compatibility

Do not create visually disconnected pages.

Reuse existing:

* buttons
* dialogs
* cards
* tables
* forms
* badges
* navigation
* layout primitives

where available.

---

# 23. API-READY REQUIREMENT

This is extremely important.

Even though this is mock-only, design every new feature as if a real API will replace the mock later.

Bad:

```tsx
const order = MOCK_ORDERS.find(...)
```

inside a component.

Prefer:

```text
component
→ store/service
→ mock repository
```

Every async operation should have a clear seam.

Use typed input/output models.

Avoid putting business rules inside React components.

---

# 24. Do NOT Break Existing Features

The gap report explicitly says a large amount of functionality already works.

Do NOT rewrite working systems simply to implement the gaps.

Especially preserve:

* customer discovery
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
* rider delivery flow
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

Only refactor when necessary to remove an actual architectural inconsistency.

---

# 25. Important Business Rule

The final FoodOra lifecycle should demonstrate:

```text
Customer
   ↓
Restaurant
   ↓
Order
   ↓
Payment
   ↓
Restaurant Acceptance
   ↓
Preparation
   ↓
Rider Assignment
   ↓
Rider Pickup
   ↓
Delivery
   ↓
OTP Verification
   ↓
Delivered
   ↓
Completed
   ↓
Commission Calculation
   ↓
Restaurant Settlement
   ↓
Rider Earnings
   ↓
Platform/Admin Financial Visibility
```

And exception paths:

```text
Payment Failure
Order Cancellation
Refund Request
Refund Approval/Rejection
Delivery Failure
Return
Support Ticket
Dispute
Admin Intervention
```

must also behave coherently.

---

# 26. Validation After Each Phase

After each major phase:

1. run typecheck
2. run lint
3. inspect affected flows
4. fix regressions immediately

At the end run:

```bash
bun run typecheck
bun run lint
bun run build
```

If build produces errors, fix them.

Do not stop at "implemented" without validating the actual flow.

---

# 27. Final End-to-End Verification

Before finishing, manually verify at least these scenarios using the prototype UI:

### Scenario A — Normal order

```text
Customer places order
→ Restaurant accepts
→ Restaurant prepares
→ Rider assigned
→ Rider accepts
→ Rider picks up
→ Rider arrives
→ Customer/rider OTP verification
→ Delivered
→ Completed
→ Commission generated
→ Vendor settlement updated
→ Rider earning updated
→ Admin sees completed financial state
```

### Scenario B — Cash order

```text
Cash order
→ Rider receives order
→ OTP
→ cash collected
→ cash-in-hand updated
→ earning recorded
→ remittance liability updated
```

### Scenario C — Refund

```text
Customer reports problem
→ Support ticket created
→ Admin reviews
→ Refund requested/approved
→ Refund ledger updated
→ Customer sees updated status
```

### Scenario D — Restaurant onboarding

```text
Restaurant applies
→ pending
→ Admin reviews
→ approve
→ restaurant dashboard becomes active
→ restaurant manages ONLY its own vendor
```

### Scenario E — Rider onboarding

```text
Rider applies
→ documents pending
→ Admin approves
→ rider becomes active
→ rider can go online
→ dispatch can assign orders
```

### Scenario F — Admin intervention

```text
Order becomes stuck
→ Admin sees it
→ Admin opens order
→ Admin assigns/reassigns rider or performs allowed intervention
→ shared order state updates everywhere
```

### Scenario G — Reorder

```text
Completed order
→ Reorder
→ original items/options reconstructed
→ unavailable item handled
→ cart populated
→ checkout
```

---

# 28. Final Cleanup

After implementation:

* remove dead code created by replaced paths
* remove unused imports
* remove obsolete mock datasets only when safe
* remove duplicate domain logic
* ensure no page maintains its own fake version of shared entities
* ensure no direct order status mutation exists
* ensure no disconnected rider earning path remains
* ensure no vendor fallback silently assigns the wrong restaurant
* ensure no financial page invents unrelated numbers

Do not perform broad unrelated refactors.

---

# 29. Final Deliverable

When finished, provide a concise summary containing:

### Implemented

List the completed gap IDs/modules.

### Important architectural changes

List the major domain/store/service changes.

### End-to-end flows verified

List the scenarios that were actually tested.

### Validation

Report:

```text
Typecheck: PASS/FAIL
Lint: PASS/FAIL
Build: PASS/FAIL
```

### Remaining gaps

Only list genuinely remaining issues, if any.

Do not claim a feature is complete unless the actual UI flow works.

---

## Final Principle

The goal is NOT to make the prototype look like it has more pages.

The goal is to make FoodOra behave like a **coherent real food-delivery platform prototype**.

Every major feature must have:

**Data model → mock data → service seam → state/store → UI → mutation → feedback → related surfaces updated → realistic demo flow**

The prototype should be **production-shaped and API-ready**, while remaining completely functional without a backend.

Start by auditing the current repository against the gap report, then implement the gaps in the dependency order above.
