import type {
  ContactAuthor,
  ContactEntry,
  ContactParty,
  Order,
  OrderThread,
} from "@/types";
import { isActive } from "./order-lifecycle";

/**
 * order-chat.ts — the rules of an order's contact thread (Phase 17, G27).
 *
 * Small on purpose. The interesting decisions are two:
 *
 *  1. **When contact is possible at all.** Not "always" — a courier who delivered
 *     somebody's dinner an hour ago is carrying three other orders, and a thread
 *     that stays open forever is a channel with no counterparty. Contact tracks
 *     the *order*: the restaurant while the order is live, the courier from the
 *     moment one is assigned until the order stops moving. Afterwards the honest
 *     route is a support ticket, which the tracker already offers.
 *  2. **A call is an entry, not an action.** There is no telephony provider, and
 *     inventing one would be the fabricated capability §5.3 rules out. What a real
 *     call would leave behind is a record that it happened, so that is what the
 *     button writes — into the same thread, in order, where both sides can see it.
 *
 * Pure: `now` is passed in and nothing here reads a store.
 */

/** Stable per order *and* party — one conversation each, found without a search. */
export function threadIdFor(orderId: string, party: ContactParty): string {
  return `thr_${orderId}_${party}`;
}

/**
 * May the customer reach this party right now?
 *
 * The rider case is two facts, not one: there has to *be* a courier, and the
 * order has to still be moving. `isActive` is the same predicate the account's
 * active/past split uses, so a thread closes at exactly the moment the order
 * leaves the customer's "in progress" list.
 */
export function canContact(order: Order, party: ContactParty): boolean {
  if (!isActive(order)) return false;
  if (party === "restaurant") {
    // A booked slot has nobody to talk to yet — the kitchen has not been given
    // the order (G34), and messaging a restaurant about an order it cannot see
    // would be a message into a void.
    return order.status !== "scheduled";
  }
  return order.lifecycle.rider !== null;
}

/** Who the customer is talking to, for the thread header. */
export function counterpartyName(order: Order, party: ContactParty): string {
  return party === "rider" ? (order.lifecycle.rider?.name ?? "") : order.vendor.name;
}

/**
 * Openers offered as taps rather than typing — i18n keys under `contact.quick.*`.
 *
 * A courier at a traffic light and a customer watching a map both want to send
 * one of about four sentences, and the ones worth offering differ by party: where
 * to leave the food is a rider question, and what is in the bag is a kitchen one.
 */
export const QUICK_MESSAGES: Record<ContactParty, readonly string[]> = {
  rider: ["atGate", "callOnArrival", "leaveAtDoor", "whereAreYou"],
  restaurant: ["addCutlery", "noOnions", "howLong", "changeAddress"],
};

/** The openers the *other* side sends — the rider and the kitchen answering. */
export const QUICK_REPLIES: Record<ContactParty, readonly string[]> = {
  rider: ["onMyWay", "atTheDoor", "cannotFind", "delayedTraffic"],
  restaurant: ["noted", "runningLate", "outOfStock", "onItsWay"],
};

/** A thread with nothing in it yet. */
export function openThread(
  order: Order,
  party: ContactParty,
  now: number = Date.now(),
): OrderThread {
  const iso = new Date(now).toISOString();
  return {
    id: threadIdFor(order.id, party),
    orderId: order.id,
    orderNumber: order.orderNumber,
    party,
    vendorId: order.vendor.id,
    vendorName: order.vendor.name,
    riderId: order.lifecycle.rider?.id ?? null,
    riderName: order.lifecycle.rider?.name ?? null,
    customerName: order.contact.name,
    entries: [],
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/** Longest message accepted. A note to a courier, not an essay. */
export const MAX_MESSAGE_LENGTH = 280;

/** Append an entry. Pure; returns a new thread. Empty prose is refused. */
export function appendEntry(
  thread: OrderThread,
  input: {
    kind: ContactEntry["kind"];
    author: ContactAuthor;
    authorName: string;
    body?: string | null;
  },
  now: number = Date.now(),
): OrderThread {
  const body = input.body?.trim().slice(0, MAX_MESSAGE_LENGTH) || null;
  if (input.kind === "message" && !body) return thread;

  const iso = new Date(now).toISOString();
  return {
    ...thread,
    updatedAt: iso,
    entries: [
      ...thread.entries,
      {
        id: `cnt_${thread.id}_${now.toString(36)}_${thread.entries.length}`,
        kind: input.kind,
        author: input.author,
        authorName: input.authorName,
        body,
        at: iso,
      },
    ],
  };
}

/**
 * Bind the courier snapshot to the thread if it was opened before dispatch.
 *
 * A reassignment is deliberately *not* handled by rewriting this: the old thread
 * keeps the courier it was with, because that is who those messages were sent to.
 * A new courier gets nothing to read, which is right — they were not there.
 */
export function withRider(thread: OrderThread, order: Order): OrderThread {
  const rider = order.lifecycle.rider;
  if (!rider || thread.riderId) return thread;
  return { ...thread, riderId: rider.id, riderName: rider.name };
}
