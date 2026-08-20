import type {
  OnboardingAuthor,
  OnboardingDocument,
  VendorApplication,
  VendorBranch,
  VendorBusinessInfo,
  VendorDeliveryDraft,
  VendorDocumentKind,
  VendorOwnerInfo,
  VendorProfileDraft,
  VendorStatus,
  Vendor,
  WeeklyHours,
} from "@/types";
import {
  applicationNumberFrom,
  buildOnboardingEvent,
  blockingDocuments,
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
 * vendor-onboarding.ts — how a restaurant joins, and how it can be stopped
 * (Phase 6, G08/G09/G12).
 *
 * Built to the same rules as `lib/order-machine` and `lib/support`: one graph, one
 * set of constructors, every mutation a pure function of a record and an input.
 * The reason is the one the audit kept finding — the moment two surfaces each
 * decide what "approved" means, the marketing page, the dashboard gate and the
 * admin queue will disagree, and the disagreement will be invisible.
 *
 * Pure and clock-injected. `stores/onboarding` commits what these return, mints the
 * catalog listing on approval and emits the notifications.
 */

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/**
 * Legal successors of each restaurant status.
 *
 * Two entries carry the decisions worth stating. `rejected → pending` exists
 * because a refusal is usually about a document, and an applicant who fixes it
 * should re-enter the same queue rather than start a second application — which is
 * how a platform ends up with two records of one restaurant. And `suspended →
 * approved` is a *reactivation*, not a fresh approval: the paperwork was already
 * checked, so it goes back to where it was rather than round the loop again.
 *
 * `approved → rejected` is deliberately absent. Once a restaurant is live the way
 * to stop it is `suspended`, which says "we stopped this" rather than "we never
 * agreed to it" — and the difference matters to the orders it already took.
 */
export const VENDOR_TRANSITIONS: Record<VendorStatus, readonly VendorStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved"],
};

export function canTransitionVendor(from: VendorStatus, to: VendorStatus): boolean {
  return canMove(VENDOR_TRANSITIONS, from, to);
}

/**
 * May the owner of this restaurant work the dashboard?
 *
 * The spec's "approval must affect restaurant dashboard access" in one function, so
 * the shell, any future staff surface and the tests all ask the same question. A
 * suspended restaurant is *not* let in: the point of a suspension is that it stops
 * taking orders, and a dashboard that still accepts them would make the suspension
 * decorative.
 */
export function canManageVendor(status: VendorStatus): boolean {
  return status === "approved";
}

/** May this restaurant appear in discovery and take orders? */
export function isVendorLive(status: VendorStatus): boolean {
  return status === "approved";
}

// ---------------------------------------------------------------------------
// The documents a restaurant must provide
// ---------------------------------------------------------------------------

/**
 * What the platform asks for, in the order the form lists it.
 *
 * `food-safety` and `premises-photo` are on the list and are *not* blocking —
 * see `REQUIRED_VENDOR_DOCUMENTS`. A prototype that refuses every application
 * until six documents exist demonstrates a wall, not an onboarding flow.
 */
export const VENDOR_DOCUMENTS: readonly VendorDocumentKind[] = [
  "trade-licence",
  "national-id",
  "tin-certificate",
  "bank-statement",
  "food-safety",
  "premises-photo",
];

/** The subset an approval cannot legitimately skip. */
export const REQUIRED_VENDOR_DOCUMENTS: readonly VendorDocumentKind[] = [
  "trade-licence",
  "national-id",
];

// ---------------------------------------------------------------------------
// Drafts and validation
// ---------------------------------------------------------------------------

/** Everything the `/partner` form collects, in one object. */
export interface VendorApplicationDraft {
  owner: VendorOwnerInfo;
  business: VendorBusinessInfo;
  restaurant: VendorProfileDraft;
  hours: WeeklyHours;
  delivery: VendorDeliveryDraft;
  documents: OnboardingDocument[];
  payout: VendorApplication["payout"];
  branches: VendorBranch[];
}

const WEEK: readonly (keyof WeeklyHours)[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** Standard trading hours, so the form starts somewhere sensible. */
export function defaultVendorHours(): WeeklyHours {
  return WEEK.reduce((hours, day) => {
    hours[day] = { open: "10:00", close: "22:00" };
    return hours;
  }, {} as WeeklyHours);
}

/** A blank application, for the form's initial state. */
export function emptyVendorDraft(): VendorApplicationDraft {
  return {
    owner: { name: "", email: "", phone: "", nationalId: "" },
    business: {
      legalName: "",
      tradeLicence: "",
      tin: "",
      bin: null,
      vendorType: "restaurant",
      yearsTrading: 1,
    },
    restaurant: {
      name: "",
      tagline: "",
      description: "",
      cuisineIds: [],
      priceLevel: 2,
      location: { lat: 23.7806, lng: 90.4152, address: "", city: "Dhaka", countryCode: "BD" },
      phone: "",
      email: "",
    },
    hours: defaultVendorHours(),
    delivery: {
      offersDelivery: true,
      offersPickup: false,
      deliveryFee: 60,
      minOrder: 200,
      freeDeliveryOver: null,
      etaMinutes: [25, 40],
      zoneIds: [],
    },
    documents: documentChecklist(VENDOR_DOCUMENTS, []),
    payout: emptyPayoutAccount(),
    branches: [],
  };
}

/**
 * The application form's steps. Data rather than markup, so the form, its
 * progress indicator and the reviewer's section headings read from one list.
 */
export const VENDOR_STEPS = [
  "owner",
  "business",
  "restaurant",
  "hours",
  "delivery",
  "documents",
  "payout",
  "review",
] as const;
export type VendorStep = (typeof VENDOR_STEPS)[number];

/**
 * Field errors for one step, keyed `<section>.<field>`.
 *
 * Per-step rather than whole-form because that is how the form is walked: a
 * "next" button that reports a problem seven steps ahead is not help. The final
 * `review` step re-runs every earlier step, so nothing can be skipped by
 * navigating around.
 */
export function vendorStepErrors(
  draft: VendorApplicationDraft,
  step: VendorStep,
): Record<string, string> {
  switch (step) {
    case "owner":
      return compactErrors({
        "owner.name": textError(draft.owner.name),
        "owner.email": emailError(draft.owner.email),
        "owner.phone": phoneError(draft.owner.phone),
        "owner.nationalId": textError(draft.owner.nationalId, 5),
      });
    case "business":
      return compactErrors({
        "business.legalName": textError(draft.business.legalName),
        "business.tradeLicence": textError(draft.business.tradeLicence, 4),
        "business.tin": textError(draft.business.tin, 4),
      });
    case "restaurant":
      return compactErrors({
        "restaurant.name": textError(draft.restaurant.name),
        "restaurant.tagline": textError(draft.restaurant.tagline, 4),
        "restaurant.description": textError(draft.restaurant.description, 20),
        "restaurant.cuisineIds": draft.restaurant.cuisineIds.length ? null : "errors.pickOne",
        "restaurant.address": textError(draft.restaurant.location.address, 6),
        "restaurant.phone": phoneError(draft.restaurant.phone),
        "restaurant.email": emailError(draft.restaurant.email),
      });
    case "hours":
      // At least one trading day. A restaurant that is closed all week is not an
      // application, and the alternative — accepting it — produces a listing no
      // customer can ever order from.
      return compactErrors({
        "hours.week": WEEK.some((d) => draft.hours[d].open && draft.hours[d].close)
          ? null
          : "errors.pickOneDay",
      });
    case "delivery":
      return compactErrors({
        "delivery.mode":
          draft.delivery.offersDelivery || draft.delivery.offersPickup
            ? null
            : "errors.pickOne",
        "delivery.zoneIds":
          !draft.delivery.offersDelivery || draft.delivery.zoneIds.length
            ? null
            : "errors.pickOne",
        "delivery.eta":
          draft.delivery.etaMinutes[0] > 0 &&
          draft.delivery.etaMinutes[1] > draft.delivery.etaMinutes[0]
            ? null
            : "errors.invalidRange",
      });
    case "documents": {
      // Only the blocking subset gates submission; the rest can follow.
      const missing = REQUIRED_VENDOR_DOCUMENTS.filter((kind) => {
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
      return VENDOR_STEPS.filter((s) => s !== "review").reduce(
        (acc, s) => ({ ...acc, ...vendorStepErrors(draft, s) }),
        {} as Record<string, string>,
      );
  }
}

/** Is the whole draft submittable? */
export function isVendorDraftComplete(draft: VendorApplicationDraft): boolean {
  return Object.keys(vendorStepErrors(draft, "review")).length === 0;
}

// ---------------------------------------------------------------------------
// Constructors and moves
// ---------------------------------------------------------------------------

export interface CreateVendorApplicationInput {
  draft: VendorApplicationDraft;
  /** The account applying, when there is one signed in. */
  ownerId: string | null;
  /** An existing catalog listing this application governs, if any. */
  vendorId?: string | null;
  /** Whether it is being saved or sent. */
  submit: boolean;
  /** Who is doing it, for the log's attribution. */
  by: string;
}

/**
 * A new application.
 *
 * The id is derived from the owner (or the restaurant name) and the second, so a
 * double-tapped submit produces one application rather than two — the same guard
 * `createTicket` uses.
 */
export function createVendorApplication(
  input: CreateVendorApplicationInput,
  now = Date.now(),
): VendorApplication {
  const iso = new Date(now).toISOString();
  const key = input.ownerId ?? slugify(input.draft.restaurant.name || "applicant");
  const id = `vap_${key}_${Math.floor(now / 1000).toString(36)}`;
  const status: VendorStatus = input.submit ? "pending" : "draft";

  return {
    id,
    applicationNumber: applicationNumberFrom("RAP", now),
    vendorId: input.vendorId ?? null,
    ownerId: input.ownerId,
    status,
    owner: input.draft.owner,
    business: input.draft.business,
    restaurant: input.draft.restaurant,
    hours: input.draft.hours,
    delivery: input.draft.delivery,
    documents: documentChecklist(VENDOR_DOCUMENTS, input.draft.documents),
    payout: input.draft.payout,
    branches: input.draft.branches,
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

/** Append an event. Pure; the status is untouched. */
export function appendVendorEvent(
  application: VendorApplication,
  input: OnboardingEventInput,
  now = Date.now(),
): VendorApplication {
  const event = buildOnboardingEvent(application.id, input, now);
  return {
    ...application,
    events: [...application.events, event],
    updatedAt: event.at,
  };
}

/**
 * Move an application. Refuses an illegal move rather than performing it, and
 * records it in the log — so "who suspended this restaurant and why" always has an
 * answer, which is the whole reason a status alone was not enough.
 */
export function moveVendorApplication(
  application: VendorApplication,
  to: VendorStatus,
  by: { author: OnboardingAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): { application: VendorApplication; error: OnboardingError | null } {
  if (!canTransitionVendor(application.status, to)) {
    return { application, error: "errors.illegalApplicationMove" };
  }
  const iso = new Date(now).toISOString();
  const kind = to === "pending" ? "submitted" : "decision";
  const moved = appendVendorEvent(
    application,
    {
      kind,
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
      // An approval clears the last refusal's reason: keeping it would leave a
      // live restaurant carrying the sentence that once rejected it.
      decisionNote: to === "approved" ? null : (by.note ?? moved.decisionNote),
    },
    error: null,
  };
}

/** Send a draft (or a fixed rejection) for review. */
export function submitVendorApplication(
  application: VendorApplication,
  by: string,
  now = Date.now(),
): { application: VendorApplication; error: OnboardingError | null } {
  const draft: VendorApplicationDraft = {
    owner: application.owner,
    business: application.business,
    restaurant: application.restaurant,
    hours: application.hours,
    delivery: application.delivery,
    documents: application.documents,
    payout: application.payout,
    branches: application.branches,
  };
  if (!isVendorDraftComplete(draft)) {
    return { application, error: "errors.applicationIncomplete" };
  }
  return moveVendorApplication(
    application,
    "pending",
    { author: "applicant", authorName: by },
    now,
  );
}

export interface VendorDecisionInput {
  decision: "approve" | "reject" | "suspend" | "reactivate";
  /** Required for a refusal or a suspension — the sentence the owner reads. */
  note?: string;
  /** The reviewer account deciding. */
  by: string;
}

const DECISION_TARGET: Record<VendorDecisionInput["decision"], VendorStatus> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  reactivate: "approved",
};

/**
 * A reviewer's ruling.
 *
 * A refusal or a suspension without a reason is refused *here* rather than being
 * left to each admin surface to remember, because an unexplained rejection is the
 * failure mode of every approval queue: the applicant has no idea what to fix, and
 * the platform has no record of what it objected to.
 *
 * An approval additionally checks the blocking documents. It is the one guard that
 * consults the clock, because a document that was verified and has since expired is
 * stored as `verified` and only the clock knows better.
 */
export function decideVendorApplication(
  application: VendorApplication,
  input: VendorDecisionInput,
  now = Date.now(),
): { application: VendorApplication; error: OnboardingError | null } {
  const to = DECISION_TARGET[input.decision];
  const needsReason = input.decision === "reject" || input.decision === "suspend";
  if (needsReason && !(input.note ?? "").trim()) {
    return { application, error: "errors.decisionReasonRequired" };
  }
  if (input.decision === "approve" && blockingVendorDocuments(application, now).length) {
    return { application, error: "errors.applicationIncomplete" };
  }
  return moveVendorApplication(
    application,
    to,
    { author: "reviewer", authorName: input.by, note: input.note ?? null },
    now,
  );
}

/** Documents that would stop this application being approved. */
export function blockingVendorDocuments(
  application: VendorApplication,
  now = Date.now(),
): OnboardingDocument[] {
  const required = application.documents.filter((d) =>
    REQUIRED_VENDOR_DOCUMENTS.includes(d.kind as VendorDocumentKind),
  );
  return blockingDocuments(required, now);
}

/**
 * Edit the application in place.
 *
 * Available to the reviewer (the spec's "edit" action) as well as to the applicant
 * while it is a draft, and it appends an event either way — an admin quietly fixing
 * an applicant's bank details is exactly the change somebody will later need to
 * find.
 */
export function editVendorApplication(
  application: VendorApplication,
  patch: Partial<VendorApplicationDraft>,
  by: { author: OnboardingAuthor; authorName: string; note?: string | null },
  now = Date.now(),
): VendorApplication {
  const edited = appendVendorEvent(
    application,
    { kind: "edited", author: by.author, authorName: by.authorName, body: by.note ?? null },
    now,
  );
  return {
    ...edited,
    owner: patch.owner ?? edited.owner,
    business: patch.business ?? edited.business,
    restaurant: patch.restaurant ?? edited.restaurant,
    hours: patch.hours ?? edited.hours,
    delivery: patch.delivery ?? edited.delivery,
    documents: patch.documents
      ? documentChecklist(VENDOR_DOCUMENTS, patch.documents)
      : edited.documents,
    payout: patch.payout ?? edited.payout,
    branches: patch.branches ?? edited.branches,
  };
}

// ---------------------------------------------------------------------------
// Approval → a catalog listing
// ---------------------------------------------------------------------------

/**
 * The `Vendor` an approved application becomes.
 *
 * Only called for an application with no `vendorId` — a seeded restaurant already
 * has its listing and approval only changes its status. The numbers a listing
 * cannot have yet are zero rather than invented: a brand-new restaurant has no
 * rating, no reviews and is neither featured nor trending, and a seeded 4.5 would
 * be the "independent fake number" §5.4 forbids.
 *
 * `logo`/`cover` are empty strings. The dashboard never renders them and a minted
 * listing is not in the discovery catalog, so nothing shows a broken image — and an
 * invented stock photograph would be a picture of somebody else's restaurant.
 */
export function vendorFromApplication(
  application: VendorApplication,
  now = Date.now(),
): Vendor {
  const iso = new Date(now).toISOString();
  const { restaurant, delivery } = application;
  return {
    id: `ven_${slugify(restaurant.name)}_${Math.floor(now / 1000).toString(36)}`,
    slug: slugify(restaurant.name),
    type: application.business.vendorType,
    ownerId: application.ownerId,
    name: restaurant.name,
    tagline: restaurant.tagline,
    description: restaurant.description,
    logo: "",
    cover: "",
    cuisineIds: restaurant.cuisineIds,
    dietary: [],
    priceLevel: restaurant.priceLevel,
    rating: 0,
    reviewCount: 0,
    location: restaurant.location,
    distanceKm: 0,
    etaMinutes: delivery.etaMinutes,
    deliveryFee: delivery.deliveryFee,
    minOrder: delivery.minOrder,
    freeDeliveryOver: delivery.freeDeliveryOver,
    hours: application.hours,
    isOpen: true,
    isFeatured: false,
    isTrending: false,
    promoLabel: null,
    currency: "BDT",
    // Null means "the standard rate for this vendor type", resolved by
    // `lib/settlement.commissionRateFor`. A negotiated rate is a negotiation, and
    // nobody has had one with an applicant who signed up this morning.
    commissionRate: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/** Documents in the order the reviewer's checklist shows them. */
export function vendorDocumentChecklist(
  application: VendorApplication,
): OnboardingDocument[] {
  return documentChecklist(VENDOR_DOCUMENTS, application.documents);
}

/** Is every document this restaurant provided currently valid? */
export function vendorDocumentsValid(
  application: VendorApplication,
  now = Date.now(),
): boolean {
  return application.documents
    .filter((d) => d.status !== "missing")
    .every((d) => isDocumentValid(d, now));
}

/**
 * A reviewer's ruling on one document.
 *
 * Its own function rather than an `editVendorApplication` with a documents patch,
 * because the log entry is different in kind: "who verified the trade licence, and
 * when" is a question a compliance review asks, and it should not be indistinguishable
 * from somebody correcting a phone number.
 */
export function reviewVendorDocument(
  application: VendorApplication,
  kind: VendorDocumentKind,
  status: OnboardingDocument["status"],
  by: { authorName: string; note?: string | null },
  now = Date.now(),
): VendorApplication {
  const documents = reviewDocument(application.documents, kind, status, by.note ?? null);
  return appendVendorEvent(
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
