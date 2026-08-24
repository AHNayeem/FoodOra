import type { BaseEntity, ISODate } from "./common";

/**
 * customer.ts — the people who order, as a record the platform can manage
 * (Phase 11, G15).
 *
 * Before this the prototype had *accounts* (`types/user`) and it had *orders*,
 * and nothing in between: a support call about "the Banani customer" could be
 * answered only by searching the order list, and there was no place at all to
 * record that somebody had been stopped from ordering. `/admin/customers` needed
 * a subject, and this is it.
 *
 * Two decisions worth knowing before reading further.
 *
 * **The phone is the identity.** An `Order` carries `contact.phone` and a
 * `SupportTicket` carries `customerPhone`; neither carries an account id, because
 * checkout is open to guests and always has been. Rather than invent a
 * `customerId` on the order — which would mean a wire-format change, a store
 * migration and a lie for every order already placed — the directory joins on the
 * normalised phone, and `Customer.id` is *derived* from it (`lib/customers`). The
 * join key is therefore a fact about the data rather than a new column, and it
 * keeps working for a guest who never signs up. `userId` links the row to an
 * account where one exists.
 *
 * **Only what a person decided is stored.** Everything countable — spend, order
 * counts, disputes, favourite restaurant — is derived from the shared order and
 * ticket stores at read time and lives in {@link CustomerStats}, never on this
 * record. A persisted `lifetimeSpend` would be a second opinion about money, and
 * §5.4 of the spec exists because those always drift. What *is* persisted is the
 * part no one can recompute: the profile, the account status, and the log of who
 * changed it and why.
 */

/**
 * Whether this person may order.
 *
 * Two states, not five. A customer is not "suspended pending review" in the way a
 * vendor is — nobody is holding their paperwork — so the vocabulary a restaurant
 * needs would be theatre here. Everything else about why they are blocked lives in
 * {@link CustomerBlockReason} and the moderation log.
 */
export type CustomerAccountStatus = "active" | "blocked";

/**
 * Why an account was stopped. A closed list rather than free text, because the
 * reason is the thing an appeal argues with and a report counts — the prose goes
 * in the moderation note beside it.
 */
export type CustomerBlockReason =
  /** Stolen card, failed authorisations, payment taken back. */
  | "payment-fraud"
  /** Repeated "it never arrived" on orders that did. */
  | "refund-abuse"
  /** Orders placed with no intention of paying for or receiving them. */
  | "fake-orders"
  /** Abuse aimed at riders or restaurant staff. */
  | "abusive-behaviour"
  /** Money reversed by the bank rather than by us. */
  | "chargeback"
  /** They asked us to close it. */
  | "customer-request"
  | "other";

/** What a moderator did. `note` changes nothing and is kept for the same reason. */
export type CustomerModerationAction = "block" | "unblock" | "note";

/**
 * One thing a moderator did to an account. Append-only, oldest first — the same
 * contract as an order's event log and a ticket's, and for the same reason: a
 * status can say that somebody is blocked but never who blocked them, when, or on
 * what grounds, which is precisely what is asked for when it is disputed.
 */
export interface CustomerModerationEvent {
  id: string;
  action: CustomerModerationAction;
  /** The grounds (`action: "block"`); null for anything else. */
  reason: CustomerBlockReason | null;
  /** What the moderator wrote. Prose a human typed, so it is not translated. */
  body: string | null;
  /** The admin account that did it. */
  by: string;
  at: ISODate;
}

/**
 * A person the platform knows about.
 *
 * Rows reach the directory two ways and both are real: **seeded/managed** rows
 * come from `lib/mock/customers` and from any moderation this device has done,
 * and **derived** rows are minted at read time for anyone who has ordered without
 * one. A derived row becomes a managed row the moment somebody acts on it — see
 * `stores/customers`.
 */
export interface Customer extends BaseEntity {
  /** `cus_…`, derived from {@link phone} — see `lib/customers.customerIdFor`. */
  id: string;
  name: string;
  /** Normalised phone. The join key onto orders and tickets. */
  phone: string;
  email: string | null;
  /** The signed-in account this person uses; null for a guest. */
  userId: string | null;
  /** Avatar URL, or null to fall back to initials. */
  avatar: string | null;
  /** Home city as the person gave it — *not* where their last order went. */
  city: string | null;
  /** Whether the phone/email has been through verification. */
  isVerified: boolean;
  status: CustomerAccountStatus;
  /** Set together with `status: "blocked"`, cleared on unblock. */
  blockReason: CustomerBlockReason | null;
  blockedAt: ISODate | null;
  blockedBy: string | null;
  /** Signed up, or — for a derived row — first seen ordering. */
  joinedAt: ISODate;
  moderation: CustomerModerationEvent[];
}

/** Where somebody orders from most. Null when they have not ordered at all. */
export interface CustomerVendorTally {
  id: string;
  name: string;
  orders: number;
}

/**
 * Everything countable about a customer, derived from the shared order and ticket
 * stores. Never persisted — see the note on the module.
 *
 * `grossSpend` counts only orders the customer was actually charged for
 * (`payment.status` of `paid` or `refunded`), which is the same test the order
 * machine uses when it decides a refund is owed. `netSpend` takes the money that
 * went back off again, so the number under "spending" is what the platform kept.
 */
export interface CustomerStats {
  currency: string;
  /** Every order, including ones still in flight. */
  orders: number;
  /** Still moving. */
  live: number;
  completed: number;
  /** Ended badly, in any of the ways an order can. */
  cancelled: number;
  /** Orders where money actually went back. */
  refundedOrders: number;
  cashOrders: number;
  grossSpend: number;
  refunded: number;
  netSpend: number;
  /** `grossSpend` over the orders that produced it; 0 when there are none. */
  avgOrderValue: number;
  firstOrderAt: ISODate | null;
  lastOrderAt: ISODate | null;
  favouriteVendor: CustomerVendorTally | null;
  /** Where the most recent delivery went — a fact about orders, not the profile. */
  lastArea: string | null;
  tickets: number;
  /** Disputes still on the desk. */
  openTickets: number;
  ratedOrders: number;
  /** Mean of the ratings they left, or null if they have never rated. */
  avgRating: number | null;
}

/** A directory row: the managed record plus everything derived beside it. */
export interface CustomerRecord {
  customer: Customer;
  stats: CustomerStats;
}
