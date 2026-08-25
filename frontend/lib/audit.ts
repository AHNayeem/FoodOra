import type {
  AuditAction,
  AuditActor,
  AuditEntityKind,
  AuditEntry,
  AuditMetadataValue,
  AuditQuery,
  CmsAuditEntry,
  User,
} from "@/types";

/**
 * audit.ts — writing and reading the platform trail (Phase 15, G32).
 *
 * Pure, like every other `lib/` module: no clock read here (the caller passes
 * `now`), no storage, no store import, no `next-intl`. `stores/audit` commits what
 * these functions return and every mutation site asks through it.
 *
 * Four decisions worth stating, because each is the kind a plausible-looking
 * audit log gets wrong:
 *
 *  - **The actor is snapshotted, not referenced.** `actorFrom` copies the name and
 *    the role off the session. An audit trail that joined to the live account
 *    would rewrite history every time somebody was promoted or renamed — the
 *    entry for a refund approved by a support agent would later read as approved
 *    by whatever that person became.
 *  - **The description is written once, in one language.** Every other piece of
 *    text in this app is an i18n key resolved at render, and this one is not. An
 *    audit line is a record of a fact, and a record whose words change with the
 *    reader's locale setting is not a record — it is a rendering. The precedent is
 *    already in the codebase: C25's broadcast copy is "written once, sent as
 *    written" for the same reason. The `action` slug beside it *is* translated on
 *    screen, so the log is still navigable in Bengali or Arabic; the sentence
 *    explaining what happened is the evidence and stays as typed.
 *  - **Ids are deterministic.** `auditId` is derived from the action, the entity
 *    and the instant, exactly as every other id in this prototype is, so a
 *    replayed mutation — a second tab, a rehydrate, the demo autopilot — appends
 *    one entry rather than two. `dedupe` is the reader-side half of the same
 *    guarantee.
 *  - **The CMS trail is adapted, not migrated.** `fromCmsAudit` reads
 *    `CmsAuditEntry` into this shape at *read* time. `stores/cms` keeps its own
 *    richer record (the collection, the document title at the time, its own nine
 *    actions) and nothing about C26 changes — which is what §6's "keep existing
 *    CMS audit compatibility" asks for. Copying content edits into a second store
 *    on write would have been the version of this that drifts.
 */

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * Every action, grouped by what it is about and in the order the filter reads
 * them. Grouping rather than alphabetical for the reason `PLATFORM_PERMISSIONS`
 * is grouped: it is how a person scans a list of twenty slugs.
 */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "order.intervened",
  "order.rider-assigned",
  "order.rider-reassigned",
  "refund.decided",
  "refund.settled",
  "restaurant.decided",
  "rider.decided",
  "payout.paid",
  "payout.run",
  "payout.adjusted",
  "coupon.created",
  "coupon.paused",
  "coupon.resumed",
  "coupon.ended",
  "customer.blocked",
  "customer.unblocked",
  "settings.changed",
  "permission.changed",
  "content.changed",
];

/** Entity kinds, in the order the filter reads them. */
export const AUDIT_ENTITIES: readonly AuditEntityKind[] = [
  "order",
  "vendor-application",
  "rider-application",
  "customer",
  "settlement",
  "payout-run",
  "coupon",
  "vendor",
  "staff",
  "cms-document",
];

/**
 * Actions that are destructive or irreversible, flagged on screen.
 *
 * Not a severity scale — a scale invites arguing about the middle. These are the
 * entries somebody auditing an incident looks for first: money that left, a
 * partner shut off, an account stopped, somebody's rights changed.
 */
export const AUDIT_HIGH_IMPACT: readonly AuditAction[] = [
  "refund.decided",
  "refund.settled",
  "payout.paid",
  "payout.run",
  "payout.adjusted",
  "customer.blocked",
  "permission.changed",
  "restaurant.decided",
  "rider.decided",
];

/** How many entries a device keeps. The CMS trail caps itself the same way. */
export const MAX_AUDIT_ENTRIES = 400;

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The actor, off the session.
 *
 * A signed-out mutation is possible in this prototype — the demo autopilot moves
 * orders with nobody signed in — and it is recorded as `system` rather than
 * dropped. An audit trail with holes in it where nobody was watching is worse
 * than one that admits a machine did something.
 */
export function actorFrom(user: User | null | undefined): AuditActor {
  if (!user) return { id: "system", name: "System", role: "guest" };
  return { id: user.id, name: user.name, role: user.role };
}

/** Deterministic, so a replayed mutation appends one entry and not two. */
export function auditId(action: AuditAction, entityId: string, now: number): string {
  return `aud_${action.replace(".", "_")}_${entityId}_${now.toString(36)}`;
}

export interface AuditInput {
  action: AuditAction;
  entity: AuditEntityKind;
  entityId: string;
  metadata?: Record<string, AuditMetadataValue>;
  /** Override the generated sentence. Used only by `fromCmsAudit`. */
  description?: string;
}

/**
 * Build one entry.
 *
 * The description is generated rather than required at the call site, so twenty
 * mutation sites cannot each phrase "a refund was approved" differently. A caller
 * may still pass one — the CMS adapter does, because its own record already has
 * better words than this file could reconstruct.
 */
export function buildAuditEntry(
  input: AuditInput,
  actor: AuditActor,
  now: number,
): AuditEntry {
  const metadata = input.metadata ?? {};
  return {
    id: auditId(input.action, input.entityId, now),
    actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    at: new Date(now).toISOString(),
    metadata,
    description: input.description ?? describeAudit(input.action, input.entityId, metadata),
  };
}

/** Read one metadata value as text, for the sentence. */
function text(metadata: Record<string, AuditMetadataValue>, key: string): string | null {
  const value = metadata[key];
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Read a note or a reason as a clause to append.
 *
 * The trailing full stop is stripped, because the sentence supplies its own and a
 * note somebody typed usually ends with one too — "…for abuse — Nine claims in
 * three weeks.." is the kind of small wrongness that makes a log look generated.
 */
function clause(metadata: Record<string, AuditMetadataValue>, key: string): string | null {
  const value = text(metadata, key)?.trim();
  if (!value) return null;
  return value.replace(/\.+$/, "") || null;
}

/**
 * An amount and, if the entry carried one, its currency.
 *
 * Amounts are recorded as **numbers** — a spreadsheet has to be able to sum the
 * column, which is the same reason the analytics export refuses formatted prices —
 * so the currency travels beside them and the sentence puts the two together.
 */
function money(metadata: Record<string, AuditMetadataValue>): string | null {
  const amount = metadata.amount;
  if (amount === null || amount === undefined || amount === "") return null;
  const currency = text(metadata, "currency");
  return currency ? `${amount} ${currency}` : String(amount);
}

/**
 * The sentence.
 *
 * One `switch`, so the wording for a kind of event is decided once. Every branch
 * degrades to something true when the metadata it hoped for is missing — an entry
 * that reads "Refund decided on ord_1041" is less useful than one that names the
 * amount, but it is still a record, whereas `undefined` spliced into a sentence is
 * a corrupted one.
 */
export function describeAudit(
  action: AuditAction,
  entityId: string,
  metadata: Record<string, AuditMetadataValue>,
): string {
  const to = text(metadata, "to");
  const name = text(metadata, "name");
  const amount = money(metadata);
  const reason = clause(metadata, "reason");
  const decision = text(metadata, "decision");
  const subject = name ?? entityId;

  switch (action) {
    case "order.intervened":
      return to
        ? `Moved order ${entityId} to ${to}${reason ? ` (${reason})` : ""}.`
        : `Intervened on order ${entityId}.`;
    case "order.rider-assigned":
      return `Assigned ${subject} to order ${entityId}${
        text(metadata, "mode") === "auto" ? " by auto-dispatch" : ""
      }.`;
    case "order.rider-reassigned":
      return `Reassigned order ${entityId} to ${subject}.`;
    case "refund.decided":
      return `${decision === "reject" ? "Rejected" : "Approved"} the refund on order ${entityId}${
        amount ? ` for ${amount}` : ""
      }.`;
    case "refund.settled":
      return `Recorded the refund on order ${entityId} as paid${amount ? ` (${amount})` : ""}.`;
    case "restaurant.decided":
      return `${decided(decision)} the restaurant application of ${subject}${
        reason ? ` — ${reason}` : ""
      }.`;
    case "rider.decided":
      return `${decided(decision)} the courier application of ${subject}${
        reason ? ` — ${reason}` : ""
      }.`;
    case "payout.paid":
      return `Paid ${subject}${amount ? ` ${amount}` : ""} for ${
        text(metadata, "periodRef") ?? "the period"
      }.`;
    case "payout.run":
      return `Ran a payout batch: ${text(metadata, "paid") ?? "0"} paid${
        amount ? `, ${amount} total` : ""
      }${text(metadata, "skipped") ? `, ${text(metadata, "skipped")} skipped` : ""}.`;
    case "payout.adjusted":
      return `Adjusted ${subject}'s ${text(metadata, "periodRef") ?? "period"} by ${
        amount ?? "an amount"
      }${reason ? ` — ${reason}` : ""}.`;
    case "coupon.created":
      return `Created the campaign ${text(metadata, "code") ?? entityId}.`;
    case "coupon.paused":
      return `Paused the campaign ${text(metadata, "code") ?? entityId}.`;
    case "coupon.resumed":
      return `Resumed the campaign ${text(metadata, "code") ?? entityId}.`;
    case "coupon.ended":
      return `Ended the campaign ${text(metadata, "code") ?? entityId}.`;
    case "customer.blocked":
      return `Blocked ${subject}${reason ? ` for ${reason}` : ""}${
        clause(metadata, "note") ? ` — ${clause(metadata, "note")}` : ""
      }.`;
    case "customer.unblocked":
      return `Unblocked ${subject}.`;
    case "settings.changed":
      return `Changed ${text(metadata, "section") ?? "settings"} for ${subject}.`;
    case "permission.changed":
      return `Changed ${subject}'s rights: ${text(metadata, "change") ?? "updated"}.`;
    case "content.changed":
      return `Changed the content document ${subject}.`;
  }
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * A decision, as the past tense the sentence needs.
 *
 * The mutation sites pass the *imperative* — `approve`, `reject`, `suspend` —
 * because that is what `VendorDecisionInput.decision` and `RiderDecision` are
 * called, and a log line reading "Reject the application of Kacchi Bari" is a
 * line that describes an instruction rather than a thing that happened. Both
 * spellings are accepted because the seed writes the participle directly.
 */
const DECISION_VERB: Record<string, string> = {
  approve: "Approved",
  approved: "Approved",
  reject: "Rejected",
  rejected: "Rejected",
  suspend: "Suspended",
  suspended: "Suspended",
  reactivate: "Reactivated",
  reactivated: "Reactivated",
  activate: "Activated",
  activated: "Activated",
  deactivate: "Deactivated",
  deactivated: "Deactivated",
};

function decided(decision: string | null): string {
  if (!decision) return "Decided";
  return DECISION_VERB[decision] ?? capitalise(decision);
}

// ---------------------------------------------------------------------------
// CMS compatibility
// ---------------------------------------------------------------------------

/**
 * Read one CMS trail entry as a platform entry.
 *
 * At read time, and nothing about `stores/cms` changes — which is the whole of
 * §6's "keep existing CMS audit compatibility". The nine CMS verbs collapse into
 * one `content.changed` action with the original verb kept in `metadata.change`,
 * because a platform-wide log is scanned by *who touched what* and a reader who
 * wants the difference between `unpublished` and `discarded` is on the content
 * desk's own screen, which still has it.
 *
 * `by` is a display name in the CMS record — there was never an account id on it —
 * so the actor id is derived from the name. It means two people with the same
 * display name would collapse into one actor filter entry, which is a real
 * limitation of the older record and not something this adapter can invent its way
 * out of.
 */
export function fromCmsAudit(entry: CmsAuditEntry): AuditEntry {
  return {
    id: `aud_cms_${entry.id}`,
    actor: {
      id: `cms:${entry.by.toLowerCase().replace(/\s+/g, "-")}`,
      name: entry.by,
      // The CMS trail never recorded a role. `moderator` would be a guess; the
      // content desk is the platform, so this is the honest label available.
      role: "super-admin",
    },
    action: "content.changed",
    entity: "cms-document",
    entityId: entry.documentId,
    at: entry.at,
    metadata: {
      change: entry.action,
      collection: entry.collection,
      name: entry.title,
    },
    description: `${capitalise(entry.action)} ${entry.collection} document “${entry.title}”.`,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Newest first, ties broken by id so a re-render never reshuffles a batch. */
export function byRecency(a: AuditEntry, b: AuditEntry): number {
  const delta = Date.parse(b.at) - Date.parse(a.at);
  return delta !== 0 ? delta : b.id.localeCompare(a.id);
}

/**
 * One entry per id.
 *
 * The reader-side half of the deterministic-id guarantee: two sources can produce
 * the same entry — a seeded log and a device that replayed the mutation — and the
 * screen must show one line, not two identical ones.
 */
export function dedupe(entries: AuditEntry[]): AuditEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export const EMPTY_AUDIT_QUERY: AuditQuery = {
  text: "",
  action: null,
  entity: null,
  actorId: null,
  from: null,
  to: null,
};

export function isEmptyAuditQuery(query: AuditQuery): boolean {
  return (
    !query.text.trim() &&
    query.action === null &&
    query.entity === null &&
    query.actorId === null &&
    query.from === null &&
    query.to === null
  );
}

/** Everything the free-text box searches. Built once per entry, not per keystroke. */
function haystack(entry: AuditEntry): string {
  return [
    entry.description,
    entry.actor.name,
    entry.entityId,
    entry.action,
    ...Object.values(entry.metadata).map((v) => (v === null ? "" : String(v))),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Apply the filter.
 *
 * The date bounds are read as **whole local days** — `from` includes everything
 * from its midnight and `to` includes everything up to the following midnight.
 * Comparing an ISO instant against a `YYYY-MM-DD` string directly would silently
 * drop everything that happened after midday on the last day of the range, which
 * is the classic off-by-one in a date filter and the reason this is spelled out
 * rather than inlined.
 */
export function filterAudit(entries: AuditEntry[], query: AuditQuery): AuditEntry[] {
  const needle = query.text.trim().toLowerCase();
  const from = query.from ? Date.parse(`${query.from}T00:00:00`) : null;
  const to = query.to ? Date.parse(`${query.to}T00:00:00`) + 86_400_000 : null;

  return entries.filter((entry) => {
    if (query.action && entry.action !== query.action) return false;
    if (query.entity && entry.entity !== query.entity) return false;
    if (query.actorId && entry.actor.id !== query.actorId) return false;
    const at = Date.parse(entry.at);
    if (from !== null && at < from) return false;
    if (to !== null && at >= to) return false;
    if (needle && !haystack(entry).includes(needle)) return false;
    return true;
  });
}

/** How many entries each action has — the filter's counts. */
export function countByAction(entries: AuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.action] = (counts[entry.action] ?? 0) + 1;
  }
  return counts;
}

/** Everybody who appears in the log, for the actor filter. Alphabetical. */
export function actorsIn(entries: AuditEntry[]): AuditActor[] {
  const byId = new Map<string, AuditActor>();
  for (const entry of entries) {
    if (!byId.has(entry.actor.id)) byId.set(entry.actor.id, entry.actor);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Is this one of the entries an incident review looks for first? */
export function isHighImpact(entry: AuditEntry): boolean {
  return AUDIT_HIGH_IMPACT.includes(entry.action);
}
