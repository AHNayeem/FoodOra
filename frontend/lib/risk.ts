import type { Customer, Order } from "@/types";
import { cashDueOn } from "./order-machine";

/**
 * risk.ts — the prototype's representation of abuse (Phase 18, G44).
 *
 * The gap analysis found nothing here at all: a declined card could be retried
 * forever, a customer could ask for and be granted a refund on every order they
 * ever placed without anything saying so, a coupon could be spent on an order
 * that was then charged back, and the zone's cash limit — which the rider's
 * wallet screen draws a red progress bar against — was never once consulted when
 * a real cash order was handed to a courier.
 *
 * Four rules, and all of them **derived**. There is no risk table, no score
 * written to a customer, nothing to keep in step: a flag here is a way of reading
 * records the platform already keeps, which is why it cannot disagree with them.
 * The alternative — a `Customer.riskScore` updated by whatever remembered to —
 * would be the §5.2 mistake with an especially bad failure mode, since the number
 * would go stale exactly when it mattered.
 *
 * What this module is not: a fraud engine. It has no model, no velocity graph and
 * no appeal workflow. It is the smallest set of representations that makes the
 * four holes in the demo visible and, where refusing is the honest answer,
 * enforced — see `enforcement` below.
 *
 * ## Enforcement
 *
 * Two of the four refuse, and two only flag, and the split is deliberate:
 *
 *  - **Refused**: a card retried past {@link PAYMENT_MAX_ATTEMPTS} (checkout), and
 *    a cash order handed to a courier already over their zone's cash ceiling
 *    (`stores/orders.assignRider`). Both are decisions a machine can make
 *    correctly and both have an obvious remedy the person can act on — pay
 *    another way, hand cash in.
 *  - **Flagged**: repeat refunds and coupons spent on refunded orders. Both are
 *    patterns rather than facts — a customer with three bad deliveries in a row is
 *    indistinguishable from one claiming three, and the difference is a judgement
 *    the desk makes with the orders in front of it. So the flag is shown where the
 *    refund is decided, and the decision stays with the agent. Blocking the
 *    account is a moderator's action and already exists (Phase 11).
 */

/** How far back a pattern is read. A month: long enough to be a habit. */
export const RISK_WINDOW_DAYS = 30;

/** Refunds inside the window that make a customer worth a second look. */
export const REFUND_WATCH_COUNT = 2;
/** …and the count at which the desk should be told before it decides. */
export const REFUND_ELEVATED_COUNT = 3;

/** Discounted orders that ended in a refund — a coupon spent and taken back. */
export const COUPON_REFUND_WATCH_COUNT = 2;

/** Wrong doorstep/counter codes across a customer's orders in the window. */
export const HANDOFF_FAILURE_WATCH_COUNT = 3;

/**
 * Declines allowed on one checkout before the tender is closed.
 *
 * Three, which is what a card network's own retry guidance allows, and the point
 * is that there *is* a number: the prototype used to toast "payment declined" and
 * leave the button live, so the reserved test card could be submitted a hundred
 * times. Card testing is the commonest automated abuse of a checkout there is,
 * and an unbounded retry is the whole of it.
 */
export const PAYMENT_MAX_ATTEMPTS = 3;

/** Is the card closed for this checkout after `declines` refusals? */
export function paymentLocked(declines: number): boolean {
  return declines >= PAYMENT_MAX_ATTEMPTS;
}

/** How severe a signal is. Ordered — `worst` compares by this. */
export type RiskLevel = "clear" | "watch" | "elevated" | "blocked";

const SEVERITY: Record<RiskLevel, number> = {
  clear: 0,
  watch: 1,
  elevated: 2,
  blocked: 3,
};

/** What kind of pattern was read. Keys map onto `admin.risk.*` messages. */
export type RiskSignalKind =
  /** Refunds asked for or granted, repeatedly. */
  | "refunds"
  /** Coupons spent on orders that then went back. */
  | "couponRefunds"
  /** Wrong handover codes at the door or the counter. */
  | "handoffFailures";

export interface RiskSignal {
  kind: RiskSignalKind;
  level: Exclude<RiskLevel, "clear" | "blocked">;
  /** How many times it happened. */
  count: number;
  /** Out of how many orders — a count with no denominator says nothing. */
  of: number;
}

export interface CustomerRisk {
  level: RiskLevel;
  signals: RiskSignal[];
  /** Orders the reading was taken over. */
  window: number;
}

/**
 * Read a customer's risk from their orders.
 *
 * `orders` is that customer's feed (`lib/customers.ordersForCustomer`) and
 * `customer` their managed record where one exists. A blocked account outranks
 * every derived signal and keeps its signals beside it, because "why was this
 * account stopped" is the first question anybody asks of one.
 *
 * Pure, and it reads the clock only through `now`.
 */
export function customerRisk(
  orders: Order[],
  customer: Customer | null,
  now: number,
): CustomerRisk {
  const from = now - RISK_WINDOW_DAYS * 86_400_000;
  const recent = orders.filter((o) => Date.parse(o.placedAt) >= from);
  const signals: RiskSignal[] = [];

  // A refund *asked for* counts, not only one granted: the pattern this is
  // looking for is the asking, and an account that has been refused three times
  // is precisely the one the desk wants flagged on the fourth.
  const refunds = recent.filter((o) => o.lifecycle.refund !== "none").length;
  if (refunds >= REFUND_WATCH_COUNT) {
    signals.push({
      kind: "refunds",
      level: refunds >= REFUND_ELEVATED_COUNT ? "elevated" : "watch",
      count: refunds,
      of: recent.length,
    });
  }

  const couponRefunds = recent.filter(
    (o) => o.pricing.couponCode !== null && o.lifecycle.refund !== "none",
  ).length;
  if (couponRefunds >= COUPON_REFUND_WATCH_COUNT) {
    signals.push({
      kind: "couponRefunds",
      level: "elevated",
      count: couponRefunds,
      of: recent.filter((o) => o.pricing.couponCode !== null).length,
    });
  }

  // The two attempt counters the lifecycle already keeps, summed. They lock a
  // single order on their own (`OTP_MAX_ATTEMPTS`, `HANDOVER_MAX_ATTEMPTS`); what
  // no surface could see before is the customer at whose door it keeps happening.
  const handoffFailures = recent.reduce(
    (sum, o) => sum + (o.lifecycle.otpAttempts ?? 0) + (o.lifecycle.handoverAttempts ?? 0),
    0,
  );
  if (handoffFailures >= HANDOFF_FAILURE_WATCH_COUNT) {
    signals.push({
      kind: "handoffFailures",
      level: "watch",
      count: handoffFailures,
      of: recent.length,
    });
  }

  const derived = signals.reduce<RiskLevel>((worst, s) => worse(worst, s.level), "clear");
  return {
    level: customer?.status === "blocked" ? "blocked" : derived,
    signals,
    window: recent.length,
  };
}

/** The more serious of two levels. */
export function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/**
 * Is a coupon refused for this customer?
 *
 * `elevated` and above, which is two coupons taken back or three refunds inside
 * the month. Deliberately narrower than blocking the account: the customer can
 * still order, still pay and still be delivered to — they cannot claim a discount
 * while the pattern stands, which is the abuse being guarded and nothing else.
 *
 * Read by `lib/coupons.evaluateCoupon` through `CouponContext.riskHold`, so the
 * refusal comes out of the coupon engine with a reason beside it like every other
 * refusal, rather than as a special case at one checkout.
 */
export function couponHeld(risk: CustomerRisk): boolean {
  return SEVERITY[risk.level] >= SEVERITY.elevated;
}

// ---------------------------------------------------------------------------
// Cash exposure (G44 + G05)
// ---------------------------------------------------------------------------

/**
 * Cash a courier is carrying from *real* orders, today.
 *
 * `lib/delivery.cashPosition` answers the same question over the synthesised
 * trips and their remittances, and the rider's wallet screen has drawn a limit
 * bar from it since Phase 3. It was never consulted when a real order was
 * assigned — which is the whole of G44's fourth bullet: the ceiling existed as a
 * picture.
 *
 * Today, because that is the window the order book can honestly answer. A
 * remittance is recorded per device (`stores/rider`), so this device knows what
 * *its* rider has handed in and nothing about anybody else's; a day boundary is
 * the same answer for every courier and is when a float is reconciled anyway.
 */
export function riderCashInHand(orders: Order[], riderId: string, now: number): number {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const from = dayStart.getTime();

  return orders
    .filter(
      (o) =>
        o.lifecycle.rider?.id === riderId &&
        (o.status === "delivered" || o.status === "completed") &&
        Date.parse(o.updatedAt) >= from,
    )
    .reduce((sum, o) => sum + (o.payment.method === "cash" ? o.pricing.total : 0), 0);
}

/**
 * Would giving this courier this order put them over the ceiling?
 *
 * The test is on what they would hold *after* the drop, not what they hold now: a
 * courier a hundred taka under the limit cannot be sent to collect another two
 * thousand. `limit` comes from the rider's zone (`DeliveryZone.cashLimit`), so a
 * zone that trusts its couriers with more is respected.
 *
 * **A courier carrying nothing always gets the job**, even one worth more than
 * the whole ceiling, and that clause is load-bearing rather than a let-off. A cash
 * float cap stops a courier being *loaded up*; it is not a price limit on a single
 * order. Without the clause an order above the ceiling could be assigned to
 * nobody — the guard would refuse every courier in the zone with the same "already
 * carrying too much" message while all of them held nothing — and the order would
 * sit at `ready` for ever with no action anyone could take to move it. Refusing
 * something for a reason that is false about the person being refused is worse
 * than not refusing it. (Capping the *value* of a cash order is a real control
 * too, and it belongs at checkout where the customer can still choose another
 * tender — not here, where the food is already cooked.)
 *
 * False for a prepaid order whatever the courier is carrying: there is no money to
 * collect, so there is no exposure to add.
 */
export function overCashLimit(
  orders: Order[],
  riderId: string,
  order: Order,
  limit: number,
  now: number,
): boolean {
  const due = cashDueOn(order);
  if (due <= 0) return false;
  const inHand = riderCashInHand(orders, riderId, now);
  if (inHand <= 0) return false;
  return inHand + due > limit;
}
