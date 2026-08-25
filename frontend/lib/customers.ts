import type {
  Customer,
  CustomerBlockReason,
  CustomerModerationAction,
  CustomerModerationEvent,
  CustomerRecord,
  CustomerStats,
  CustomerVendorTally,
  Order,
  SupportTicket,
} from "@/types";
import { isFailure, isTerminal } from "./order-machine";
import { isTicketLive } from "./support";

/**
 * customers.ts — the customer directory, as a function of what already exists
 * (Phase 11, G15).
 *
 * Pure and clock-injected, like `lib/support`, `lib/settlement` and
 * `lib/onboarding`: no store, no mock data, no `Date.now()` unless a caller
 * declines to pass one. `stores/customers` commits what these return.
 *
 * The shape of this module follows from one decision, made in `types/customer`
 * and worth repeating here because every function below depends on it: **the
 * normalised phone is the identity**. Orders and tickets both carry one, neither
 * carries an account id, and adding one would have meant changing the GraphQL
 * order wire format and migrating every persisted order to backfill a value that
 * was never collected. So `customerIdFor` derives a stable id from the phone, and
 * a person's orders are the orders whose contact phone matches. That is a join, not
 * a copy — there is still exactly one order record and exactly one ticket record,
 * which is what §5.2 of the spec is protecting.
 *
 * Everything countable is derived here rather than stored, so the admin's
 * spending summary and the platform's own books cannot disagree (§5.4).
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The comparable form of a phone number.
 *
 * Digits only, with a leading `+` kept where there is one, because that is the
 * part of the formatting that carries meaning. Everything a person might type
 * around it — spaces, dashes, brackets — is noise that would otherwise split one
 * customer into two rows.
 */
export function normalisePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Deterministic id for a phone number.
 *
 * Deterministic on purpose: the same person gets the same id on every device and
 * across every reload, so a moderation record laid down against a derived row
 * still finds its customer after a refresh. A hash rather than the number itself
 * because an id ends up in a URL, and a URL is not the place for somebody's phone
 * number.
 */
export function customerIdFor(phone: string): string {
  const key = normalisePhone(phone);
  if (!key) return "cus_unknown";
  // FNV-1a, 32-bit — the same cheap stable hash `lib/mock/rng` uses for seeds.
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `cus_${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

/** Initials for an avatar fallback — first and last word, at most two letters. */
export function customerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

// ---------------------------------------------------------------------------
// Account status
// ---------------------------------------------------------------------------

/** The grounds a block can be given, in the order the dialog offers them. */
export const CUSTOMER_BLOCK_REASONS: readonly CustomerBlockReason[] = [
  "payment-fraud",
  "refund-abuse",
  "fake-orders",
  "abusive-behaviour",
  "chargeback",
  "customer-request",
  "other",
];

/** Shortest moderation note that says anything. Enforced here, not in the UI. */
export const MIN_MODERATION_NOTE = 8;

export function isCustomerBlocked(customer: Customer): boolean {
  return customer.status === "blocked";
}

/**
 * Errors these functions refuse with. i18n keys, like every other refusal in the
 * domain, so a caller shows the message rather than composing one.
 */
export type CustomerError =
  | "errors.customerNotFound"
  | "errors.alreadyBlocked"
  | "errors.notBlocked"
  | "errors.blockReasonRequired"
  | "errors.moderationNoteRequired"
  /** The signed-in account does not hold `customers.manage` (Phase 14, G31). */
  | "errors.notPermitted";

/** Deterministic event id — stable across a re-render, unique per record+time. */
function moderationEventId(
  customerId: string,
  action: CustomerModerationAction,
  ms: number,
): string {
  return `cmo_${customerId}_${action}_${ms.toString(36)}`;
}

function moderationEvent(
  customer: Customer,
  input: {
    action: CustomerModerationAction;
    reason?: CustomerBlockReason | null;
    body?: string | null;
    by: string;
  },
  now: number,
): CustomerModerationEvent {
  return {
    id: moderationEventId(customer.id, input.action, now),
    action: input.action,
    reason: input.reason ?? null,
    body: input.body ?? null,
    by: input.by,
    at: new Date(now).toISOString(),
  };
}

/** Commit one moderation event and stamp the record. */
function withModeration(
  customer: Customer,
  event: CustomerModerationEvent,
  patch: Partial<Customer>,
): Customer {
  return {
    ...customer,
    ...patch,
    updatedAt: event.at,
    moderation: [...customer.moderation, event],
  };
}

export interface BlockCustomerInput {
  reason: CustomerBlockReason;
  /** What the moderator wrote. At least {@link MIN_MODERATION_NOTE} characters. */
  note: string;
  /** The admin account doing it. */
  by: string;
}

/**
 * Stop somebody ordering.
 *
 * Both guards matter. Refusing a second block keeps the log honest — two "blocked"
 * entries would suggest they were let back in between, which is the one thing an
 * appeal turns on. Requiring a written reason on top of the category is the same
 * rule vendor suspension follows (`lib/vendor-onboarding`): the category is what
 * gets counted, the sentence is what the person is owed.
 */
export function blockCustomer(
  customer: Customer,
  input: BlockCustomerInput,
  now = Date.now(),
): { customer: Customer; error: CustomerError | null } {
  if (customer.status === "blocked") {
    return { customer, error: "errors.alreadyBlocked" };
  }
  if (!input.reason) {
    return { customer, error: "errors.blockReasonRequired" };
  }
  const note = input.note.trim();
  if (note.length < MIN_MODERATION_NOTE) {
    return { customer, error: "errors.moderationNoteRequired" };
  }
  const event = moderationEvent(
    customer,
    { action: "block", reason: input.reason, body: note, by: input.by },
    now,
  );
  return {
    customer: withModeration(customer, event, {
      status: "blocked",
      blockReason: input.reason,
      blockedAt: event.at,
      blockedBy: input.by,
    }),
    error: null,
  };
}

/**
 * Let them order again.
 *
 * The block fields are cleared rather than kept "for reference": the record of
 * what happened is the moderation log, and leaving `blockedAt` set on an active
 * account gives two places to read the status from. A note is optional here — a
 * reinstatement usually needs no argument, and demanding prose for it would only
 * teach moderators to type a full stop.
 */
export function unblockCustomer(
  customer: Customer,
  input: { note?: string | null; by: string },
  now = Date.now(),
): { customer: Customer; error: CustomerError | null } {
  if (customer.status !== "blocked") {
    return { customer, error: "errors.notBlocked" };
  }
  const body = input.note?.trim() || null;
  const event = moderationEvent(customer, { action: "unblock", body, by: input.by }, now);
  return {
    customer: withModeration(customer, event, {
      status: "active",
      blockReason: null,
      blockedAt: null,
      blockedBy: null,
    }),
    error: null,
  };
}

/**
 * Write something down without changing anything.
 *
 * The reason this exists is that most of what a desk knows about a difficult
 * account never justifies a block — "third late complaint, watching it" — and if
 * there is nowhere to put it, it ends up in a chat message nobody can find when the
 * block is finally argued about.
 */
export function noteCustomer(
  customer: Customer,
  input: { body: string; by: string },
  now = Date.now(),
): { customer: Customer; error: CustomerError | null } {
  const body = input.body.trim();
  if (body.length < MIN_MODERATION_NOTE) {
    return { customer, error: "errors.moderationNoteRequired" };
  }
  const event = moderationEvent(customer, { action: "note", body, by: input.by }, now);
  return { customer: withModeration(customer, event, {}), error: null };
}

// ---------------------------------------------------------------------------
// The join onto the shared records
// ---------------------------------------------------------------------------

/** Every order this person placed, newest first. */
export function ordersForCustomer(orders: Order[], phone: string): Order[] {
  const key = normalisePhone(phone);
  if (!key) return [];
  return orders
    .filter((o) => !o.deletedAt && normalisePhone(o.contact.phone) === key)
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}

/** Every dispute this person raised, newest first. */
export function ticketsForCustomer(
  tickets: SupportTicket[],
  phone: string,
): SupportTicket[] {
  const key = normalisePhone(phone);
  if (!key) return [];
  return tickets
    .filter((t) => !t.deletedAt && normalisePhone(t.customerPhone) === key)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

/** Was the customer actually charged for this order? The test the machine uses. */
function wasCharged(order: Order): boolean {
  return order.payment.status === "paid" || order.payment.status === "refunded";
}

/**
 * The spending summary and everything else countable, over one person's orders
 * and tickets. Both lists are expected pre-filtered — `buildDirectory` does the
 * filtering once for the whole set rather than once per customer.
 */
export function customerStats(
  orders: Order[],
  tickets: SupportTicket[],
  fallbackCurrency = "BDT",
): CustomerStats {
  const charged = orders.filter(wasCharged);
  const grossSpend = charged.reduce((sum, o) => sum + o.pricing.total, 0);
  const refunded = orders.reduce(
    (sum, o) => sum + (o.lifecycle.refund === "refunded" ? o.lifecycle.refundAmount : 0),
    0,
  );

  // Favourite restaurant: most orders, and the earliest name wins a tie so the
  // answer does not move when two are level and the list is re-sorted.
  const tally = new Map<string, CustomerVendorTally>();
  for (const order of orders) {
    const seen = tally.get(order.vendor.id);
    if (seen) seen.orders += 1;
    else tally.set(order.vendor.id, { id: order.vendor.id, name: order.vendor.name, orders: 1 });
  }
  let favouriteVendor: CustomerVendorTally | null = null;
  for (const entry of tally.values()) {
    if (!favouriteVendor || entry.orders > favouriteVendor.orders) favouriteVendor = entry;
  }

  const rated = orders.filter((o) => o.lifecycle.rating != null);
  const dates = orders.map((o) => Date.parse(o.placedAt)).sort((a, b) => a - b);

  return {
    currency: orders[0]?.pricing.currency ?? fallbackCurrency,
    orders: orders.length,
    live: orders.filter((o) => !isTerminal(o.status) && o.status !== "delivered").length,
    completed: orders.filter((o) => o.status === "completed").length,
    cancelled: orders.filter((o) => isFailure(o.status)).length,
    refundedOrders: orders.filter((o) => o.lifecycle.refund === "refunded").length,
    cashOrders: orders.filter((o) => o.payment.method === "cash").length,
    grossSpend,
    refunded,
    netSpend: Math.max(0, grossSpend - refunded),
    avgOrderValue: charged.length ? grossSpend / charged.length : 0,
    firstOrderAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastOrderAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    favouriteVendor,
    // Orders are newest-first, so the first one carrying an address is the last
    // place we delivered to.
    lastArea: orders.find((o) => o.address)?.address?.area ?? null,
    tickets: tickets.length,
    openTickets: tickets.filter((t) => isTicketLive(t.status)).length,
    ratedOrders: rated.length,
    avgRating: rated.length
      ? rated.reduce((sum, o) => sum + (o.lifecycle.rating ?? 0), 0) / rated.length
      : null,
  };
}

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

/**
 * Mint a row for somebody who has ordered but has no managed record.
 *
 * This is what keeps the directory honest under demonstration: a reviewer who
 * checks out with a phone number nobody has seen before appears in `/admin/customers`
 * on the next render, because the list is *derived from the orders* rather than
 * from a table somebody has to remember to write to. `isVerified` is false because
 * nothing verified them, and `joinedAt` is the first order because that is when
 * the platform first knew about them.
 */
function deriveCustomer(orders: Order[], tickets: SupportTicket[]): Customer {
  // Orders are newest-first: the most recent name and email are the current ones.
  const newest = orders[0];
  const oldest = orders[orders.length - 1];
  const phone = normalisePhone(newest?.contact.phone ?? tickets[0]?.customerPhone ?? "");
  const name = newest?.contact.name ?? tickets[0]?.customerName ?? phone;
  const joinedAt = oldest?.placedAt ?? tickets[tickets.length - 1]?.submittedAt ?? "";
  return {
    id: customerIdFor(phone),
    name,
    phone,
    email: null,
    userId: null,
    avatar: null,
    city: newest?.address?.city ?? null,
    isVerified: false,
    status: "active",
    blockReason: null,
    blockedAt: null,
    blockedBy: null,
    joinedAt,
    moderation: [],
    createdAt: joinedAt,
    updatedAt: newest?.updatedAt ?? joinedAt,
    deletedAt: null,
  };
}

/**
 * Everyone the platform knows about, with their numbers beside them.
 *
 * The union of two sets: the managed accounts (seeded, or created the moment a
 * moderator acted on somebody) and everybody who has ordered or complained.
 * Managed rows win on the profile — a moderator's block must not be overwritten
 * by an order arriving — but a managed row's *name* is refreshed from the latest
 * order, because a person who corrects their name at checkout has corrected it.
 *
 * Sorted by most recent activity, then by name for anyone with none, so the list
 * opens on whoever the desk is most likely to be asked about.
 */
export function buildDirectory(
  accounts: Customer[],
  orders: Order[],
  tickets: SupportTicket[],
): CustomerRecord[] {
  const ordersByPhone = new Map<string, Order[]>();
  for (const order of orders) {
    if (order.deletedAt) continue;
    const key = normalisePhone(order.contact.phone);
    if (!key) continue;
    const bucket = ordersByPhone.get(key);
    if (bucket) bucket.push(order);
    else ordersByPhone.set(key, [order]);
  }
  for (const bucket of ordersByPhone.values()) {
    bucket.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
  }

  const ticketsByPhone = new Map<string, SupportTicket[]>();
  for (const ticket of tickets) {
    if (ticket.deletedAt) continue;
    const key = normalisePhone(ticket.customerPhone);
    if (!key) continue;
    const bucket = ticketsByPhone.get(key);
    if (bucket) bucket.push(ticket);
    else ticketsByPhone.set(key, [ticket]);
  }
  for (const bucket of ticketsByPhone.values()) {
    bucket.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  }

  const managed = new Map<string, Customer>();
  for (const account of accounts) {
    if (account.deletedAt) continue;
    managed.set(normalisePhone(account.phone), account);
  }

  const phones = new Set<string>([
    ...managed.keys(),
    ...ordersByPhone.keys(),
    ...ticketsByPhone.keys(),
  ]);

  const records: CustomerRecord[] = [];
  for (const phone of phones) {
    if (!phone) continue;
    const own = ordersByPhone.get(phone) ?? [];
    const raised = ticketsByPhone.get(phone) ?? [];
    const account = managed.get(phone);
    const customer = account
      ? { ...account, name: own[0]?.contact.name ?? account.name }
      : deriveCustomer(own, raised);
    records.push({ customer, stats: customerStats(own, raised) });
  }

  return records.sort((a, b) => {
    const at = a.stats.lastOrderAt ? Date.parse(a.stats.lastOrderAt) : 0;
    const bt = b.stats.lastOrderAt ? Date.parse(b.stats.lastOrderAt) : 0;
    if (at !== bt) return bt - at;
    return a.customer.name.localeCompare(b.customer.name);
  });
}

/** One row out of the directory, by id. */
export function findCustomerRecord(
  records: CustomerRecord[],
  id: string,
): CustomerRecord | null {
  return records.find((r) => r.customer.id === id) ?? null;
}
