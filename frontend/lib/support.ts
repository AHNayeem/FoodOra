import type {
  Order,
  SupportAuthor,
  SupportCategory,
  SupportEvent,
  SupportOutcome,
  SupportResolution,
  SupportTicket,
  SupportTicketStatus,
} from "@/types";

/**
 * support.ts — the dispute domain (Phase 5, G25/G26).
 *
 * Built to the same rules as `lib/order-machine`, for the same reason: a ticket is
 * a small lifecycle, and the moment two surfaces each decide what "closed" means
 * they will disagree. So there is one graph, one set of constructors, and every
 * mutation is a pure function of a ticket and an input.
 *
 * Pure and clock-injected — no store, no mock data, no `Date.now()` unless a
 * caller declines to pass one. `stores/support` commits what these return and
 * emits the notifications, exactly as `stores/orders` does for the order machine.
 */

/** The spec's categories, in the order the customer's form lists them. */
export const SUPPORT_CATEGORIES: readonly SupportCategory[] = [
  "missing-item",
  "wrong-item",
  "damaged",
  "late-delivery",
  "payment-issue",
  "restaurant-issue",
  "rider-issue",
  "other",
];

/**
 * Legal successors of each ticket status.
 *
 * A decision (`resolved` / `rejected`) can be reached from any live state, because
 * a desk can settle a ticket the moment it reads it. `closed` follows a decision —
 * filing is not deciding — and everything, decided or filed, can be reopened,
 * because "you closed it and it happened again" is the single commonest thing a
 * support queue has to handle.
 */
export const TICKET_TRANSITIONS: Record<
  SupportTicketStatus,
  readonly SupportTicketStatus[]
> = {
  open: ["in-review", "resolved", "rejected"],
  "in-review": ["awaiting-customer", "resolved", "rejected"],
  "awaiting-customer": ["in-review", "resolved", "rejected"],
  resolved: ["closed", "in-review"],
  rejected: ["closed", "in-review"],
  closed: ["in-review"],
};

/** Statuses that mean the desk still owes somebody something. */
export const LIVE_TICKET_STATUSES: readonly SupportTicketStatus[] = [
  "open",
  "in-review",
  "awaiting-customer",
];

export function canTransitionTicket(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** Still on the desk's plate. */
export function isTicketLive(status: SupportTicketStatus): boolean {
  return LIVE_TICKET_STATUSES.includes(status);
}

/** Decided, either way. */
export function isTicketDecided(status: SupportTicketStatus): boolean {
  return status === "resolved" || status === "rejected";
}

export type TicketError = "errors.ticketNotFound" | "errors.illegalTicketMove";

/** Human-facing reference, in the same shape as an order's. */
export function ticketNumberFrom(ms: number): string {
  return `SUP-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/** Deterministic event id — stable across a re-render, unique per ticket+time. */
function eventId(ticketId: string, kind: string, ms: number): string {
  return `sev_${ticketId}_${kind}_${ms.toString(36)}`;
}

/** One log entry, with every field filled so no caller can forget one. */
function buildEvent(
  ticketId: string,
  input: {
    kind: SupportEvent["kind"];
    author: SupportAuthor;
    authorName: string;
    body?: string | null;
    status?: SupportTicketStatus | null;
    refund?: SupportEvent["refund"];
    visibility?: SupportEvent["visibility"];
  },
  now: number,
): SupportEvent {
  return {
    id: eventId(ticketId, input.kind, now),
    kind: input.kind,
    author: input.author,
    authorName: input.authorName,
    body: input.body ?? null,
    status: input.status ?? null,
    refund: input.refund ?? null,
    // An internal note is the one thing that defaults closed: getting this
    // backwards shows an agent's private note to the customer.
    visibility: input.visibility ?? (input.kind === "note" ? "internal" : "customer"),
    at: new Date(now).toISOString(),
  };
}

export interface CreateTicketInput {
  order: Order;
  category: SupportCategory;
  /** What the customer wrote. Prose, so it is stored as prose. */
  message: string;
  /** Who is reporting it — the account name, for the log's attribution. */
  reportedBy: string;
}

/**
 * A new ticket, already carrying the customer's first message.
 *
 * The order's identity is snapshotted rather than referenced-only, so a queue row
 * reads without a join and a report stays truthful about an order that has since
 * been removed. The id is derived from the order and the instant, so the same
 * report submitted twice by a double-tap is the same ticket.
 */
export function createTicket(input: CreateTicketInput, now = Date.now()): SupportTicket {
  const { order } = input;
  const iso = new Date(now).toISOString();
  const id = `sup_${order.id}_${Math.floor(now / 1000).toString(36)}`;

  return {
    id,
    ticketNumber: ticketNumberFrom(now),
    orderId: order.id,
    orderNumber: order.orderNumber,
    vendorId: order.vendor.id,
    vendorName: order.vendor.name,
    customerName: order.contact.name,
    customerPhone: order.contact.phone,
    category: input.category,
    status: "open",
    currency: order.pricing.currency,
    orderTotal: order.pricing.total,
    events: [
      buildEvent(
        id,
        {
          kind: "message",
          author: "customer",
          authorName: input.reportedBy || order.contact.name,
          body: input.message,
        },
        now,
      ),
    ],
    resolution: null,
    submittedAt: iso,
    closedAt: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/** Append an event. Pure; the ticket's status is untouched. */
export function appendEvent(
  ticket: SupportTicket,
  input: Parameters<typeof buildEvent>[1],
  now = Date.now(),
): SupportTicket {
  const event = buildEvent(ticket.id, input, now);
  return {
    ...ticket,
    events: [...ticket.events, event],
    updatedAt: event.at,
  };
}

/**
 * Somebody replied.
 *
 * A customer reply pulls a waiting ticket back onto the desk, because that is what
 * "awaiting customer" was waiting for — leaving it parked would hide the answer it
 * asked for. An agent's reply does not move the status: the agent decides where
 * the ticket goes, and guessing on their behalf would fight them.
 */
export function addMessage(
  ticket: SupportTicket,
  input: {
    author: SupportAuthor;
    authorName: string;
    body: string;
    visibility?: SupportEvent["visibility"];
  },
  now = Date.now(),
): SupportTicket {
  const withMessage = appendEvent(
    ticket,
    {
      kind: input.visibility === "internal" ? "note" : "message",
      author: input.author,
      authorName: input.authorName,
      body: input.body,
      visibility: input.visibility,
    },
    now,
  );
  if (input.author === "customer" && ticket.status === "awaiting-customer") {
    return moveTicket(
      withMessage,
      "in-review",
      { author: "system", authorName: input.authorName },
      now,
    ).ticket;
  }
  return withMessage;
}

/**
 * Move a ticket. Refuses an illegal move rather than performing it, and records
 * the move in the log so "who closed this and when" always has an answer.
 */
export function moveTicket(
  ticket: SupportTicket,
  to: SupportTicketStatus,
  by: { author: SupportAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): { ticket: SupportTicket; error: TicketError | null } {
  if (!canTransitionTicket(ticket.status, to)) {
    return { ticket, error: "errors.illegalTicketMove" };
  }
  const iso = new Date(now).toISOString();
  const moved = appendEvent(
    ticket,
    {
      kind: "status",
      author: by.author,
      authorName: by.authorName,
      body: by.note ?? null,
      status: to,
    },
    now,
  );
  return {
    ticket: {
      ...moved,
      status: to,
      // Reopening clears the closure; nothing else touches it, so a resolved
      // ticket that is filed keeps the date it was filed on.
      closedAt: to === "closed" ? iso : to === "in-review" ? null : moved.closedAt,
    },
    error: null,
  };
}

export interface ResolveTicketInput {
  outcome: SupportOutcome;
  /** What the customer is told. Required — a resolution with no sentence is not one. */
  note: string;
  /** Refund granted alongside it, in the ticket currency. */
  refundAmount?: number;
  /** The agent account deciding. */
  by: string;
}

/**
 * Decide a ticket.
 *
 * `refused` lands on `rejected` and everything else on `resolved`, so the status
 * follows the outcome rather than being chosen twice. The refund *amount* is
 * recorded here because it is part of what the customer was told; the money itself
 * moves on the order (`stores/orders.decideRefund`), which is the only place it
 * can move without two records of the same payment.
 */
export function resolveTicket(
  ticket: SupportTicket,
  input: ResolveTicketInput,
  now = Date.now(),
): { ticket: SupportTicket; error: TicketError | null } {
  const to: SupportTicketStatus = input.outcome === "refused" ? "rejected" : "resolved";
  const iso = new Date(now).toISOString();
  const resolution: SupportResolution = {
    outcome: input.outcome,
    note: input.note,
    refundAmount: input.refundAmount ?? 0,
    at: iso,
    by: input.by,
  };

  const moved = moveTicket(
    ticket,
    to,
    { author: "agent", authorName: input.by, note: input.note },
    now,
  );
  if (moved.error) return moved;
  return { ticket: { ...moved.ticket, resolution }, error: null };
}

/** Put a decided or filed ticket back on the desk. */
export function reopenTicket(
  ticket: SupportTicket,
  by: { author: SupportAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): { ticket: SupportTicket; error: TicketError | null } {
  const moved = moveTicket(ticket, "in-review", by, now);
  if (moved.error) return moved;
  // The old resolution stays in the log as the event that recorded it; clearing
  // the field is what makes the ticket honestly undecided again.
  return { ticket: { ...moved.ticket, resolution: null }, error: null };
}

/**
 * The log as the customer may see it. The single place internal notes are
 * filtered, so a customer-facing surface cannot leak one by forgetting a check.
 */
export function customerEvents(ticket: SupportTicket): SupportEvent[] {
  return ticket.events.filter((event) => event.visibility === "customer");
}

/** The last thing that happened — what a queue row shows as "updated". */
export function lastTicketEvent(ticket: SupportTicket): SupportEvent | null {
  return ticket.events[ticket.events.length - 1] ?? null;
}

/** Has anybody from the desk replied to the customer yet? */
export function hasAgentReply(ticket: SupportTicket): boolean {
  return ticket.events.some(
    (event) => event.author === "agent" && event.visibility === "customer",
  );
}

/**
 * A sensible starting figure for a refund on this ticket: the whole order.
 *
 * Deliberately not a per-category fraction. A missing side dish is worth less than
 * the dinner, but *how much* less is a fact about the basket that nothing here
 * knows — inventing a percentage would put a number in front of an agent that
 * looks calculated and is not. The agent types the amount; this is only where the
 * field starts.
 */
export function suggestedRefundAmount(order: Order): number {
  return order.pricing.total;
}
