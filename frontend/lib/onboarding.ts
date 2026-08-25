import type {
  DocumentStatus,
  OnboardingAuthor,
  OnboardingDocument,
  OnboardingDocumentKind,
  OnboardingEvent,
  OnboardingEventKind,
  OnboardingStatus,
  PayoutAccount,
  PayoutMethod,
  RiderStatus,
  VendorStatus,
} from "@/types";

/**
 * onboarding.ts — the paperwork both applications share (Phases 6–7).
 *
 * The restaurant and rider lifecycles are different graphs over the same record
 * shape, so everything that is *not* the graph lives here: the event log, the
 * document checklist, the payout account, the transition helper the two graphs are
 * built with, and the field validators.
 *
 * Pure and clock-injected, like `lib/support` and `lib/settlement`: no store, no
 * mock data, no `Date.now()` unless a caller declines to pass one. `stores/onboarding`
 * commits what these return and emits the notifications.
 */

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

/** A restaurant's states, in lifecycle order — the admin filter's options. */
export const VENDOR_STATUSES: readonly VendorStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "suspended",
];

/** A rider's states, in lifecycle order. */
export const RIDER_STATUSES: readonly RiderStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "suspended",
  "inactive",
];

/** Waiting on the platform — the only status that is somebody's work queue. */
export function isAwaitingReview(status: OnboardingStatus): boolean {
  return status === "pending";
}

/** A reviewer has ruled on it, either way. */
export function isReviewed(status: OnboardingStatus): boolean {
  return status !== "draft" && status !== "pending";
}

/**
 * Errors these functions can refuse with. i18n keys, like every other refusal in
 * the domain, so a caller shows the message rather than composing one.
 */
export type OnboardingError =
  | "errors.applicationNotFound"
  | "errors.illegalApplicationMove"
  | "errors.applicationIncomplete"
  | "errors.decisionReasonRequired"
  /**
   * The signed-in account may not rule on applications (Phase 14, G31).
   *
   * In this union rather than a separate one because a caller already handles
   * every member of it the same way — `toast.error(t(result.error))` — and a
   * second error type would have meant changing that at each of the four call
   * sites to say nothing new.
   */
  | "errors.notPermitted";

/** Shared transition check — each graph passes its own table. */
export function canMove<S extends string>(
  transitions: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return transitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// References and the event log
// ---------------------------------------------------------------------------

/** Human-facing reference, in the same shape as an order's or a ticket's. */
export function applicationNumberFrom(prefix: string, ms: number): string {
  return `${prefix}-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

/** Deterministic event id — stable across a re-render, unique per record+time. */
function eventId(recordId: string, kind: string, ms: number): string {
  return `oev_${recordId}_${kind}_${ms.toString(36)}`;
}

export interface OnboardingEventInput {
  kind: OnboardingEventKind;
  author: OnboardingAuthor;
  authorName: string;
  status?: OnboardingStatus | null;
  body?: string | null;
  document?: OnboardingDocumentKind | null;
}

/** One log entry, with every field filled so no caller can forget one. */
export function buildOnboardingEvent(
  recordId: string,
  input: OnboardingEventInput,
  now: number,
): OnboardingEvent {
  return {
    id: eventId(recordId, input.kind, now),
    kind: input.kind,
    author: input.author,
    authorName: input.authorName,
    status: input.status ?? null,
    body: input.body ?? null,
    document: input.document ?? null,
    at: new Date(now).toISOString(),
  };
}

/** The last thing that happened — what a queue row shows as "updated". */
export function lastOnboardingEvent(
  events: OnboardingEvent[],
): OnboardingEvent | null {
  return events[events.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** An empty checklist entry — a document the applicant has not provided. */
export function missingDocument(kind: OnboardingDocumentKind): OnboardingDocument {
  return {
    kind,
    status: "missing",
    reference: null,
    expiresAt: null,
    note: null,
    uploadedAt: null,
  };
}

/**
 * A full checklist for a set of required kinds, filled from what was submitted.
 *
 * Built from the *required* list rather than from what happens to be present, so a
 * document nobody uploaded appears as `missing` instead of vanishing. A reviewer
 * looking at a short list cannot tell an incomplete application from a small one.
 */
export function documentChecklist(
  required: readonly OnboardingDocumentKind[],
  provided: OnboardingDocument[],
): OnboardingDocument[] {
  return required.map(
    (kind) => provided.find((d) => d.kind === kind) ?? missingDocument(kind),
  );
}

/** Uploaded and awaiting a look. */
export function submittedDocument(
  kind: OnboardingDocumentKind,
  reference: string,
  now: number,
  expiresAt: string | null = null,
): OnboardingDocument {
  return {
    kind,
    status: "pending",
    reference: reference.trim(),
    expiresAt,
    note: null,
    uploadedAt: new Date(now).toISOString(),
  };
}

/**
 * Whether a document counts as satisfied *right now*.
 *
 * Expiry is checked against the clock rather than trusted from `status`, because a
 * document verified last year and expiring last month is still stored as
 * `verified` — the state a reviewer set — and only the clock knows it has lapsed.
 */
export function isDocumentValid(document: OnboardingDocument, now: number): boolean {
  if (document.status !== "verified") return false;
  if (!document.expiresAt) return true;
  return Date.parse(document.expiresAt) > now;
}

/** Documents that stop an approval: missing, refused, or lapsed. */
export function blockingDocuments(
  documents: OnboardingDocument[],
  now: number,
): OnboardingDocument[] {
  return documents.filter(
    (d) => d.status === "missing" || d.status === "rejected" || (d.status === "verified" && !isDocumentValid(d, now)),
  );
}

/** Counts for the reviewer's checklist header. */
export function documentSummary(
  documents: OnboardingDocument[],
  now: number,
): { total: number; verified: number; pending: number; blocking: number } {
  return {
    total: documents.length,
    verified: documents.filter((d) => isDocumentValid(d, now)).length,
    pending: documents.filter((d) => d.status === "pending").length,
    blocking: blockingDocuments(documents, now).length,
  };
}

/** Set one document's state, keeping the rest of the checklist untouched. */
export function reviewDocument(
  documents: OnboardingDocument[],
  kind: OnboardingDocumentKind,
  status: DocumentStatus,
  note: string | null,
): OnboardingDocument[] {
  return documents.map((d) => (d.kind === kind ? { ...d, status, note } : d));
}

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export const PAYOUT_METHODS: readonly PayoutMethod[] = ["bank-transfer", "mobile-wallet"];

/** An empty payout account — the starting point for a fresh application form. */
export function emptyPayoutAccount(): PayoutAccount {
  return {
    method: "bank-transfer",
    provider: "",
    accountName: "",
    accountNumber: "",
    branch: null,
  };
}

/**
 * Is this account complete enough for a payout run to use?
 *
 * A branch is required for a bank transfer and meaningless for a mobile wallet, so
 * the rule is per-method rather than "all fields filled" — which would either ask a
 * bKash applicant for a routing number or let a bank applicant skip one.
 */
export function payoutFieldErrors(account: PayoutAccount): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!account.provider.trim()) errors.provider = "errors.required";
  if (!account.accountName.trim()) errors.accountName = "errors.required";
  if (!account.accountNumber.trim()) errors.accountNumber = "errors.required";
  if (account.method === "bank-transfer" && !account.branch?.trim()) {
    errors.branch = "errors.required";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

/**
 * The validators the application forms share.
 *
 * Deliberately shallow: a shape check and a length, not a real-world check. The
 * prototype has no identity provider, no licence registry and no bank, and a
 * regular expression that rejects a valid trade licence because it does not look
 * like a Bangladeshi one is worse than accepting whatever the applicant typed.
 * What is enforced is *presence* — an application missing a field a reviewer needs
 * should never reach the queue.
 */
export function textError(value: string, min = 2): string | null {
  return value.trim().length >= min ? null : "errors.required";
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return "errors.required";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "errors.invalidEmail";
}

export function phoneError(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "errors.required";
  return digits.length >= 9 ? null : "errors.invalidPhone";
}

/** Drop the null entries so a caller can ask `Object.keys(...).length === 0`. */
export function compactErrors(
  entries: Record<string, string | null>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, message] of Object.entries(entries)) {
    if (message) errors[field] = message;
  }
  return errors;
}
