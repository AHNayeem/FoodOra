import type { BaseEntity, ISODate } from "./common";

/**
 * conversation.ts — the contact thread attached to an order (Phase 17, G27).
 *
 * The tracker's "call" and "message" buttons were `toast.info(…)` stubs, which is
 * the honest thing to do when there is no telephony provider and the wrong thing
 * to leave: a customer whose rider cannot find the gate has nothing to say, and
 * neither does the rider. A support ticket is not the answer either — that is a
 * *dispute* record with a queue and a resolution behind it (`types/support`), and
 * "I'm at the blue gate" is not a dispute.
 *
 * So this is a third, deliberately small shape: an append-only conversation about
 * one order with one counterparty. It follows the same rules as `Order` and
 * `SupportTicket` — the log is the truth, every entry is attributed and timed, and
 * the identifying fields are snapshotted so a thread stays readable on its own.
 *
 * What it is not: a chat product. There is no typing indicator, no read receipt
 * and no delivery state, because none of those can be told the truth about
 * without a server.
 */

/** Who the customer is talking to. Threads are per order *and* per party. */
export type ContactParty = "rider" | "restaurant";

/** Who wrote an entry. `system` is the platform recording something itself. */
export type ContactAuthor = "customer" | "rider" | "restaurant" | "system";

export type ContactEntryKind =
  /** Something somebody wrote. */
  | "message"
  /**
   * A call was placed. Recorded rather than dialled: there is no telephony
   * provider, and a *log* of "the customer tried to call at 19:42" is both true
   * and the thing a real call would have left behind anyway.
   */
  | "call";

export interface ContactEntry {
  id: string;
  kind: ContactEntryKind;
  author: ContactAuthor;
  /** Display name of whoever wrote it — the rider's name, the restaurant's. */
  authorName: string;
  /** What was written. Null for a call entry, which is an event, not prose. */
  body: string | null;
  at: ISODate;
}

/**
 * One conversation about one order.
 *
 * The counterparty's identity is snapshotted the way `Order` snapshots its
 * vendor: a thread with the courier who *had* the order has to stay readable
 * after a reassignment, and it must not silently become a thread with somebody
 * else. `riderId` is null for a restaurant thread and for one opened before
 * dispatch chose anybody.
 */
export interface OrderThread extends BaseEntity {
  orderId: string;
  orderNumber: string;
  party: ContactParty;
  vendorId: string;
  vendorName: string;
  riderId: string | null;
  riderName: string | null;
  customerName: string;
  entries: ContactEntry[];
}
