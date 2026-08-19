You are auditing the existing **FoodOra** codebase.

## Goal

Do **NOT implement, refactor, redesign, or modify anything**.

Perform a complete repository-level audit and identify what is **missing, incomplete, inconsistent, or only partially implemented** in the FoodOra prototype.

FoodOra is a food ecosystem / food delivery platform with these main roles:

* Customer
* Restaurant
* Rider
* Admin

The goal is to create a **production-ready frontend prototype** where all major real-world flows are represented with mock/demo data. Backend/database/API integration will be added later.

## Audit Scope

Inspect the actual repository/code, routes, components, state management, mock data, domain logic, dashboards, and existing flows.

### 1. Customer Side

Check for missing/incomplete features such as:

* Authentication/profile
* Restaurant discovery
* Search/filter/sort
* Restaurant details
* Menu/category/items
* Item customization/add-ons
* Cart
* Checkout
* Address/location management
* Delivery fee/tax/tip
* Coupons/offers
* Payment method/payment states
* Order placement
* Order confirmation
* Order tracking
* Order status lifecycle
* Rider assignment/tracking
* Delivery OTP
* Order completion
* Cancel/refund flow
* Order history
* Reorder
* Favorites
* Reviews/ratings
* Notifications
* Wallet/credits if applicable
* Customer support/help
* Empty/loading/error states
* Fraud/failed-order scenarios where appropriate

### 2. Restaurant Dashboard

Audit:

* Restaurant onboarding/application
* Approval/rejection
* Restaurant profile
* Branch/location management
* Opening hours
* Menu/category/item management
* Add-ons/variants
* Item availability
* Inventory/out-of-stock states
* Incoming orders
* Accept/reject order
* Preparation workflow
* Ready-for-pickup
* Rider assignment
* Order history
* Cancellation/refund handling
* Offers/coupons
* Reviews
* Earnings
* Commission
* Payout/settlement
* Analytics/reports
* Notifications
* Staff/role management if applicable

### 3. Rider Dashboard

Audit:

* Rider onboarding/application
* Approval/activation
* Profile/documents/status
* Online/offline availability
* Delivery request
* Accept/reject delivery
* Assigned orders
* Pickup workflow
* Pickup verification
* Customer delivery workflow
* Delivery OTP verification
* Complete delivery
* Failed delivery
* Cancellation/return scenarios
* Earnings
* Delivery history
* Notifications
* Basic location/status simulation

### 4. Admin Dashboard

Audit:

* Dashboard overview/KPIs
* Customer management
* Restaurant management
* Restaurant approval
* Rider management
* Rider approval
* Orders management
* Order lifecycle monitoring
* Manual rider assignment
* Refund/cancellation management
* Commission management
* Payout/settlement management
* Coupon/offer management
* Categories/content management
* Reviews/reports
* Notifications
* Support/disputes
* Platform settings
* Roles/permissions/RBAC
* Audit logs
* Analytics/reports

### 5. Core Business Logic

Verify whether the prototype correctly represents the complete lifecycle:

Customer places order
→ Restaurant receives order
→ Restaurant accepts/rejects
→ Food preparation
→ Order ready
→ Rider assigned
→ Rider accepts
→ Rider picks up
→ Delivery OTP verification
→ Delivered
→ Order completed
→ Earnings/commission/settlement updated.

Also check:

* invalid state transitions
* missing states
* inconsistent statuses
* duplicate/conflicting data
* disconnected customer/dashboard data
* hard-coded values that should be domain-driven
* broken or incomplete flows

### 6. Cross-System Consistency

Check whether the same business entity is represented consistently across:

* Customer UI
* Restaurant dashboard
* Rider dashboard
* Admin dashboard
* Mock data
* State/store/domain layer

Especially verify:

`User → Restaurant → Order → Order Items → Rider → Delivery → Payment → Commission → Settlement`

## Output

Create ONE concise document:

`docs/FOODORA-PROTOTYPE-GAP-ANALYSIS.md`

Use this structure:

# FoodOra Prototype Gap Analysis

## A. Current System Summary

Briefly describe what is already implemented.

## B. Missing / Incomplete Features

Use this table:

| ID | Area | Module | Missing / Problem | Current Status | Priority | Dependencies |
| -- | ---- | ------ | ----------------- | -------------- | -------- | ------------ |

Status should be one of:

* Missing
* Partial
* Broken
* Inconsistent
* Mocked but incomplete
* Complete

Priority:

* P0 = critical core flow
* P1 = important
* P2 = secondary
* P3 = enhancement

## C. Critical End-to-End Gaps

List anything preventing this complete demo flow:

Customer → Restaurant → Rider → Delivery → Completion.

## D. Missing Modules

Group missing modules by:

* Customer
* Restaurant
* Rider
* Admin
* Shared/Core

## E. Recommended Implementation Order

Give a dependency-aware implementation sequence, for example:

1. Core order lifecycle
2. Restaurant order workflow
3. Rider delivery workflow
4. Customer tracking/completion
5. Payments/refunds
6. Commission/settlement
7. Admin controls
8. Secondary features

## F. Prototype Readiness

Give a short assessment:

* Core flow readiness
* Customer readiness
* Restaurant readiness
* Rider readiness
* Admin readiness
* Overall prototype readiness %

## Important Rules

* **Do not modify existing code.**
* **Do not implement anything.**
* Do not assume a feature is missing just because it is not obvious from the UI; inspect routes, components, stores, domain logic and mock data first.
* Do not duplicate features that already work.
* Distinguish **missing** from **already implemented but not polished**.
* Verify claims against the actual repository.
* Preserve existing architecture in your recommendations.
* Focus on actionable gaps that can later be implemented as independent prototype tasks.
* Keep the final document concise; avoid unnecessary explanations.
* At the end, run only safe read-only checks if useful (typecheck/build/lint) and report the result.

The final deliverable is **only the gap-analysis document**. Do not change application code.
