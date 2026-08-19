import type { Order, SupportCategory, SupportTicket } from "@/types";
import { addMessage, appendEvent, createTicket, moveTicket, resolveTicket } from "@/lib/support";

/**
 * support-tickets.ts — the disputes the prototype opens with.
 *
 * Seeded for the same reason the orders are (see `demo-orders`): an operations
 * desk with an empty queue demonstrates nothing, and a reviewer should not have to
 * file a complaint against themselves before they can see the support surface work.
 *
 * Three properties, and the second is the one that matters:
 *
 *  - **They are built by the domain.** Every ticket here is produced by
 *    `createTicket` and then walked with `addMessage` / `moveTicket` /
 *    `resolveTicket`, so a seeded ticket and one a reviewer files are the same
 *    shape with the same event log. Nothing is hand-assembled.
 *  - **They attach to orders that exist on this device.** The orders are passed in
 *    rather than imported, so a ticket can never reference an order the store does
 *    not hold. If a suitable order is missing, that ticket is simply not seeded.
 *  - **Deterministic given `now`.** Same device, same reload, same queue.
 *
 * The refunds these tickets grant are *not* applied here — the money lives on the
 * order and is seeded there (`demo-orders`), so this module stays free of any
 * second opinion about whether a customer was paid.
 */

const MIN = 60_000;

/**
 * One ticket to seed: which kind of order it is about, what went wrong, and how far
 * the desk has got with it.
 */
interface TicketSpec {
  category: SupportCategory;
  /** Which order to attach it to. First match wins; nothing is seeded if none. */
  pick: (order: Order) => boolean;
  /** How long ago the customer reported it. */
  ageMin: number;
  message: string;
  /** The desk's reply, and how long after the report it came. */
  agentReply?: { body: string; afterMin: number; name: string };
  /** A note only the desk sees. */
  internalNote?: { body: string; afterMin: number; name: string };
  /** Where it ended up. Omit to leave it open. */
  outcome?: {
    kind: "resolved-refund" | "resolved-explained" | "refused";
    note: string;
    afterMin: number;
    by: string;
  };
  /** Park it on the customer instead of leaving it open. */
  awaitingCustomer?: boolean;
}

const AGENT = "Priya Das";
const AGENT_TWO = "Mahin Rahman";

const SPECS: TicketSpec[] = [
  // Untouched, at the top of the queue — the row a reviewer clicks first.
  {
    category: "missing-item",
    pick: (o) => o.status === "completed" && o.lifecycle.refund === "none",
    ageMin: 26,
    message:
      "One of the two dishes wasn't in the bag — only the rice arrived. I've checked the order and I was charged for both.",
  },
  // Being worked on, with an internal note the customer must never see.
  {
    category: "late-delivery",
    pick: (o) =>
      o.status === "completed" &&
      o.fulfillment === "delivery" &&
      o.lifecycle.refund === "none",
    ageMin: 95,
    message:
      "This took nearly an hour and a half. The food was cold by the time it got here.",
    agentReply: {
      body: "I'm sorry — I can see the kitchen asked for extra time twice on this one. Let me check what happened with the restaurant and come back to you today.",
      afterMin: 20,
      name: AGENT,
    },
    internalNote: {
      body: "Third late complaint against this kitchen this week. Flagging for the partner team before we offer anything.",
      afterMin: 25,
      name: AGENT,
    },
  },
  // Waiting on the customer — the state a queue needs so it can be told apart
  // from a ticket nobody has looked at.
  {
    category: "damaged",
    pick: (o) =>
      o.status === "completed" &&
      o.fulfillment === "delivery" &&
      o.lifecycle.refund === "none",
    ageMin: 240,
    message: "The soup had leaked all over the bag and half of it was gone.",
    agentReply: {
      body: "That shouldn't happen — could you send a photo of the packaging? It helps us take it up with the restaurant.",
      afterMin: 35,
      name: AGENT_TWO,
    },
    awaitingCustomer: true,
  },
  // Decided in the customer's favour, with money attached.
  {
    category: "wrong-item",
    // The order that already carries a settled refund, so the ticket's resolution
    // and the money on the order are the same fact rather than two claims.
    pick: (o) => o.payment.method === "wallet" && o.lifecycle.refund === "refunded",
    ageMin: 60 * 30,
    message: "I ordered the chicken and got the beef. I don't eat beef.",
    agentReply: {
      body: "That's our mistake and I'm sorry. I've refunded the order in full to your FoodOra wallet — it's there now.",
      afterMin: 18,
      name: AGENT,
    },
    outcome: {
      kind: "resolved-refund",
      note: "Wrong dish sent. Refunded in full to the wallet.",
      afterMin: 20,
      by: AGENT,
    },
  },
  // Refused, with a reason — the path that proves a decision is a decision.
  {
    category: "payment-issue",
    pick: (o) => o.payment.method === "card" && o.lifecycle.refund === "rejected",
    ageMin: 60 * 52,
    message: "I think I was charged twice for this order.",
    agentReply: {
      body: "I've checked the order and there's a single charge against it — the second line you can see is the pre-authorisation dropping off, which usually clears within two working days.",
      afterMin: 40,
      name: AGENT_TWO,
    },
    outcome: {
      kind: "refused",
      note: "One charge only; the second entry is an expiring pre-authorisation. Nothing owed.",
      afterMin: 45,
      by: AGENT_TWO,
    },
  },
];

/**
 * Build the seeded queue. Pure and deterministic given `orders` and `now`; an
 * order matched by two specs is only used once, so no order carries two demo
 * conversations.
 */
export function buildDemoTickets(orders: Order[], now: number): SupportTicket[] {
  const used = new Set<string>();
  const tickets: SupportTicket[] = [];

  for (const spec of SPECS) {
    const order = orders.find((o) => !used.has(o.id) && !o.deletedAt && spec.pick(o));
    if (!order) continue;
    used.add(order.id);

    const openedAt = now - spec.ageMin * MIN;
    let ticket = createTicket(
      {
        order,
        category: spec.category,
        message: spec.message,
        reportedBy: order.contact.name,
      },
      openedAt,
    );

    if (spec.agentReply) {
      const at = openedAt + spec.agentReply.afterMin * MIN;
      // A reply means somebody picked it up, so the pickup is recorded first —
      // the log has to make sense read top to bottom.
      ticket = moveTicket(
        ticket,
        "in-review",
        { author: "agent", authorName: spec.agentReply.name },
        at - MIN,
      ).ticket;
      ticket = addMessage(
        ticket,
        { author: "agent", authorName: spec.agentReply.name, body: spec.agentReply.body },
        at,
      );
    }

    if (spec.internalNote) {
      ticket = appendEvent(
        ticket,
        {
          kind: "note",
          author: "agent",
          authorName: spec.internalNote.name,
          body: spec.internalNote.body,
          visibility: "internal",
        },
        openedAt + spec.internalNote.afterMin * MIN,
      );
    }

    if (spec.awaitingCustomer) {
      ticket = moveTicket(
        ticket,
        "awaiting-customer",
        { author: "agent", authorName: spec.agentReply?.name ?? AGENT },
        openedAt + ((spec.agentReply?.afterMin ?? 10) + 1) * MIN,
      ).ticket;
    }

    if (spec.outcome) {
      const at = openedAt + spec.outcome.afterMin * MIN;
      ticket = resolveTicket(
        ticket,
        {
          outcome:
            spec.outcome.kind === "refused"
              ? "refused"
              : spec.outcome.kind === "resolved-refund"
                ? "refunded"
                : "explained",
          note: spec.outcome.note,
          // The amount is the order's, because the seeded order carries the
          // matching refund record — see `demo-orders`.
          refundAmount:
            spec.outcome.kind === "resolved-refund" ? order.pricing.total : 0,
          by: spec.outcome.by,
        },
        at,
      ).ticket;
    }

    tickets.push(ticket);
  }

  return tickets;
}
