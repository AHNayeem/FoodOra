# FoodOra — Order Lifecycle Audit

Audit of the food-order lifecycle across all four surfaces (customer, restaurant,
rider, admin) as it stood before the lifecycle work. Findings are grouped by the
categories requested, with the file and line that produces each one.

---

## 0. The headline finding

**The three surfaces are three unrelated simulations. Nothing an actor does is
visible to any other actor.**

| Surface | Source of order data | Where a mutation lands |
|---|---|---|
| Customer | `stores/orders.ts` (persisted, orders placed on this device) | persisted store |
| Restaurant | `lib/mock/vendor-orders.ts` — synthesised fresh on every page visit | `useState` inside `orders-board.tsx` |
| Rider | `lib/mock/delivery-jobs.ts` — synthesised from a 5-minute time bucket | `stores/rider.ts` (`activeJob`) |
| Admin | *does not exist* | — |

Consequences:

1. An order the customer places **never appears** on the restaurant dashboard.
2. The restaurant's *Accept / Preparing / Ready* buttons update a local React
   state array that is **discarded on navigation** — reload the page and the
   order is back to where the synthesiser put it.
3. A rider's trip is built from **invented orders** (`lib/mock/delivery-jobs.ts:248`,
   `orderId = ord_<vendor>_<ts>_<i>`), so completing a delivery cannot mark any
   real order delivered.
4. The customer's status bar is **derived from the clock**, not from what
   anybody did (`lib/tracking.ts:79 trackingProgress`) — it advances even if the
   restaurant rejected the order.

Everything below is a consequence or a detail of this.

---

## 1. ✅ Existing implementation (what is genuinely good and must be kept)

- **Browsing → cart → checkout is complete and solid.** Directory, filters,
  vendor page, sectioned menu, `ItemCustomizer` (option groups, quantity,
  special instruction), single-vendor cart rule with conflict dialog
  (`stores/cart.ts`), coupon field, address book, fulfillment toggle, scheduled
  slots, tip, payment method picker, live tax/total math (`lib/checkout.ts`).
- **Money is real.** `computeTotals` is one pure function used by checkout, the
  vendor order synthesiser *and* the rider payout builder, so a cash order's
  collect-amount is a genuine order total including that vendor's delivery fee,
  VAT and tip.
- **Rider trip mechanics are excellent** — `lib/delivery.ts` has real route
  optimisation, haversine distance, per-vehicle ride times, peak/batch payout
  rules, cash-in-hand limits, and stops that must be completed in route order
  (enforced in `services/delivery.ts`, not in the component).
- **OTP handoff exists** and is checked in the seam, not the UI
  (`services/delivery.ts:258 completeStop` → `lib/delivery.ts:257 otpMatches`),
  with a proper 4-digit `OtpInput` and a cash-collected confirmation.
- **Service seam discipline is consistent** — every read/write is an async
  `Result<T>` in `services/*`, so replacing mocks with a backend touches one layer.
- **i18n / theming / a11y baseline is strong** (3 locales, RTL, focus rings,
  `role="tablist"`, reduced-motion guards).

---

## 2. ❌ Missing steps

| # | Spec step | Status |
|---|---|---|
| 1 | Restaurant selects **estimated preparation time** on accept (15/25/35) | missing — accept goes straight to `confirmed` with no prep time |
| 2 | Restaurant **"Need more time"** action | missing entirely |
| 3 | **Rejection reason** shown to the customer | missing — `reject()` sets `cancelled` with no reason (`orders-board.tsx:106`) |
| 4 | **Packing** state between preparing and ready | missing from `OrderStatus` |
| 5 | **RIDER_ASSIGNED** as a distinct state | missing — customer only learns of a rider at `picked-up` (`lib/tracking.ts:133 hasCourier`) |
| 6 | Automatic **or** manual rider assignment | missing — no dispatch logic anywhere; `getCourier()` just hashes the order id into a static pool (`services/orders.ts:117`) |
| 7 | Rider **accepts/rejects the specific delivery** for a real order | missing — riders accept synthesised trips only |
| 8 | Restaurant **verifies the order at handover** | missing — no handover step on the restaurant side |
| 9 | **ARRIVED / "rider reached destination"** state | missing — required by spec §7 ("OTP shown only after rider reaches destination") |
| 10 | **COMPLETED** as a state distinct from DELIVERED | missing |
| 11 | Customer **invoice** on completion | partial — `/checkout/success` is a receipt but is not surfaced as an invoice from a completed order |
| 12 | **Order timeline component** with animated current step | partial — static timeline in `order-tracking.tsx:213`, no animation, no per-actor events |
| 13 | **Notification system** (customer / restaurant / rider / admin) | missing — only ad-hoc `sonner` toasts; no feed, no bell, no unread state |
| 14 | **Admin dashboard** | missing — no `/admin` route at all |
| 15 | **Failure scenarios** (delivery failed, customer unavailable, returned, refund, reassign rider) | missing — only "cancelled" exists |
| 16 | Restaurant **kitchen queue** view | missing |
| 17 | Customer **chat** button | missing on the tracker (rider app has a stub) |
| 18 | Customer **live rider location** | partial — `TrackingMap` animates a marker on a synthetic line, but it is driven by clock fraction, not by the rider's actual stop progress |

---

## 3. ⚠ Wrong transitions

1. **`lib/tracking.ts:90`** — the customer's stage is `start + (i/(n-1)) * total`,
   i.e. every stage is given an *equal slice* of the window regardless of what
   happened. A 15-minute prep and a 35-minute prep look identical.
2. **`lib/tracking.ts:98`** — an order becomes `delivered` purely because 40
   minutes elapsed. No OTP, no rider, no restaurant action. The spec's
   mandatory OTP gate is bypassed on the only surface the customer sees.
3. **`components/dashboard/orders-board.tsx:27 nextStatus`** — the merchant can
   advance an order through `picked-up` → `on-the-way` → `delivered`, i.e. the
   restaurant can mark an order delivered. That is the rider's transition.
4. **`orders-board.tsx:106 reject`** — rejection is modelled as `cancelled`,
   which is the same terminal state as a *customer* cancellation. The customer,
   the restaurant and the analytics cannot tell the two apart.
5. **`lib/mock/vendor-orders.ts:50 statusForAge`** — status is a function of age
   only, so an order can be `picked-up` at 34 minutes while no rider exists, and
   `cancelled` is rolled at random (`rng() < 0.06`) *after* it has already been
   shown as delivered on a previous render tick.
6. **No guard anywhere prevents an illegal transition.** There is no state
   machine; `updateStatus(id, status)` (`stores/orders.ts:35`) accepts any status
   from any status.
7. **`lib/tracking.ts:126 canCancel`** is evaluated against the *projected*
   index, so whether a customer may cancel depends on the wall clock rather than
   on whether the kitchen actually started.

---

## 4. ⚠ Unrealistic UX

1. **OTP is shown to the customer as soon as the order is `picked-up`**
   (`order-tracking.tsx:197`, gated on `hasCourier`) — 20 minutes before the
   rider arrives. Spec requires it only once the rider reaches the destination.
2. **The courier card appears at `picked-up`** — the customer never sees "a
   rider has been assigned, here is who is coming", which is the single most
   reassuring moment in the flow.
3. **No countdown against a promised prep time** — the ETA is a fixed
   `placed + 40 min` for every order regardless of basket size or restaurant.
4. **The restaurant board has no sound, no badge, no "new order" arrival** —
   incoming orders just exist in a tab; nothing announces them.
5. **No confirmation dialogs** on destructive merchant actions (reject is a
   single tap, no reason, no undo).
6. **Rider "Navigate / Call / Message" are toasts that say they are stubs** —
   honest, but the customer-side call/message are the same, so the demo has no
   working contact affordance anywhere.
7. **`TrackingMap` shows a courier moving before a courier is assigned** —
   the marker animates from the moment the order is placed.
8. **Empty states are inconsistent** — the board has a good one; the customer
   tracker's not-found is fine; the rider offers list is fine; but there is no
   skeleton on the customer tracker (just a spinner) and no error state anywhere.
9. **Nothing tells the demo operator how to drive the story.** There is no way
   to see the same order from three sides without opening three tabs and
   guessing which mock will show it (it will not).

---

## 5. ⚠ Hardcoded data

| Where | What |
|---|---|
| `services/orders.ts:63` | ETA is hardcoded `now + 40 min` for every order |
| `services/orders.ts:117` | courier chosen by `hash(orderId) % couriers.length` — never a real rider from `lib/mock/riders.ts`, and the customer's courier has no relationship to any rider who could actually deliver |
| `lib/tracking.ts:45` | `ACTIVE_WINDOW_MS = 40 min` — the whole lifecycle is squeezed into one constant |
| `lib/mock/vendor-orders.ts:28` | `DAY_COUNTS` fixed per day; the "live" today feed is a fixed shape |
| `lib/mock/vendor-orders.ts:137` | every synthesised customer's phone is `+8801711000000` |
| `lib/mock/delivery-jobs.ts:285-286` | every drop phone is `+8801711000000`, every pickup `+8802255000000` |
| `lib/mock/vendor-orders.ts:135` | `address: null` on every vendor-side order — the restaurant cannot see where anything goes |
| `orders-board.tsx:17` | tab→status grouping hardcoded in the component instead of derived from the machine |
| `order-tracking.tsx:43` | 10s tick hardcoded; no way to speed a demo up |

---

## 6. ⚠ Missing validations

1. No transition guard (see §3.6) — `updateStatus` will happily go
   `delivered → placed`.
2. No check that an order being marked `ready` **has** a rider, or that one is
   dispatched.
3. No OTP attempt limit, no attempt counter, no lockout, no "resend".
4. OTP is only validated on the rider's `DeliveryStop` (`otpMatches`), which
   belongs to a synthesised order — the customer's real order has no OTP field
   at all, so there is nothing to validate against for a real order.
5. Customer cancellation is gated client-side only, on projected time
   (`canCancel`), and `cancelOrder` in the seam accepts any id unconditionally
   (`services/orders.ts:98`).
6. The merchant can reject an order that is already `preparing` if the render is
   stale — `isCancellable` is checked against the row's cached status.
7. No validation that a rejected/cancelled order stops progressing — the
   customer's clock-derived tracker keeps advancing behind a `cancelled` flag
   only because `trackingProgress` special-cases it; any other terminal state
   would keep ticking.

---

## 7. ⚠ Missing notifications

There is **no notification system**. `sonner` toasts fire on the acting device
only, and vanish. Specifically missing, per the spec:

- Customer: Order Placed · Restaurant Accepted · Preparing · Ready · Rider
  Assigned · Rider Picked Up · Near You · OTP Available · Delivered — **0 of 9**
- Restaurant: New Order · Rider Assigned · Delivery Completed — **0 of 3**
- Rider: Delivery Assigned · Pickup Ready · OTP Verified — **0 of 3**
- Admin: Live Order Updates — **0 of 1** (no admin surface)

No unread badge, no feed, no persistence, no per-role routing.

---

## 8. ⚠ Missing order states

`OrderStatus` (`types/order.ts:15`) has 8 members. The spec's lifecycle needs 15.

```
existing:  placed confirmed preparing ready picked-up on-the-way delivered cancelled
missing:   packing  rider-assigned  arrived  completed
           rejected  delivery-failed  returned
```

`cancelled` also conflates four different endings: customer-cancelled,
restaurant-cancelled, rejected-at-intake, and failed-delivery. Each needs a
distinct state or an actor + reason on the record.

Also missing as *data* on the order: `prepMinutes`, `promisedAt`, rejection /
cancellation reason + actor, assigned rider snapshot, OTP + attempts +
verified-at, delay minutes, refund status, and an **event log** (who did what,
when) — without which no honest timeline can be rendered.

---

## 9. Payment flow

- ✅ Method selection (cash / card / wallet) with mock card fields.
- ✅ Cash stays `pending`, card/wallet resolve `paid` at checkout
  (`services/orders.ts:77`).
- ❌ Cash is **never marked `paid` on delivery** — a delivered COD order still
  reads "Payment pending" forever on both the customer receipt and the vendor
  board.
- ❌ No refund state at all (`PaymentStatus` is `pending | paid | failed`).
- ❌ No online-payment *simulation* — no processing step, no failure path, no
  retry. The spec asks for a mock online payment; today it resolves instantly
  and cannot fail.
- ❌ The rider collecting cash (`cashCollected` in `completeStop`) updates the
  rider's wallet but cannot update the order's payment status, because they are
  different orders.

---

## 10. Delivery completion

- ✅ Rider side is well built: route order enforced, OTP checked in the seam,
  cash confirmation required, trip settles into history with a payout receipt.
- ❌ Completing a trip has **no effect on any customer order**, on the vendor
  board, or on any admin view.
- ❌ No "delivery failed" / "customer not available" / "return to restaurant"
  path — the only exit is `cancelJob`, and only before the first pickup.
- ❌ No `completed` step after `delivered` (invoice / rating prompt / payment
  settle).

---

## Summary of work implemented

The audit above drove the following changes. See `FOUNDATION.md` for the
per-file record.

1. **One order state machine** (`lib/order-machine.ts`) — 15 states, explicit
   allowed transitions, per-actor permissions, guards. Every mutation in the
   product goes through it.
2. **One live order store** (`stores/orders.ts`) — the single source of truth
   for the customer, the restaurant, the rider and admin, with an append-only
   event log per order, seeded with believable orders in every state.
3. **Real cross-surface flow** — an order placed by the customer appears on the
   restaurant board; accepting it with a prep time starts the customer's
   countdown; marking it ready dispatches a rider; the rider's OTP handoff
   marks the customer's order delivered and settles the COD payment.
4. **OTP gated on arrival**, stored on the order, attempt-counted, with a
   failure path.
5. **Notification centre** (`stores/notifications.ts`) — per-role feeds, unread
   badges, generated by the machine, not by call sites.
6. **Admin live-ops dashboard** (`/admin`).
7. **Failure scenarios** — reject with reason, delay, cancel (either side),
   rider reassign, OTP failure, delivery failed, return, refund request.
8. **Shared animated timeline**, status chips, countdowns, skeletons, dialogs.
9. **Demo controls** — an autopilot that plays the other actors so one screen
   tells the whole story, and a scenario launcher.
