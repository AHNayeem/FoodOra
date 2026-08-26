import type { ISODate } from "./common";
import type { UserRole } from "./user";

/**
 * audit.ts — the platform's record of who changed what (Phase 15, G32).
 *
 * The prototype already had *an* audit trail: `CmsAuditEntry` records nine
 * actions on nine content collections, and nothing else in the system recorded
 * anything. So an order could be forced to `delivered`, a restaurant admitted, a
 * refund approved and a payout run, and the only trace was the entity's own
 * status field — which says what happened but never who did it. That is what G32
 * filed and what this file's shape is for.
 *
 * §6's Phase 15 names the record's fields directly: actor, action, entity,
 * entityId, timestamp, metadata, description. All seven are here. The one rename
 * is `timestamp` → **`at`**, and it is deliberate: `CmsAuditEntry.at` has held
 * that meaning since C26, `CmsRevision.at` beside it, and "keep existing CMS
 * audit compatibility" is easier to honour when the two records agree on the name
 * of the same field than when an adapter has to rename it. Every other date in
 * the codebase is an `ISODate` string called `at`, `placedAt`, `settledAt`; a
 * lone `timestamp` would be the odd one out.
 */

/**
 * What happened.
 *
 * One slug per kind of mutation, in `entity.verb` form. §6 lists ten important
 * mutations and these are those ten, split where a single slug would have made
 * the log unreadable: "payout action" is three different acts (a transfer, a run
 * of transfers, a correction) and a reader scanning for a correction should not
 * have to open the metadata of every transfer to find one.
 *
 * `content.changed` is the eleventh and is not a new mutation — it is the CMS
 * trail's nine actions folded into this vocabulary by `lib/audit.fromCmsAudit`,
 * so the platform log can show content edits without the CMS store changing
 * shape or losing its own richer record.
 */
export type AuditAction =
  /** An admin moved an order through the machine — §6's "order intervention". */
  | "order.intervened"
  /** A courier was put on a job, or taken off one and replaced. */
  | "order.rider-assigned"
  | "order.rider-reassigned"
  /** The desk's ruling on a refund, and the moment the money actually moved. */
  | "refund.decided"
  | "refund.settled"
  /** A restaurant application approved, rejected, suspended or reactivated. */
  | "restaurant.decided"
  /** The same for a courier. */
  | "rider.decided"
  /** One transfer, a whole run of them, and a manual correction to a period. */
  | "payout.paid"
  | "payout.run"
  | "payout.adjusted"
  /** Platform campaigns. */
  | "coupon.created"
  | "coupon.paused"
  | "coupon.resumed"
  | "coupon.ended"
  /** An account stopped from ordering, and let back in. */
  | "customer.blocked"
  | "customer.unblocked"
  /**
   * Configuration changed — a restaurant's own, or the platform's (Phase 19,
   * G30). Which is which is on the entry's `entity`, not on a second action:
   * `vendor` for a restaurant, `region` / `delivery-zone` / `platform` for the
   * platform. One slug, because the question an auditor asks is "who changed
   * configuration" and the record kind is the answer to "whose".
   */
  | "settings.changed"
  /** Somebody's rights changed — §6's "permission changes". */
  | "permission.changed"
  /** The CMS trail, folded in. See `lib/audit.fromCmsAudit`. */
  | "content.changed";

/**
 * What the action was done to.
 *
 * Deliberately the *record kind*, not the screen. `vendor-application` rather
 * than "restaurant", because an approval is a ruling on an application and the
 * listing it mints is a consequence — and an audit trail that named the
 * consequence would be unable to explain a rejection, which mints nothing.
 */
export type AuditEntityKind =
  | "order"
  | "vendor-application"
  | "rider-application"
  | "customer"
  | "settlement"
  | "payout-run"
  | "coupon"
  | "vendor"
  | "staff"
  | "cms-document"
  /**
   * The platform's own configuration (Phase 19, G30). Three kinds rather than
   * one, because they are three records an operator edits separately and an
   * auditor filters separately: a country's trading terms, a delivery zone, and
   * the platform-wide defaults that belong to no single row.
   */
  | "region"
  | "delivery-zone"
  | "platform";

/**
 * Who did it.
 *
 * A snapshot rather than a `userId` to join on, and that is the point of an audit
 * record: the name and the role are what they were **at the time**. A moderator
 * who is later promoted must not retroactively appear to have had a super-admin's
 * rights when they hid a review, which is exactly what a live join would show.
 * The same argument `CmsAuditEntry.title` makes for surviving a rename.
 */
export interface AuditActor {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * A value in an entry's `metadata`.
 *
 * Flat and JSON-primitive on purpose: the log is persisted to `localStorage` and
 * an entry has to survive a round trip through `JSON.stringify` unchanged. Nested
 * objects would also make the filter's free-text search unable to see inside its
 * own data.
 */
export type AuditMetadataValue = string | number | boolean | null;

/** One line of the platform audit trail. */
export interface AuditEntry {
  id: string;
  actor: AuditActor;
  action: AuditAction;
  entity: AuditEntityKind;
  entityId: string;
  /** §6's `timestamp`. Named `at` to match `CmsAuditEntry` — see the header. */
  at: ISODate;
  /** Whatever the action needs to be explicable later. Never a nested object. */
  metadata: Record<string, AuditMetadataValue>;
  /**
   * One sentence, written when the entry is recorded.
   *
   * Not translated, and that is a decision rather than an omission — see
   * `lib/audit.describeAudit`.
   */
  description: string;
}

/** What the audit screen filters by. */
export interface AuditQuery {
  /** Free text over the description, the actor and the entity id. */
  text: string;
  action: AuditAction | null;
  entity: AuditEntityKind | null;
  actorId: string | null;
  /** Inclusive day bounds, `YYYY-MM-DD`, or null for "as far back as it goes". */
  from: string | null;
  to: string | null;
}
