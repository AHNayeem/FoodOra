import type {
  OnboardingAuthor,
  OnboardingDocument,
  Rider,
  RiderApplication,
  RiderContactInfo,
  RiderDocument,
  RiderDocumentKind,
  RiderEmergencyContact,
  RiderPersonalInfo,
  RiderStatus,
  RiderVehicleInfo,
} from "@/types";
import {
  applicationNumberFrom,
  blockingDocuments,
  buildOnboardingEvent,
  canMove,
  compactErrors,
  documentChecklist,
  emailError,
  emptyPayoutAccount,
  isDocumentValid,
  payoutFieldErrors,
  reviewDocument,
  phoneError,
  textError,
  type OnboardingError,
  type OnboardingEventInput,
} from "./onboarding";
import { slugify } from "./utils";

/**
 * rider-onboarding.ts — how a courier joins, and how dispatch knows (Phase 7,
 * G10/G11/G13).
 *
 * The mirror of `lib/vendor-onboarding`, deliberately: the paperwork, the log and
 * the reviewer's actions are the same shape on both queues, so an operator learns
 * one screen and a future permission model has one thing to gate. What differs is
 * the graph — a rider has an `inactive` state a restaurant does not — and what the
 * approval unlocks: a restaurant gets a dashboard, a rider gets *work*.
 *
 * That last point is the one that mattered to the audit. G40 found dispatch handing
 * orders to riders who had gone home; G11 found `Rider` with no approval field at
 * all, so dispatch could not have checked even if it wanted to. Both now resolve
 * through the same injected set — see `stores/orders.unavailableRiderIds`.
 */

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/**
 * Legal successors of each rider status.
 *
 * `inactive` is the entry worth explaining. A rider who stops working for a month
 * is not suspended — nobody did anything wrong — and is not rejected, because the
 * paperwork was fine. It is the difference between "we stopped you" and "you
 * stopped", and collapsing the two would make every deactivation read as a
 * disciplinary action in the log.
 *
 * Both `suspended` and `inactive` return to `approved` rather than to `pending`: the
 * documents were already checked, and sending a returning rider back round the
 * review queue would waste a reviewer's time on paperwork they have seen.
 */
export const RIDER_TRANSITIONS: Record<RiderStatus, readonly RiderStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected"],
  approved: ["suspended", "inactive"],
  rejected: ["pending"],
  suspended: ["approved"],
  inactive: ["approved", "suspended"],
};

export function canTransitionRider(from: RiderStatus, to: RiderStatus): boolean {
  return canMove(RIDER_TRANSITIONS, from, to);
}

/**
 * May dispatch give this rider work?
 *
 * The spec's "only approved/active riders may participate in normal dispatch" in one
 * function. `inactive` is excluded on purpose — that *is* what deactivating means —
 * and so is `suspended`, which is the whole point of one.
 */
export function canDispatchToRider(status: RiderStatus): boolean {
  return status === "approved";
}

/**
 * May they open the rider app?
 *
 * An inactive rider can: they need somewhere to see their history, their wallet and
 * the fact that they are inactive. A suspended rider can too, for the same reason —
 * being told why is better than a locked door — but neither is offered work, which
 * is `canDispatchToRider`'s job. A rider who has not been approved yet sees their
 * application's status instead.
 */
export function canUseRiderApp(status: RiderStatus): boolean {
  return status === "approved" || status === "inactive" || status === "suspended";
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** What the platform asks a rider for, in the order the form lists it. */
export const RIDER_DOCUMENTS: readonly RiderDocumentKind[] = [
  "national-id",
  "driving-licence",
  "vehicle-registration",
  "insurance",
  "profile-photo",
];

/**
 * The blocking subset, which depends on the vehicle.
 *
 * A bicycle has no licence, no registration and nothing to insure, so demanding
 * them would make the most common vehicle in the city un-onboardable. Everything
 * motorised needs a licence — the one document that says the rider may legally be
 * on the road at all.
 */
export function requiredRiderDocuments(
  vehicle: RiderVehicleInfo["vehicle"],
): readonly RiderDocumentKind[] {
  return vehicle === "bicycle"
    ? ["national-id"]
    : ["national-id", "driving-licence"];
}

// ---------------------------------------------------------------------------
// Drafts and validation
// ---------------------------------------------------------------------------

/** Everything the `/rider` form collects. */
export interface RiderApplicationDraft {
  personal: RiderPersonalInfo;
  contact: RiderContactInfo;
  emergency: RiderEmergencyContact;
  vehicleInfo: RiderVehicleInfo;
  zoneId: string;
  documents: OnboardingDocument[];
  payout: RiderApplication["payout"];
}

export function emptyRiderDraft(zoneId = ""): RiderApplicationDraft {
  return {
    personal: {
      name: "",
      dateOfBirth: "",
      nationalId: "",
      address: "",
      area: "",
      city: "Dhaka",
    },
    contact: { phone: "", email: "" },
    emergency: { name: "", relationship: "", phone: "" },
    vehicleInfo: { vehicle: "bike", plate: null, model: null, licenceNumber: null },
    zoneId,
    documents: documentChecklist(RIDER_DOCUMENTS, []),
    payout: emptyPayoutAccount(),
  };
}

export const RIDER_STEPS = [
  "personal",
  "contact",
  "vehicle",
  "documents",
  "payout",
  "review",
] as const;
export type RiderStep = (typeof RIDER_STEPS)[number];

/** Minimum age the platform will onboard. Stated once, here. */
export const MIN_RIDER_AGE = 18;

/** Age in whole years at `now`, or null if the date is unusable. */
export function riderAge(dateOfBirth: string, now: number): number | null {
  const born = Date.parse(dateOfBirth);
  if (Number.isNaN(born)) return null;
  return Math.floor((now - born) / (365.25 * 24 * 60 * 60_000));
}

/** Field errors for one step, keyed `<section>.<field>`. */
export function riderStepErrors(
  draft: RiderApplicationDraft,
  step: RiderStep,
  now = Date.now(),
): Record<string, string> {
  switch (step) {
    case "personal": {
      const age = riderAge(draft.personal.dateOfBirth, now);
      return compactErrors({
        "personal.name": textError(draft.personal.name),
        "personal.dateOfBirth":
          age == null ? "errors.required" : age >= MIN_RIDER_AGE ? null : "errors.tooYoung",
        "personal.nationalId": textError(draft.personal.nationalId, 5),
        "personal.address": textError(draft.personal.address, 6),
        "personal.area": textError(draft.personal.area),
      });
    }
    case "contact":
      return compactErrors({
        "contact.phone": phoneError(draft.contact.phone),
        "contact.email": emailError(draft.contact.email),
        "emergency.name": textError(draft.emergency.name),
        "emergency.relationship": textError(draft.emergency.relationship),
        // Deliberately checked against the rider's own number: an emergency
        // contact that rings the phone in the crashed rider's pocket is not one.
        "emergency.phone":
          phoneError(draft.emergency.phone) ??
          (draft.emergency.phone.replace(/\D/g, "") ===
          draft.contact.phone.replace(/\D/g, "")
            ? "errors.sameAsOwnPhone"
            : null),
      });
    case "vehicle": {
      const motorised = draft.vehicleInfo.vehicle !== "bicycle";
      return compactErrors({
        "vehicleInfo.plate": motorised
          ? textError(draft.vehicleInfo.plate ?? "", 4)
          : null,
        "vehicleInfo.licenceNumber": motorised
          ? textError(draft.vehicleInfo.licenceNumber ?? "", 4)
          : null,
        zoneId: draft.zoneId ? null : "errors.pickOne",
      });
    }
    case "documents": {
      const missing = requiredRiderDocuments(draft.vehicleInfo.vehicle).filter((kind) => {
        const doc = draft.documents.find((d) => d.kind === kind);
        return !doc || doc.status === "missing";
      });
      return missing.length ? { "documents.required": "errors.documentsMissing" } : {};
    }
    case "payout":
      return Object.entries(payoutFieldErrors(draft.payout)).reduce(
        (acc, [field, message]) => {
          acc[`payout.${field}`] = message;
          return acc;
        },
        {} as Record<string, string>,
      );
    case "review":
      return RIDER_STEPS.filter((s) => s !== "review").reduce(
        (acc, s) => ({ ...acc, ...riderStepErrors(draft, s, now) }),
        {} as Record<string, string>,
      );
  }
}

export function isRiderDraftComplete(
  draft: RiderApplicationDraft,
  now = Date.now(),
): boolean {
  return Object.keys(riderStepErrors(draft, "review", now)).length === 0;
}

// ---------------------------------------------------------------------------
// Constructors and moves
// ---------------------------------------------------------------------------

export interface CreateRiderApplicationInput {
  draft: RiderApplicationDraft;
  userId: string | null;
  riderId?: string | null;
  submit: boolean;
  by: string;
}

export function createRiderApplication(
  input: CreateRiderApplicationInput,
  now = Date.now(),
): RiderApplication {
  const iso = new Date(now).toISOString();
  const key = input.userId ?? slugify(input.draft.personal.name || "applicant");
  const id = `rap_${key}_${Math.floor(now / 1000).toString(36)}`;
  const status: RiderStatus = input.submit ? "pending" : "draft";

  return {
    id,
    applicationNumber: applicationNumberFrom("DAP", now),
    riderId: input.riderId ?? null,
    userId: input.userId,
    status,
    personal: input.draft.personal,
    contact: input.draft.contact,
    emergency: input.draft.emergency,
    vehicleInfo: input.draft.vehicleInfo,
    zoneId: input.draft.zoneId,
    documents: documentChecklist(RIDER_DOCUMENTS, input.draft.documents),
    payout: input.draft.payout,
    events: [
      buildOnboardingEvent(
        id,
        {
          kind: input.submit ? "submitted" : "edited",
          author: "applicant",
          authorName: input.by,
          status,
        },
        now,
      ),
    ],
    submittedAt: input.submit ? iso : null,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

export function appendRiderEvent(
  application: RiderApplication,
  input: OnboardingEventInput,
  now = Date.now(),
): RiderApplication {
  const event = buildOnboardingEvent(application.id, input, now);
  return {
    ...application,
    events: [...application.events, event],
    updatedAt: event.at,
  };
}

export function moveRiderApplication(
  application: RiderApplication,
  to: RiderStatus,
  by: { author: OnboardingAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): { application: RiderApplication; error: OnboardingError | null } {
  if (!canTransitionRider(application.status, to)) {
    return { application, error: "errors.illegalApplicationMove" };
  }
  const iso = new Date(now).toISOString();
  const moved = appendRiderEvent(
    application,
    {
      kind: to === "pending" ? "submitted" : "decision",
      author: by.author,
      authorName: by.authorName,
      status: to,
      body: by.note ?? null,
    },
    now,
  );

  const decided = to !== "pending";
  return {
    application: {
      ...moved,
      status: to,
      submittedAt: to === "pending" ? iso : moved.submittedAt,
      decidedAt: decided ? iso : moved.decidedAt,
      decidedBy: decided ? by.authorName : moved.decidedBy,
      decisionNote: to === "approved" ? null : (by.note ?? moved.decisionNote),
    },
    error: null,
  };
}

export function submitRiderApplication(
  application: RiderApplication,
  by: string,
  now = Date.now(),
): { application: RiderApplication; error: OnboardingError | null } {
  const draft: RiderApplicationDraft = {
    personal: application.personal,
    contact: application.contact,
    emergency: application.emergency,
    vehicleInfo: application.vehicleInfo,
    zoneId: application.zoneId,
    documents: application.documents,
    payout: application.payout,
  };
  if (!isRiderDraftComplete(draft, now)) {
    return { application, error: "errors.applicationIncomplete" };
  }
  return moveRiderApplication(
    application,
    "pending",
    { author: "applicant", authorName: by },
    now,
  );
}

/** The spec's five admin actions, as one vocabulary. */
export type RiderDecision =
  | "approve"
  | "reject"
  | "suspend"
  | "activate"
  | "deactivate";

const RIDER_DECISION_TARGET: Record<RiderDecision, RiderStatus> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  activate: "approved",
  deactivate: "inactive",
};

export interface RiderDecisionInput {
  decision: RiderDecision;
  note?: string;
  by: string;
}

/**
 * A reviewer's ruling on a rider.
 *
 * Same two guards as the vendor side and for the same reasons: a refusal or a
 * suspension must carry a reason, and an approval must not be granted over a
 * missing or lapsed document. `deactivate` needs neither — it is an availability
 * change, not a judgement.
 */
export function decideRiderApplication(
  application: RiderApplication,
  input: RiderDecisionInput,
  now = Date.now(),
): { application: RiderApplication; error: OnboardingError | null } {
  const to = RIDER_DECISION_TARGET[input.decision];
  const needsReason = input.decision === "reject" || input.decision === "suspend";
  if (needsReason && !(input.note ?? "").trim()) {
    return { application, error: "errors.decisionReasonRequired" };
  }
  if (input.decision === "approve" && blockingRiderDocuments(application, now).length) {
    return { application, error: "errors.applicationIncomplete" };
  }
  return moveRiderApplication(
    application,
    to,
    { author: "reviewer", authorName: input.by, note: input.note ?? null },
    now,
  );
}

/** Documents that would stop this application being approved. */
export function blockingRiderDocuments(
  application: RiderApplication,
  now = Date.now(),
): OnboardingDocument[] {
  const required = requiredRiderDocuments(application.vehicleInfo.vehicle);
  return blockingDocuments(
    application.documents.filter((d) => required.includes(d.kind as RiderDocumentKind)),
    now,
  );
}

export function editRiderApplication(
  application: RiderApplication,
  patch: Partial<RiderApplicationDraft>,
  by: { author: OnboardingAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): RiderApplication {
  const edited = appendRiderEvent(
    application,
    { kind: "edited", author: by.author, authorName: by.authorName, body: by.note ?? null },
    now,
  );
  return {
    ...edited,
    personal: patch.personal ?? edited.personal,
    contact: patch.contact ?? edited.contact,
    emergency: patch.emergency ?? edited.emergency,
    vehicleInfo: patch.vehicleInfo ?? edited.vehicleInfo,
    zoneId: patch.zoneId ?? edited.zoneId,
    documents: patch.documents
      ? documentChecklist(RIDER_DOCUMENTS, patch.documents)
      : edited.documents,
    payout: patch.payout ?? edited.payout,
  };
}

// ---------------------------------------------------------------------------
// Approval → a fleet record
// ---------------------------------------------------------------------------

/**
 * The `Rider` an approved application becomes.
 *
 * `Rider.documents` is the existing fleet shape (`RiderDocument`) and is *projected*
 * from the application's checklist rather than replaced by it — the rider app's
 * profile screen already renders it, and giving that screen a second document type
 * to understand would be a rewrite of working code for no gain. Kinds that have no
 * fleet equivalent (`profile-photo`) are dropped rather than mistranslated.
 *
 * The performance figures start at zero and the rating at the platform's neutral
 * 5.0: a rider who has not ridden yet has no acceptance rate, and seeding one would
 * be a fake number that dispatch then *ranks* on.
 */
export function riderFromApplication(
  application: RiderApplication,
  now = Date.now(),
): Rider {
  const iso = new Date(now).toISOString();
  return {
    id: `rid_${slugify(application.personal.name)}_${Math.floor(now / 1000).toString(36)}`,
    userId: application.userId,
    name: application.personal.name,
    phone: application.contact.phone,
    photo: null,
    vehicle: application.vehicleInfo.vehicle,
    plate: application.vehicleInfo.plate,
    zoneId: application.zoneId,
    rating: 5,
    trips: 0,
    acceptanceRate: 1,
    onTimeRate: 1,
    joinedAt: iso,
    documents: fleetDocumentsFrom(application),
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/** Map the application's checklist onto the fleet record's document shape. */
export function fleetDocumentsFrom(application: RiderApplication): RiderDocument[] {
  const KINDS: Partial<Record<RiderDocumentKind, RiderDocument["kind"]>> = {
    "national-id": "national-id",
    "driving-licence": "licence",
    "vehicle-registration": "vehicle-registration",
    insurance: "insurance",
  };
  return application.documents
    .filter((d) => d.status !== "missing")
    .flatMap((d) => {
      const kind = KINDS[d.kind as RiderDocumentKind];
      if (!kind) return [];
      const status: RiderDocument["status"] =
        d.status === "verified" ? "verified" : d.status === "expired" ? "expired" : "pending";
      return [{ kind, status, expiresAt: d.expiresAt }];
    });
}

/** Is every document this rider provided currently valid? */
export function riderDocumentsValid(
  application: RiderApplication,
  now = Date.now(),
): boolean {
  return application.documents
    .filter((d) => d.status !== "missing")
    .every((d) => isDocumentValid(d, now));
}

/** A reviewer's ruling on one document. See the vendor equivalent for why. */
export function reviewRiderDocument(
  application: RiderApplication,
  kind: RiderDocumentKind,
  status: OnboardingDocument["status"],
  by: { authorName: string; note?: string | null },
  now = Date.now(),
): RiderApplication {
  const documents = reviewDocument(application.documents, kind, status, by.note ?? null);
  return appendRiderEvent(
    { ...application, documents },
    {
      kind: "document",
      author: "reviewer",
      authorName: by.authorName,
      document: kind,
      body: by.note ?? null,
    },
    now,
  );
}
