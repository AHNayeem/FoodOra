import type { BaseEntity, ISODate } from "./common";
import type { RefundMethod } from "./order";

/**
 * support.ts — the dispute record (Phase 5, G25/G26).
 *
 * Before this the prototype's answer to "my order was wrong" was a static FAQ and
 * a `mailto:`, which meant a customer's complaint left the product entirely and
 * the operations desk had no queue at all. A refund could only happen as an
 * automatic wallet credit on a cancellation — there was nowhere for a human
 * decision to be recorded.
 *
 * The shape follows the same rules as `Order`:
 *
 *  - **The event log is the truth.** A ticket's `status` is where it got to;
 *    `events` is what happened, append-only, each entry attributed and timed. A
 *    status on its own cannot say who replied, what an agent noted privately, or
 *    which refund decision was taken — so nothing is stored *only* as a status.
 *  - **Visibility is a property of the event, not of the reader.** An internal
 *    note is `visibility: "internal"` and is filtered once, in
 *    `lib/support.customerEvents`, so the customer's surfaces cannot leak one by
 *    forgetting a condition.
 *  - **The refund lives on the order, not here.** A ticket *records* the decision
 *    (`kind: "refund"` events, and `resolution.refundAmount`) but the money is
 *    `order.lifecycle.refund` — one place, so the customer's tracker, the admin's
 *    order page and platform financials cannot disagree about whether they were
 *    paid.
 */

/**
 * What went wrong, from the spec's list. Categories rather than free text because
 * a category can be counted, routed and reported on; the prose goes in the first
 * message.
 */
export type SupportCategory =
  | "missing-item"
  | "wrong-item"
  | "damaged"
  | "late-delivery"
  | "payment-issue"
  | "restaurant-issue"
  | "rider-issue"
  | "other";

/**
 * Where a ticket has got to.
 *
 * `resolved` and `rejected` are both *decisions* — something was granted, or it
 * was refused with a reason — and `closed` is filing it away afterwards. Keeping
 * the decision and the filing separate is what makes "closed" mean the same thing
 * for a ticket that was paid out and one that was not, and what makes reopening
 * possible from either.
 */
export type SupportTicketStatus =
  /** Submitted, nobody has picked it up. */
  | "open"
  /** An agent is working on it. */
  | "in-review"
  /** The desk has asked the customer something and is waiting. */
  | "awaiting-customer"
  /** Decided in the customer's favour. */
  | "resolved"
  /** Refused, with a reason. */
  | "rejected"
  /** Filed. Reopenable. */
  | "closed";

/** Who produced an event. `system` is the platform recording its own actions. */
export type SupportAuthor = "customer" | "agent" | "system";

export type SupportEventKind =
  /** Prose either side wrote. */
  | "message"
  /** Prose only the desk sees. */
  | "note"
  /** The ticket moved. */
  | "status"
  /** A refund was approved, refused or settled. */
  | "refund";

/** A refund decision, as recorded on the ticket's log. */
export interface SupportRefundRecord {
  decision: "approved" | "rejected" | "settled";
  /** In the ticket currency; 0 for a refusal. */
  amount: number;
  method: RefundMethod | null;
}

/** One thing that happened to a ticket. Append-only, oldest first. */
export interface SupportEvent {
  id: string;
  kind: SupportEventKind;
  author: SupportAuthor;
  /** Display name of whoever did it — an agent's name, or the customer's. */
  authorName: string;
  /** What was written. Null for a bare status move. */
  body: string | null;
  /** The status the ticket moved into (`kind: "status"`). */
  status: SupportTicketStatus | null;
  /** The refund decision this records (`kind: "refund"`). */
  refund: SupportRefundRecord | null;
  /** Whether the customer sees it. Internal notes never leave the desk. */
  visibility: "customer" | "internal";
  at: ISODate;
}

/** What the desk did about it — the sentence the customer is shown at the end. */
export type SupportOutcome =
  /** Money back. */
  | "refunded"
  /** Wallet credit or a voucher instead of money back. */
  | "credited"
  /** The order (or the missing part of it) was sent again. */
  | "replaced"
  /** Nothing owed, but an explanation given. */
  | "explained"
  /** Refused. */
  | "refused";

export interface SupportResolution {
  outcome: SupportOutcome;
  /** What the customer is told. Prose a human wrote, so it is not translated. */
  note: string;
  /** Refund granted as part of it, in the ticket currency; 0 when none. */
  refundAmount: number;
  at: ISODate;
  /** The agent account that decided. */
  by: string;
}

/**
 * A support ticket about one order.
 *
 * The order's identifying fields are snapshotted the way `Order` snapshots its
 * vendor: a ticket has to stay readable — in a queue, in a report — without
 * joining to an order that may since have been deleted.
 */
export interface SupportTicket extends BaseEntity {
  /** Human-facing reference, e.g. `SUP-8F3A21`. */
  ticketNumber: string;
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  customerName: string;
  customerPhone: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  currency: string;
  /** The order's total, so the queue can show what is at stake. */
  orderTotal: number;
  events: SupportEvent[];
  resolution: SupportResolution | null;
  submittedAt: ISODate;
  /** When it was filed away; null while it is still open or merely decided. */
  closedAt: ISODate | null;
}
