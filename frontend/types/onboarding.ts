import type {
  BaseEntity,
  GeoPoint,
  ISODate,
  RiderVehicle,
  VendorType,
  WeeklyHours,
} from "./common";

/**
 * onboarding.ts — how a restaurant or a rider joins the platform (Phases 6–7,
 * G08–G13).
 *
 * Before this, `/partner` and `/rider` were pitch pages whose call to action was
 * `/register`: a restaurant could "sign up" and land on a dashboard belonging to
 * somebody else's flagship listing, and a rider could not apply at all. There was
 * no application, no documents, no approval and no way for the platform to say no.
 *
 * The shape follows the same three rules as `Order` and `SupportTicket`:
 *
 *  - **One lifecycle, one authority.** The spec gives a single status list per
 *    side, so there is exactly one union per side and the *application record*
 *    carries it. `Vendor` and `Rider` deliberately gain no status field: a second
 *    copy on the catalog row is a second answer to "is this restaurant live", and
 *    the two would disagree within a session.
 *  - **The event log is the truth.** `status` is where an application got to;
 *    `events` is what happened — who submitted, who reviewed, what they said. A
 *    rejection with no reason is not a rejection, so the reason lives on the event
 *    that caused it as well as on the record.
 *  - **Documents are records, not booleans.** Each has a kind, a state and an
 *    expiry, because "verified" today and "expired next March" are the same
 *    document and a boolean cannot say so.
 *
 * Both applications share `OnboardingEvent`, `OnboardingDocument` and
 * `PayoutAccount` — the paperwork is the same paperwork, and a reviewer's log
 * should read identically on either queue.
 */

// ---------------------------------------------------------------------------
// Shared paperwork
// ---------------------------------------------------------------------------

/**
 * State of one submitted document.
 *
 * `missing` exists so a required document that was never uploaded is a *record*
 * rather than an absent array entry — a reviewer needs to see the gap, and a
 * checklist built from what happens to be present cannot show one.
 */
export type DocumentStatus = "missing" | "pending" | "verified" | "rejected" | "expired";

/** Documents the platform asks a restaurant for. */
export type VendorDocumentKind =
  | "trade-licence"
  | "national-id"
  | "tin-certificate"
  | "bank-statement"
  | "food-safety"
  | "premises-photo";

/** Documents the platform asks a rider for. */
export type RiderDocumentKind =
  | "national-id"
  | "driving-licence"
  | "vehicle-registration"
  | "insurance"
  | "profile-photo";

export type OnboardingDocumentKind = VendorDocumentKind | RiderDocumentKind;

export interface OnboardingDocument {
  kind: OnboardingDocumentKind;
  status: DocumentStatus;
  /** Reference/filename the applicant gave. Null while the document is missing. */
  reference: string | null;
  /** Expiry for documents that have one; null otherwise. */
  expiresAt: ISODate | null;
  /** Why a reviewer refused it. Null unless `status` is `rejected`. */
  note: string | null;
  uploadedAt: ISODate | null;
}

/** How the platform pays a partner what it owes them. */
export type PayoutMethod = "bank-transfer" | "mobile-wallet";

/**
 * Where settlements and earnings are sent.
 *
 * Deliberately not validated against a real bank: the prototype has no payment
 * provider, and a fake IBAN check would make the field look more trustworthy than
 * it is. What *is* enforced is that the fields a payout run would need are all
 * present before an application can be submitted.
 */
export interface PayoutAccount {
  method: PayoutMethod;
  /** Bank name, or the mobile-wallet provider ("bKash", "Nagad"). */
  provider: string;
  accountName: string;
  accountNumber: string;
  /** Branch/routing number — bank transfers only. */
  branch: string | null;
}

/** Who did something to an application. */
export type OnboardingAuthor = "applicant" | "reviewer" | "system";

export type OnboardingEventKind =
  /** The applicant saved a draft or edited a field. */
  | "edited"
  /** Sent for review. */
  | "submitted"
  /** A reviewer's decision. */
  | "decision"
  /** A document's state changed. */
  | "document"
  /** Prose a reviewer or applicant added. */
  | "note";

/** One thing that happened to an application. Append-only, oldest first. */
export interface OnboardingEvent {
  id: string;
  kind: OnboardingEventKind;
  author: OnboardingAuthor;
  /** Display name of whoever did it. */
  authorName: string;
  /** The status the application moved into (`kind: "submitted"` / `"decision"`). */
  status: OnboardingStatus | null;
  /** What was written — a rejection reason, a reviewer's note. */
  body: string | null;
  /** The document this concerns (`kind: "document"`). */
  document: OnboardingDocumentKind | null;
  at: ISODate;
}

/**
 * The union of both lifecycles.
 *
 * The spec lists five states for a restaurant and six for a rider — the rider's
 * extra `inactive` is a partner who is approved but not currently working, which a
 * restaurant expresses through the storefront's online switch instead. Keeping one
 * type with two allowed subsets (`VENDOR_STATUSES`, `RIDER_STATUSES` in
 * `lib/onboarding`) means the shared event, chip and log code is written once.
 */
export type OnboardingStatus =
  /** Started, not sent. Only the applicant sees it. */
  | "draft"
  /** Sent for review, waiting on the platform. */
  | "pending"
  /** Live. */
  | "approved"
  /** Refused, with a reason. */
  | "rejected"
  /** Was live, stopped by the platform. */
  | "suspended"
  /** Approved but not working — riders only. */
  | "inactive";

/** A restaurant's lifecycle, exactly as the spec lists it. */
export type VendorStatus = Exclude<OnboardingStatus, "inactive">;

/** A rider's lifecycle, exactly as the spec lists it. */
export type RiderStatus = OnboardingStatus;

// ---------------------------------------------------------------------------
// Restaurant application (Phase 6, G08/G09/G12)
// ---------------------------------------------------------------------------

/** Who is applying, as a person rather than as a business. */
export interface VendorOwnerInfo {
  name: string;
  email: string;
  phone: string;
  /** National ID / passport number — the identity the licence is checked against. */
  nationalId: string;
}

/** The legal entity behind the restaurant. */
export interface VendorBusinessInfo {
  /** Registered name, which is often not the trading name. */
  legalName: string;
  tradeLicence: string;
  /** Tax identification number. */
  tin: string;
  /** VAT/BIN registration, where the business has one. */
  bin: string | null;
  /** Which kind of vendor this becomes on approval. */
  vendorType: VendorType;
  yearsTrading: number;
}

/** The listing being applied for — everything the storefront needs. */
export interface VendorProfileDraft {
  name: string;
  tagline: string;
  description: string;
  cuisineIds: string[];
  priceLevel: 1 | 2 | 3 | 4;
  location: GeoPoint;
  phone: string;
  email: string;
}

/** How the restaurant wants to deliver. */
export interface VendorDeliveryDraft {
  /** Does the vendor deliver at all, or is it pickup-only? */
  offersDelivery: boolean;
  offersPickup: boolean;
  deliveryFee: number;
  minOrder: number;
  /** Order value above which delivery is free; null for never. */
  freeDeliveryOver: number | null;
  /** Preparation + travel estimate window, minutes. */
  etaMinutes: [number, number];
  /** Delivery zones the restaurant wants to serve (`dzn_*`). */
  zoneIds: string[];
}

/**
 * An additional outlet. The prototype's `Vendor` has one `location`, so branches
 * are recorded on the application rather than pretended into the catalog — a
 * branch that cannot take an order should not look like one that can.
 */
export interface VendorBranch {
  id: string;
  name: string;
  address: string;
  area: string;
  phone: string;
  hours: WeeklyHours | null;
}

/**
 * A restaurant's application and its onboarding state.
 *
 * Every restaurant on the platform has exactly one of these — the seeded catalog
 * included — so "what is this vendor's status" has one answer and the admin's
 * restaurant list and its pending-applications queue are the same rows filtered
 * differently.
 */
export interface VendorApplication extends BaseEntity {
  /** Human-facing reference, e.g. `RAP-8F3A21`. */
  applicationNumber: string;
  /**
   * The catalog listing this governs. Null for an application whose restaurant
   * does not exist yet; filled when approval mints one.
   */
  vendorId: string | null;
  /** The account that will manage it — how the dashboard resolves "my restaurant". */
  ownerId: string | null;
  status: VendorStatus;
  owner: VendorOwnerInfo;
  business: VendorBusinessInfo;
  restaurant: VendorProfileDraft;
  hours: WeeklyHours;
  delivery: VendorDeliveryDraft;
  documents: OnboardingDocument[];
  payout: PayoutAccount;
  branches: VendorBranch[];
  events: OnboardingEvent[];
  /** When it was sent for review; null while it is a draft. */
  submittedAt: ISODate | null;
  /** When a reviewer last decided it, either way. */
  decidedAt: ISODate | null;
  /** The reviewer account that decided. */
  decidedBy: string | null;
  /** The reason the customer-facing side is told — refusal or suspension. */
  decisionNote: string | null;
}

// ---------------------------------------------------------------------------
// Rider application (Phase 7, G10/G11/G13)
// ---------------------------------------------------------------------------

export interface RiderPersonalInfo {
  name: string;
  /** Plain "YYYY-MM-DD" — a date of birth has no time and no zone. */
  dateOfBirth: string;
  nationalId: string;
  /** Where the rider lives, for the zone they will be offered work in. */
  address: string;
  area: string;
  city: string;
}

export interface RiderContactInfo {
  phone: string;
  email: string;
}

/** Who to call if something happens on the road. */
export interface RiderEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface RiderVehicleInfo {
  vehicle: RiderVehicle;
  /** Plate/registration; null for a bicycle, which has nothing to register. */
  plate: string | null;
  /** Make and model as the rider described it. */
  model: string | null;
  /** Licence number — null for a bicycle, which needs none. */
  licenceNumber: string | null;
}

/**
 * A rider's application and their onboarding state.
 *
 * The same rule as the vendor side: every rider in the fleet has one, so the
 * admin's rider list and its applications queue are one set of rows, and dispatch
 * has a single fact to check before it hands somebody work.
 */
export interface RiderApplication extends BaseEntity {
  /** Human-facing reference, e.g. `DAP-8F3A21`. */
  applicationNumber: string;
  /** The fleet record this governs. Null until approval mints one. */
  riderId: string | null;
  /** The account that signs into the rider app. */
  userId: string | null;
  status: RiderStatus;
  personal: RiderPersonalInfo;
  contact: RiderContactInfo;
  emergency: RiderEmergencyContact;
  vehicleInfo: RiderVehicleInfo;
  /** Zone the rider is applying to work (`dzn_*`). */
  zoneId: string;
  documents: OnboardingDocument[];
  payout: PayoutAccount;
  events: OnboardingEvent[];
  submittedAt: ISODate | null;
  decidedAt: ISODate | null;
  decidedBy: string | null;
  decisionNote: string | null;
}
