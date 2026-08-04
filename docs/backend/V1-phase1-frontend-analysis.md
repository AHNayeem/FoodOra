# V1 · Phase 1 — Frontend Analysis Report

**Scope:** the one business flow named in the brief — customer places an order →
restaurant receives → accepts → kitchen prepares → ready → rider assigned →
picked up → OTP → delivered → completed.

**Nothing was changed.** This is analysis only, per the brief's "stop after the
report".

---

## 0. Headline findings

Five things decide how much work V1 actually is.

**1. The frontend already runs the spec's state machine, and it is server-shaped.**
[lib/order-machine.ts](../../frontend/lib/order-machine.ts) is a pure module —
16 statuses, an explicit transition graph, per-actor permissions, guards, and a
`transition(order, to, actor, patch, now)` function that never mutates its input
and never reads a clock it wasn't handed. Its status vocabulary is **already
byte-identical** to `OrderStatusKind`'s `@map` labels in
[orders.prisma](../../database/prisma/schema/orders.prisma):
`placed · confirmed · preparing · packing · ready · rider-assigned · picked-up ·
on-the-way · arrived · delivered · completed · rejected · cancelled ·
delivery-failed · returned · refunded`. The port to
`modules/orders/domain/order.machine.ts` is close to a copy, and the two sides
will agree on legality by construction.

**2. There is exactly one integration choke point, not seventeen.**
Seventeen files import `stores/orders`, but every one of them only ever calls
store actions (`advance`, `assignRider`, `autoDispatch`, `delayOrder`, `failOtp`,
`askRefund`, `addOrder`) and reads `orders[]` through the shared selectors
(`ordersForVendor`, `dispatchableOrders`, `activeOrderForRider`, `liveOrders`,
`splitOrders`). **No component switches on status, and no component builds a
transition itself** — the action lists are derived from the machine
(`restaurantActions`/`riderActions`/`customerActions`). So the integration is:
turn one Zustand store into a cache over GraphQL, keeping the same seven action
signatures. The components do not need to know.

**3. The database design is already done and it covers this flow completely.**
[database/prisma/schema/](../../database/prisma/schema/) is 6,016 lines across 16
context files (Phase D4) and includes `Cart`, `CartItem`, `CartItemOption`,
`Order`, `OrderItem`, `OrderItemOption`, `OrderEvent`, `OrderRiderDecline`,
`RefundRequest`, `Invoice`, `NumberSequence`, plus `Rider`, `DeliveryJob`,
`JobOffer`, `RiderLocationPing`, `PaymentIntent`, `Refund`, `Notification`,
`NotificationDispatch`, `AuditLog`, `OutboxEvent`, `IdempotencyKey`. Every one
carries the audit/soft-delete/`version` shape the brief asks for. **Phase 2 is
therefore a review-and-migrate step, not a design step** — there are no
migrations on disk yet (`database/prisma/migrations/` does not exist).

**4. The GraphQL contract is already specified.**
[D5-graphql-architecture.md](D5-graphql-architecture.md) names the exact
operations the brief's Phase 4 asks for — `myOrders`, `order`, `vendorOrders`,
`adminOrders`, `addToCart`, `updateCartLine`, `placeOrder`, `cancelOrder`,
`verifyDeliveryOtp`, `acceptOrder`, `rejectOrder`, `advanceOrder`,
`addOrderDelay`, and the three subscriptions `orderUpdated`,
`vendorOrderStream`, `riderLocation` — with the `MutationPayload` envelope whose
`error` field is an **i18n key**, which is precisely what the frontend's
`Result<T>` seam already expects.

**5. The gap is plumbing, not domain.** What genuinely does not exist:
- **No GraphQL client on the frontend at all.** No Apollo, no urql, no
  `graphql-request`, no `graphql-ws` in
  [frontend/package.json](../../frontend/package.json).
- **No realtime or queue on the backend.** No `graphql-ws`,
  `@nestjs/websockets`, `bullmq`, or Redis pub/sub wiring in
  [backend/package.json](../../backend/package.json), and
  `graphql.module.ts` declares no `subscriptions` block.
- **No orders/cart/delivery/payment/notification modules** —
  `backend/src/modules/` is `auth · rbac · regions · settings · system · users`.
- **No migrations, and no Postgres or Redis has ever been run against this
  code** (see [foodora-backend-e3](E3-core-modules.md)).

---

## 1. The integration surface

### 1.1 The one store

[stores/orders.ts](../../frontend/stores/orders.ts) — persisted to
`localStorage["foodora-orders"]`, `STORE_VERSION = 2`, seeded on first hydration
from [lib/mock/demo-orders.ts](../../frontend/lib/mock/demo-orders.ts).

| Action | Signature | Becomes |
|---|---|---|
| `addOrder` | `(order: Order) => void` | commit result of `placeOrder` mutation |
| `advance` | `(id, to, actor, patch?) => { order, error }` | `advanceOrder` / `acceptOrder` / `rejectOrder` / `cancelOrder` mutation |
| `delayOrder` | `(id, minutes) => void` | `addOrderDelay` mutation |
| `assignRider` | `(id, rider, "auto"\|"manual") => { order, error }` | `assignRider` mutation |
| `autoDispatch` | `(id) => { order, error }` | `assignRider(mode: AUTO)` — dispatch runs server-side |
| `failOtp` | `(id) => Order \| null` | folded into `verifyDeliveryOtp` (server counts attempts) |
| `askRefund` | `(id) => void` | `requestRefund` mutation → `RefundRequest` row |
| `notifyNearby` | `(id) => void` | server-side, emitted mid-ride by dispatch |
| `seed` / `resetDemo` | `(now?) => void` | **must be gated off** once the server seeds (§6, decision 7) |

Two side effects live inside `advance` and both move server-side:
`emitNotifications(notificationsFor(order, event))` (the fan-out table) and the
wallet refund settlement (`owesWalletRefund` → `useWallet.refundOrder` → a
follow-on `refunded` transition).

### 1.2 The five services to rewire

| File | Functions in V1 scope | Currently |
|---|---|---|
| [services/orders.ts](../../frontend/services/orders.ts) | `placeOrder`, `authorisePayment`, `cancelOrder`, `verifyOtp`, `getSavedAddresses` | fabricates the `Order` client-side |
| [services/catalog.ts](../../frontend/services/catalog.ts) | `getVendorBySlug`, `getVendorMenu`, `getPopularItems`, `getVendors` | reads `lib/mock/vendors|menus|foods` |
| [services/coupons.ts](../../frontend/services/coupons.ts) | `getBasketCoupons`, `applyCoupon`, `applyCouponCode`, `redeemCoupon` | 553 lines of client coupon engine |
| [services/delivery.ts](../../frontend/services/delivery.ts) | `getFleet`, `getRiderProfile`, `getRiderZone` **only** | rest is out of scope (§5) |
| [services/notifications.ts](../../frontend/services/notifications.ts) | `getFeed`, `getOutbox` | filters the client store |

`services/http.ts` is the seam contract: `Result<T> = {data,error}` and
`Paginated<T>`. `Result` maps 1:1 onto D5's `MutationPayload`. **`Paginated<T>`
is offset-shaped (`page`/`pageSize`/`hasMore`) and D5 mandates cursor pagination
for order feeds** — see decision 6.

### 1.3 Identity, per surface

| Surface | How "me" is resolved today |
|---|---|
| Customer | `stores/auth.ts` holds a whole `User` in localStorage. **No token of any kind.** |
| Restaurant | `dashboard-shell.tsx` gates on `MANAGEMENT_ROLES`, then `getDashboardVendor(user.id)` → owned vendor, **falling back to the flagship demo vendor** |
| Rider | `rider-shell.tsx` gates on `RIDER_ROLES`, then `getRiderProfile(user.id)` + `getRiderZone(rider.zoneId)` |
| Admin | `admin-shell.tsx` gates on `ADMIN_ROLES`; sign in as `admin@foodora.dev` |

All four are client-side gates. E2 issues real JWT + refresh tokens, so
`services/auth.ts` returning tokens is a **hard prerequisite** for every
authenticated query in this flow (decision 1).

---

## 2. Customer flow

| # | Page | Components | Hooks / state | Mock data | Mock service | Types | Expected GraphQL | Backend entity | DB table |
|---|---|---|---|---|---|---|---|---|---|
| C1 | [/restaurants](../../frontend/app/(marketing)/restaurants/page.tsx) | `vendor-directory`, `filters/*`, `cards/*` | `useState`, URL params | `lib/mock/vendors`, `cuisines`, `categories` | `catalog.getVendors`, `getCuisines`, `getCategories` | `Vendor`, `Cuisine`, `Category` | `vendors(filter, page): VendorPage!` | `Vendor`, `Cuisine`, `Category` | `vendors`, `cuisines`, `categories`, `vendor_cuisines` |
| C2 | [/restaurants/[slug]](../../frontend/app/(marketing)/restaurants/[slug]/page.tsx) | `vendor-hero`, `opening-hours`, `menu/add-to-cart-button`, `cart/item-customizer` | `useCart` | `lib/mock/menus`, `foods` | `catalog.getVendorBySlug`, `getVendorMenu`, `getPopularItems` | `Vendor`, `MenuSection`, `FoodItem`, `FoodOptionGroup` | `vendor(slug): Vendor`, `vendorMenu(vendorId): [MenuSectionWithItems!]!` | `Vendor`, `Menu`, `MenuSection`, `FoodItem`, `FoodOptionGroup`, `FoodOption` | `vendors`, `menus`, `menu_sections`, `food_items`, `food_option_groups`, `food_options` |
| C3 | cart drawer (global) | `cart/cart-drawer`, `cart-button`, `cart-conflict-dialog`, `quantity-stepper`, `cart-mount` | **`stores/cart.ts`** (`add`, `setQuantity`, `removeLine`, `confirmSwitch`) | — (pure client state) | — | `CartVendor`, `CartLine`, `CartSelectedOption` | `currentCart: Cart`, `addToCart`, `updateCartLine`, `removeCartLine`, `clearCart` | `Cart`, `CartItem`, `CartItemOption` | `carts`, `cart_items`, `cart_item_options` |
| C4 | [/checkout](../../frontend/app/(marketing)/checkout/page.tsx) | `checkout-view` (715 ln), `order-summary`, `coupon-field`, `payment-methods`, `address-fields` | `useCart`, `useAuth`, `useOrders`, `useAddresses`, `useCoupons`, `useWallet` | `lib/mock/addresses`, `coupons`, `config/regions` (tax) | `orders.placeOrder`, `orders.authorisePayment`, `wallet.authoriseWalletPayment`, `coupons.applyCoupon*`/`redeemCoupon`, `account.getAddressBook` | `OrderPricing`, `AppliedCoupon`, `DeliveryAddress`, `PaymentMethod` | `checkoutSummary(cartId): CheckoutSummary!`, `applyCoupon`, `placeOrder(input): OrderPayload!` | `Cart`, `Order`, `OrderItem`, `Coupon`, `CouponRedemption`, `PaymentIntent`, `TaxRule`, `Address` | `carts`, `orders`, `order_items`, `order_item_options`, `coupons`, `coupon_claims`, `coupon_redemptions`, `payment_intents`, `tax_rules`, `addresses` |
| C5 | [/checkout/success](../../frontend/app/(marketing)/checkout/success/page.tsx) | `checkout/order-confirmation` (also the completion invoice) | `useOrders` (find by id) | — | — | `Order` | `order(id): Order` | `Order`, `Invoice` | `orders`, `invoices` |
| C6 | [/orders/[id]](../../frontend/app/(marketing)/orders/[id]/page.tsx) | `tracking/order-tracking` (552 ln), `tracking-map`, `orders/order-timeline`, `order-status-chip`, `reason-dialog` | `useOrders` + 1 s tick; `lib/tracking.trackingProgress` | — | `orders.cancelOrder` | `Order`, `OrderEvent`, `OrderRider`, `OrderCancelReason` | `order(id): Order`, **`orderUpdated(orderId): Order!`**, `cancelOrder`, `requestRefund` | `Order`, `OrderEvent` | `orders`, `order_events` |
| C7 | [/account/orders](../../frontend/app/(marketing)/account/orders/page.tsx) | `account/order-history` | `useOrders`, `splitOrders` | — | — | `Order` | `myOrders(page): OrderPage!` | `Order` | `orders` |
| C8 | [/account/notifications](../../frontend/app/(marketing)/account/notifications/page.tsx) + bell | `notifications/notification-center`, `notification-bell`, `notification-row`, `push-bridge` | **`stores/notifications.ts`** (`notify` is the only door in) | — | `notifications.getFeed`, `getOutbox` | `AppNotification`, `NotificationDispatch`, `NotifyAudience` | `notificationFeed(filter, cursor)`, **`notificationReceived: Notification!`**, `markNotificationRead` | `Notification`, `NotificationChannelRecord`, `NotificationDispatch` | `notifications`, `notification_channel_records`, `notification_dispatches` |

**Customer-side specifics worth calling out**

- The OTP is **displayed to the customer** at
  [order-tracking.tsx:193](../../frontend/components/tracking/order-tracking.tsx#L193),
  gated on `isOtpRevealed(order)` (status `arrived` or `delivery-failed`). Today
  it comes from `order.lifecycle.otp`, a 4-digit code derived from the order id
  by `otpFor()` in [lib/delivery.ts:247](../../frontend/lib/delivery.ts#L247).
  The Prisma design stores `otpHash Char(64)` **only** → decision 3.
- Tax is computed client-side from `config/regions.countries[cc].taxRate`
  ([lib/checkout.ts:74](../../frontend/lib/checkout.ts#L74)). E3 deliberately
  left `TaxRule` to E5 → decision 2.
- `estimatedDeliveryAt` at placement is provisional (`now + 40 min`) and is
  restamped by the machine on `confirmed` as
  `promisedReadyAt + RIDE_ALLOWANCE_MIN (18)`.
- Cash orders stay `payment.status = "pending"` until the machine settles them
  on `delivered`. Wallet orders are debited in `checkout-view` against the order
  number so a refund can find the ledger row.

---

## 3. Restaurant flow

| # | Page | Components | Hooks / state | Mock data | Mock service | Types | Expected GraphQL | Backend entity | DB table |
|---|---|---|---|---|---|---|---|---|---|
| R1 | [/dashboard](../../frontend/app/(dashboard)/dashboard/page.tsx) | `dashboard/overview-view`, `stat-card`, `revenue-chart`, `peak-hours-chart`, `best-sellers` | `useOrders` (today's KPIs) + `vendor.getVendorDashboard` | `lib/mock/vendor-orders` (synthesised week) | `vendor.getVendorDashboard` | `VendorStats`, `RevenuePoint`, `HourlyPoint`, `BestSeller` | `vendorDashboard(vendorId)` — **out of V1 scope**, see §5 | `Order` (aggregates) | `orders` |
| R2 | [/dashboard/orders](../../frontend/app/(dashboard)/dashboard/orders/page.tsx) | `dashboard/orders-board` (581 ln), `order-status-chip`, `order-timeline`, `prep-time-dialog`, `reason-dialog`, `assign-rider-dialog` | `useOrders` (`advance`, `delayOrder`, `assignRider`, `autoDispatch`), `useDashboard`, 1 s tick, `getFleet()` | `lib/mock/riders` (fleet for manual assign) | `delivery.getFleet` | `Order`, `OrderAction`, `OrderCancelReason`, `Rider` | `vendorOrders(vendorId, status, page)`, `acceptOrder`, `rejectOrder`, `advanceOrder`, `addOrderDelay`, `assignRider`, **`vendorOrderStream(vendorId): OrderEvent!`** | `Order`, `OrderEvent`, `Rider`, `VendorStaff` | `orders`, `order_events`, `riders`, `vendor_staff` |
| R3 | [/dashboard/kitchen](../../frontend/app/(dashboard)/dashboard/kitchen/page.tsx) | `dashboard/kitchen-queue` (239 ln) | `useOrders` (`advance` only), `useDashboard`, 1 s tick | — | — | `Order`, `OrderStatus` | `kitchenQueue(vendorId): [Order!]!`, `advanceOrder`, **`kitchenQueueUpdated(vendorId)`** | `Order` | `orders` |

**Restaurant-side specifics**

- `GROUPS` in `orders-board.tsx:49` maps board tabs → statuses; `COLUMNS`/`NEXT`
  in `kitchen-queue.tsx:20-31` map kitchen columns → statuses. Both are derived
  from the machine's vocabulary, so **the server must not rename a status.**
- Accept requires a prep time (`PREP_TIME_OPTIONS = [15, 25, 35]`); the machine
  refuses `confirmed` without one (`errors.prepTimeRequired`). Reject requires a
  reason from `REJECT_REASONS`. "Need more time" adds `DELAY_OPTIONS = [5,10,15]`
  **without** a status change — `addDelay` appends an event with
  `note: "delay:<n>"`.
- Dispatch is a first-class step: `ready` → `assign` action → either
  `autoDispatch` (server-side `dispatchRider`: prefer riders in the drop zone,
  exclude declines, rank by `rating × acceptanceRate`, deterministic) or a
  hand-picked rider from the fleet.
- The kitchen has **no "Pause"** action (brief Phase 7 lists one) — the machine
  has no paused state. Decision 5.
- The board's `submitting` state is set only by the rider dialog; the other three
  dialogs never set it. Cosmetic, pre-existing, out of scope.

---

## 4. Rider flow

| # | Page | Components | Hooks / state | Mock data | Mock service | Types | Expected GraphQL | Backend entity | DB table |
|---|---|---|---|---|---|---|---|---|---|
| D1 | [/delivery](../../frontend/app/(rider)/delivery/page.tsx) | `rider/today-view`, **`rider/live-deliveries`** (241 ln), `offer-card`, `rider-shell` | `useOrders` (`dispatchableOrders`, `activeOrderForRider`, `assignRider`), `useRider`, `useRiderApp` | `lib/mock/riders`, `delivery-zones`, `delivery-jobs` | `delivery.getRiderProfile`, `getRiderZone`, `getRiderDay`, `getJobOffers` | `Order`, `Rider`, `DeliveryZone`, `DeliveryJob` | `availableDeliveries(riderId): [Order!]!`, `acceptDelivery(orderId)`, `assignedDelivery(riderId): Order` | `Order`, `Rider`, `DeliveryZone`, `JobOffer`, `OrderRiderDecline` | `orders`, `riders`, `delivery_zones`, `job_offers`, `order_rider_declines` |
| D2 | [/delivery/order/[id]](../../frontend/app/(rider)/delivery/order/[id]/page.tsx) | **`rider/live-trip-view`** (380 ln), `orders/otp-dialog`, `reason-dialog`, `order-timeline` | `useOrders` (`advance`, `failOtp`, `notifyNearby`), `useRiderApp`, 1 s tick | — | `orders.verifyOtp` | `Order`, `OrderAction`, `OrderCancelReason` | `advanceOrder`, **`verifyDeliveryOtp`**, `reportDeliveryFailure`, **`orderUpdated(orderId)`** | `Order`, `OrderEvent` | `orders`, `order_events` |
| D3 | [/delivery/trip/[id]](../../frontend/app/(rider)/delivery/trip/[id]/page.tsx) | `rider/trip-view`, `route-map`, `handoff-dialog` | `useRider.activeJob` | `lib/mock/delivery-jobs` | `delivery.getRiderJob`, `completeStop`, `cancelJob` | `DeliveryJob`, `DeliveryStop` | **out of V1 scope** (§5) | `DeliveryJob`, `DeliveryStop` | `delivery_jobs`, `delivery_stops` |
| D4 | wallet / earnings / history / profile | `rider/wallet-view`, `earnings-view`, `history-view`, `profile-view` | `useRider` | `lib/mock/delivery-jobs`, `wallet` | `delivery.getRiderWallet`, `getRiderEarnings`, `getRiderJobs`, `remitCash`, `withdrawEarnings` | `RiderLedger*`, `RiderRemittance`, `RiderWithdrawal` | **out of V1 scope** (§5) | `RiderLedgerEntry`, `RiderRemittance`, `RiderWithdrawal` | `rider_ledger_entries`, `rider_remittances`, `rider_withdrawals` |

**Rider-side specifics**

- **Two parallel rider surfaces exist and only one is in V1 scope.**
  `live-deliveries` + `live-trip-view` drive **real orders** out of the order
  store — that is the demo path. `today-view` + `trip-view` drive the
  **synthesised multi-stop jobs** from `lib/mock/delivery-jobs.ts`, which is what
  makes batching, routing, payouts and a week of earnings demonstrable. Do not
  touch the second one in V1.
- The rider's OTP submit path: `verifyOtp(order, entered)` in the seam → on
  mismatch `failOtp(id)` increments `lifecycle.otpAttempts` and logs an
  `otp-failed:<n>` event; at `OTP_MAX_ATTEMPTS = 3` the machine refuses
  `delivered` with `errors.otpLocked` and the rider's only remaining moves are
  `delivery-failed` → retry or return. **This whole branch must move server-side
  intact** — it is the brief's "OTP Incorrect" and "Delivery Failed" scenarios.
- A rider may hand a job back: `rider-assigned` → `ready` pushes their id onto
  `lifecycle.rejectedRiderIds` (→ `order_rider_declines`) and clears the
  assignment, so dispatch offers it to somebody else.
- `notifyNearby` fires when the rider leaves the restaurant (`on-the-way`).

---

## 5. Admin flow

| # | Page | Components | Hooks / state | Mock data | Mock service | Types | Expected GraphQL | Backend entity | DB table |
|---|---|---|---|---|---|---|---|---|---|
| A1 | [/admin](../../frontend/app/(admin)/admin/page.tsx) | `admin/live-ops` (376 ln), `admin-shell`, `stat-card`, `order-status-chip` | `useOrders` (`liveOrders`) + 2 s tick, `getFleet()`, `getVendors()` | `lib/mock/riders`, `vendors` | `delivery.getFleet`, `catalog.getVendors` | `Order`, `Rider`, `Vendor` | `adminOrders(filter, page)`, `platformLiveStats`, **`restaurantDashboardUpdated` / ops stream** | `Order`, `Rider`, `Vendor` | `orders`, `riders`, `vendors` |
| A2 | [/admin/notifications](../../frontend/app/(admin)/admin/notifications/page.tsx) | `admin/notification-center` | `useNotifications` (`campaigns`, `outbox`) | — | `notifications.getSegments`, `sendBroadcast` | `NotificationSegment`, `BroadcastInput`, `NotificationCampaign` | `notificationSegments`, `sendBroadcast` | `NotificationSegment`, `NotificationCampaign` | `notification_segments`, `notification_campaigns` |
| A3 | [/admin/cms/*](../../frontend/app/(admin)/admin/cms/page.tsx) | `admin/cms/*` | `useCms` | `lib/mock/cms` | `services/cms` | `CmsDocument` | — | `CmsDocument` | `cms_*` |

`live-ops` is **read-only** — it derives "stuck" (overdue, or `ready` with no
courier for >5 min, or `placed` for >4 min, or `delivery-failed`) rather than
storing a flag. It needs no mutations, only `adminOrders` + a live stream.

### Explicitly out of V1 scope

Leaving these on mocks is deliberate — the brief says replace only what this flow
needs, and each of these is a different phase's business:

`services/ai`, `services/cms`, `services/pages`, `services/content`,
`services/search`, `services/reservations`, `services/reviews`,
`services/subscriptions`, `services/catering`, `services/qr`, `services/pos`,
`services/offers`, `services/favorites`, `services/settings`,
`services/account`, `services/wallet`; and within the two files V1 does touch,
`services/vendor.*` (the synthesised analytics week) and everything in
`services/delivery` except `getFleet`/`getRiderProfile`/`getRiderZone`.

`lib/mock/vendor-orders.ts` and `lib/mock/delivery-jobs.ts` stay: they feed R1's
charts and D3/D4's earnings, and pulling them in V1 would leave two working
screens empty.

---

## 6. Mock inventory for this flow

| Mock module | Feeds | V1 verdict |
|---|---|---|
| `lib/mock/vendors.ts` | C1, C2, R2, A1 | **replace** (read side) |
| `lib/mock/menus.ts`, `foods.ts` | C2 | **replace** |
| `lib/mock/cuisines.ts`, `categories.ts` | C1 | replace (cheap, same query) |
| `lib/mock/addresses.ts` | C4 | **replace** — `Address` exists, E3 deferred the address book to E5 |
| `lib/mock/coupons.ts` | C4 | **replace** |
| `lib/mock/riders.ts` | R2, D1, A1 | **replace** |
| `lib/mock/delivery-zones.ts` | D1 | **replace** (dispatch needs zones) |
| `lib/mock/users.ts` | auth, all shells | **replace** (E2/E3 own it) |
| `lib/mock/demo-orders.ts` | the seeded working set | **delete the client seed**, move to server seed (decision 7) |
| `lib/mock/couriers.ts` | legacy `getCourier()` | dead in the new flow — verify then drop |
| `lib/mock/vendor-orders.ts` | R1 analytics | **keep** (out of scope) |
| `lib/mock/delivery-jobs.ts` | D3, D4 | **keep** (out of scope) |
| `lib/mock/wallet.ts` | D4, account wallet | **keep** |
| `config/regions.ts` (tax table) | C4 totals | **keep until `TaxRule` lands** (decision 2) |

---

## 7. Type contract map

The frontend types need **no changes** if the resolvers return these shapes.

| Frontend type | GraphQL type | Prisma model | Note |
|---|---|---|---|
| `Order` (`types/order.ts:219`) | `Order` | `Order` | `lifecycle` is nested on the read model, flattened in the DB — `OrderResolver.lifecycle()` recomposes it (already the documented plan) |
| `OrderLifecycle` | `OrderLifecycle` | `Order.*` columns + `OrderEvent` + `OrderRiderDecline` | `events` ← `order_events`; `rejectedRiderIds` ← `order_rider_declines` |
| `OrderEvent` | `OrderEvent` | `OrderEvent` | frontend has no `actorId`/`meta`; both are additive |
| `OrderRider` | `OrderRider` | `Order.riderSnapshot Json` | snapshot frozen at assignment |
| `CartVendor` | `CartVendor` | `Order.vendorSnapshot Json` / `Vendor` | stored verbatim, served with zero reshaping |
| `CartLine` / `CartSelectedOption` | `CartLine` | `OrderItem` + `OrderItemOption` (`lineKey` preserves the composite id) | `CartLine.id` stays byte-identical |
| `OrderPricing` | `OrderPricing` | `Order.currency…total` | DB has `serviceCharge`, `packagingFee`, `commission` the frontend does not read — additive |
| `OrderPayment` | `OrderPayment` | `Order.paymentMethod/paymentStatus/cardLast4` | frontend `PaymentMethod` is `cash\|card\|wallet`; DB adds `mfs`, `netbanking` — **superset, safe** |
| `DeliveryAddress` | `DeliveryAddress` | `Order.addressSnapshot Json` / `Address` | |
| `AppNotification` | `Notification` | `Notification` + `NotificationChannelRecord` | `channels` is a join table server-side, a list on the wire |
| `Rider` | `Rider` | `Rider` | |
| `OrderStatus`, `OrderActor`, `FulfillmentType`, `PaymentStatus`, `OrderCancelReason`, `RefundStatus`, `"auto"\|"manual"` | enum scalars | `OrderStatusKind`, `OrderActorKind`, `FulfillmentKind`, `PaymentStatusKind`, `OrderCancelReasonKind`, `RefundStatusKind`, `AssignmentKind` | **all `@map` labels already match the TS unions exactly** |

Two genuine mismatches:

1. **`BaseEntity` on `Order`.** The frontend's `Order extends BaseEntity`
   (`id`, `createdAt`, `updatedAt`, `deletedAt`) but has **no `version`**, and
   the brief's Phase 2 requires optimistic locking. `version` must be added to
   the GraphQL `Order` and threaded through mutation inputs, or the server must
   resolve conflicts by re-reading. Recommend: expose `version` on `Order` and
   accept it optionally on `advanceOrder` — the store already holds the whole
   order, so passing it back is free and no component changes.
2. **`lifecycle.otp`** is a plaintext field on the read model. See decision 3.

---

## 8. Decisions needed before Phase 2

Each of these changes what gets built. My recommendation is first in each case.

**1. Auth cutover is a prerequisite, not a parallel task.** Every query in this
flow is authenticated, and the frontend holds no token. `services/auth.ts` must
start returning E2's access/refresh pair and `stores/auth.ts` must hold them.
`bun run seed:reference` must run first (`User.countryCode` is a non-null FK).
→ *Recommend making this V1 unit 0.*

**2. Tax.** E3 deliberately left `TaxRule` to E5, so the frontend's local
`config/regions` tax table is the only source today. The brief says adapt the
backend, not the frontend, and an order whose total the server cannot reproduce
is not a real order. → *Recommend implementing minimal `TaxRule` resolution in
V1 (country-scoped rate + label, seeded for BD) and computing `OrderPricing`
server-side. The frontend keeps `computeTotals` for the live pre-checkout
preview; the server's number wins at placement.*

**3. OTP storage vs. display.** The customer's tracker **renders the 4-digit
code** at `arrived`; the DB design stores `otpHash Char(64)` only. Options:
(a) return the plaintext only to the order's own customer and only when
`isOtpRevealed`, storing an encrypted column alongside the hash; (b) keep the
hash and have the *server* render/deliver the code to the customer by
notification only, and drop it from the tracker. (b) changes the UI, which the
brief forbids. → *Recommend (a): `otpHash` for verification + a reversible
`otpSecret` readable by exactly two resolvers (customer-owner read, rider
verify), with the read audited.*

**4. Server cart or client cart?** D5 specifies `addToCart`/`updateCartLine` and
the `Cart` tables exist, but `stores/cart.ts` is pure client state with a
single-vendor conflict dialog that is *synchronous* (`add()` returns
`{conflict}` immediately). Making every add a round-trip risks the one UI
behaviour the brief protects. → *Recommend: build the server cart
(`carts`/`cart_items`) and have the client store **mirror** it — optimistic local
add, fire-and-forget sync, server cart authoritative at checkout only. The
conflict dialog stays synchronous and nothing in the UI changes.*

**5. Kitchen "Pause".** Brief Phase 7 lists Start Cooking / **Pause** / Ready;
neither the machine nor the DB has a paused state. → *Recommend treating "need
more time" (`addDelay`, already built on both sides) as the Pause affordance and
noting it, rather than adding a 17th status the frontend cannot render.*

**6. Pagination shape.** `services/http.ts::Paginated<T>` is offset-based; D5
mandates cursor pagination for order feeds. → *Recommend the resolvers return
cursor pages and the two list services (`myOrders`, `vendorOrders`) adapt inside
the service function, keeping `Paginated<T>` at the seam. Zero component
changes.*

**7. Seeding collision.** `stores/orders.ts` seeds `buildDemoOrders(now)` on
first hydration. Once the server seeds orders in every status (brief Phase 12),
the client seed produces phantom duplicates. → *Recommend gating `seed()` on
"no backend configured". This is the one small frontend change the brief
anticipates; it touches no UI.*

**8. Notification fan-out ownership.** `lib/notifications.ts::notificationsFor`
holds the whole per-status × per-audience fan-out table (`FANOUT`), and
`stores/notifications.ts::notify` applies the channel gate. Both must move
server-side or notifications will be raised twice. → *Recommend: port `FANOUT`
into the notification module, make `notify` a read-through cache of
`notificationFeed` + the `notificationReceived` subscription, and delete
`REQUIRED_NOTIFICATIONS` from `services/settings.ts` (E3 already enforces
required channels server-side).*

**9. New dependencies.** Backend: `graphql-ws`, `@nestjs/websockets`,
`@nestjs/platform-ws` (or Fastify equivalent), `bullmq`. Frontend: a GraphQL
client. → *Recommend **no Apollo Client** — a ~60-line typed `fetch` wrapper in
`lib/graphql.ts` plus `graphql-ws` for the three subscriptions. The services
layer is already the cache boundary; adding Apollo's cache on top of Zustand
would create two caches that disagree.*

---

## 9. Proposed implementation order

Each unit leaves the frontend working, per the brief's incremental rule. Stop
and confirm after each.

| Unit | Brief phases | Content |
|---|---|---|
| **0** | — | Migrations for the V1 subset + `seed:reference`; verify the schema compiles against a real Postgres for the first time |
| **1** | 13 (partial) | Auth cutover: tokens in `services/auth.ts`, `lib/graphql.ts` client, `stores/auth.ts` holds the pair. Nothing else moves |
| **2** | 5, 12 (partial) | Catalog read side: `vendors`, `vendorMenu` → `services/catalog.ts`; seed restaurant, branch, menus, foods, variants, addons |
| **3** | 5, 6 | `orders` module: domain machine ported from `lib/order-machine.ts`, repository, `order`/`myOrders` queries. Read-only — the store still writes locally |
| **4** | 5, 11 | `cart` + `checkout` + `payment` (mock provider): `placeOrder` writes real rows; `addOrder` commits the server's order |
| **5** | 7 | `restaurant-orders` + `kitchen`: `acceptOrder`, `rejectOrder`, `advanceOrder`, `addOrderDelay` behind `advance()`/`delayOrder()` |
| **6** | 8 | `delivery` + `rider-assignment` + `otp`: dispatch, accept, pickup, `verifyDeliveryOtp`, failure branch |
| **7** | 9 | `notification` module: fan-out server-side, feed query, dispatch rows |
| **8** | 10 | Realtime: `orderUpdated`, `vendorOrderStream`/kitchen, notifications, rider pings; Redis pub/sub |
| **9** | 12, 14 | Full seed (orders in every status, OTP, payments, staff, riders) + the 20-step demo script |

---

## 10. What this report does not claim

- Nothing here has been run against Postgres or Redis — this machine has
  neither, and E1–E3 were verified only with in-memory fakes behind real ports.
  Every `where` builder, the partial unique indexes, and the soft-delete revive
  paths in the existing modules are still unverified against a real database.
- The Prisma schema is 6,016 lines of *design*. Unit 0 is where we find out
  whether it migrates.
- Line references are to the tree as of 2026-08-03 on `main` (clean).
