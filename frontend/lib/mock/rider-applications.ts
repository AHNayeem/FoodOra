import type {
  OnboardingDocument,
  Rider,
  RiderApplication,
  RiderDocumentKind,
  RiderStatus,
  RiderVehicle,
} from "@/types";
import {
  RIDER_DOCUMENTS,
  createRiderApplication,
  decideRiderApplication,
  type RiderApplicationDraft,
} from "@/lib/rider-onboarding";
import { submittedDocument } from "@/lib/onboarding";
import { slugify } from "@/lib/utils";
import { riders } from "./riders";

/**
 * rider-applications.ts — the courier onboarding records the prototype opens with
 * (Phase 7, G10/G11/G13).
 *
 * The mirror of `vendor-applications`, with the same three rules: every seeded
 * rider has a record (so `Rider` needs no status field and there is one answer to
 * "may dispatch use this courier"), every record is walked through the domain's own
 * functions, and the whole set is deterministic given `now`.
 *
 * The one thing worth reading carefully is which seeded riders are *not* simply
 * approved, and what that costs. Dispatch prefers riders in the drop's zone, so
 * taking a courier out of a two-rider zone leaves that zone with one — enough for
 * dispatch to work and enough to demonstrate the gate, which is the point. Rakib is
 * deliberately left approved: he is the demo rider login, and locking him out would
 * break every rider-app flow the earlier phases validated.
 */

const DAY = 24 * 60 * 60_000;

const REVIEWER = "Nusrat Jahan";

/**
 * Seeded riders who are not `approved`, and why.
 *
 * Jamil's insurance expired in the fleet seed, so a suspension is the state that
 * record was already describing. Sumaiya is `inactive` — nobody did anything wrong,
 * she stopped taking shifts — which is the distinction the extra status exists for.
 */
const SEEDED_OVERRIDES: Record<
  string,
  { decision: "suspend" | "deactivate"; note: string }
> = {
  rid_jamil: {
    decision: "suspend",
    note: "Insurance lapsed in June. Upload a current certificate and we will reinstate the account.",
  },
  rid_sumaiya: {
    decision: "deactivate",
    note: "Stopped taking shifts in July at her own request.",
  },
};

/**
 * The fleet record's own document kinds, in application vocabulary.
 *
 * `Rider.documents` already says what each seeded courier has on file — including
 * Jamil's expired insurance certificate — so the application is *projected* from it
 * rather than invented alongside it. Deriving it the other way round would let the
 * two disagree, and the fleet record is the one the rider app already renders.
 */
const FROM_FLEET_KIND: Record<string, RiderDocumentKind> = {
  "national-id": "national-id",
  licence: "driving-licence",
  "vehicle-registration": "vehicle-registration",
  insurance: "insurance",
};

/** Documents an established rider has on file, as their application recorded them. */
function fleetDocuments(rider: Rider, now: number): OnboardingDocument[] {
  const ref = slugify(rider.name).toUpperCase().replace(/-/g, "").slice(0, 8);
  const projected = rider.documents.map((document) => {
    const kind = FROM_FLEET_KIND[document.kind];
    const lapsed = document.status === "expired";
    return {
      ...submittedDocument(kind, `${ref}-${kind}`, now - 300 * DAY),
      status:
        document.status === "verified"
          ? ("verified" as const)
          : lapsed
            ? ("expired" as const)
            : ("pending" as const),
      expiresAt: document.expiresAt,
    };
  });
  // Every rider also has a photograph; the fleet record keeps it as `photo`
  // rather than as a document, so it is added here.
  return [
    ...projected,
    {
      ...submittedDocument("profile-photo", `${ref}-profile-photo`, now - 300 * DAY),
      status: "verified" as const,
    },
  ];
}

function draftFromRider(rider: Rider, now: number): RiderApplicationDraft {
  const ref = slugify(rider.name).toUpperCase().replace(/-/g, "").slice(0, 8);
  const motorised = rider.vehicle !== "bicycle";
  return {
    personal: {
      name: rider.name,
      // Derived from the fleet record's join date so the seed has no second
      // opinion about how long this rider has been with the platform.
      dateOfBirth: new Date(Date.parse(rider.joinedAt) - 27 * 365 * DAY)
        .toISOString()
        .slice(0, 10),
      nationalId: `NID-${ref}`,
      address: `${rider.zoneId.replace("dzn_", "")} area, Dhaka`,
      area: rider.zoneId.replace("dzn_", ""),
      city: "Dhaka",
    },
    contact: {
      phone: rider.phone,
      email: `${slugify(rider.name)}@rider.example.com`,
    },
    emergency: {
      name: `${rider.name.split(" ")[0]}'s family contact`,
      relationship: "Sibling",
      phone: `+8801${(700000000 + rider.name.length * 137).toString().slice(0, 9)}`,
    },
    vehicleInfo: {
      vehicle: rider.vehicle,
      plate: rider.plate,
      model: vehicleModel(rider.vehicle),
      licenceNumber: motorised ? `DL-${ref}` : null,
    },
    zoneId: rider.zoneId,
    documents: fleetDocuments(rider, now),
    payout: {
      method: "mobile-wallet",
      provider: "bKash",
      accountName: rider.name,
      accountNumber: rider.phone.replace("+88", ""),
      branch: null,
    },
  };
}

/** A plausible make/model per vehicle, so the reviewer's screen is not empty. */
function vehicleModel(vehicle: RiderVehicle): string | null {
  switch (vehicle) {
    case "bike":
      return "Bajaj Pulsar 150";
    case "scooter":
      return "TVS Ntorq 125";
    case "car":
      return "Toyota Axio";
    case "bicycle":
      return null;
  }
}

/** One brand-new application — a courier who is not in the fleet yet. */
interface FreshRiderSpec {
  key: string;
  status: RiderStatus;
  ageDays: number;
  name: string;
  phone: string;
  email: string;
  area: string;
  zoneId: string;
  vehicle: RiderVehicle;
  plate: string | null;
  ageYears: number;
  withhold?: RiderDocumentKind[];
  note?: string;
}

const FRESH: FreshRiderSpec[] = [
  {
    key: "sabbir",
    status: "pending",
    ageDays: 1,
    name: "Sabbir Rahman",
    phone: "+8801812345671",
    email: "sabbir@rider.example.com",
    area: "Badda",
    zoneId: "dzn_gulshan",
    vehicle: "bike",
    plate: "DHA-M-8841",
    ageYears: 24,
  },
  {
    key: "nusaiba",
    status: "pending",
    ageDays: 4,
    name: "Nusaiba Haque",
    phone: "+8801812345672",
    email: "nusaiba@rider.example.com",
    area: "Mohammadpur",
    zoneId: "dzn_dhanmondi",
    vehicle: "scooter",
    plate: "DHA-L-9932",
    ageYears: 22,
    // Waiting on the one document a motorised application cannot be approved
    // without — so the queue has an application that must be chased, not just
    // rubber-stamped.
    withhold: ["driving-licence"],
  },
  {
    key: "arif",
    status: "rejected",
    ageDays: 15,
    name: "Arif Chowdhury",
    phone: "+8801812345673",
    email: "arif@rider.example.com",
    area: "Mirpur",
    zoneId: "dzn_uttara",
    vehicle: "bike",
    plate: "DHA-M-1120",
    ageYears: 31,
    note: "The licence submitted expired in 2024. Send a current one and we will review the application again.",
  },
  {
    key: "tuhin",
    status: "draft",
    ageDays: 1,
    name: "Tuhin Mia",
    phone: "+8801812345674",
    email: "tuhin@rider.example.com",
    area: "Uttara Sector 7",
    zoneId: "dzn_uttara",
    vehicle: "bicycle",
    plate: null,
    ageYears: 19,
    withhold: ["profile-photo"],
  },
];

function freshDraft(spec: FreshRiderSpec, now: number): RiderApplicationDraft {
  const ref = slugify(spec.key).toUpperCase().slice(0, 8);
  const withheld = new Set(spec.withhold ?? []);
  const motorised = spec.vehicle !== "bicycle";
  const kinds = (motorised
    ? RIDER_DOCUMENTS
    : (["national-id", "profile-photo"] as RiderDocumentKind[])
  ).filter((kind) => !withheld.has(kind));

  return {
    personal: {
      name: spec.name,
      dateOfBirth: new Date(now - spec.ageYears * 365.25 * DAY).toISOString().slice(0, 10),
      nationalId: `NID-${ref}`,
      address: `${spec.area}, Dhaka`,
      area: spec.area,
      city: "Dhaka",
    },
    contact: { phone: spec.phone, email: spec.email },
    emergency: {
      name: `${spec.name.split(" ")[0]}'s next of kin`,
      relationship: "Parent",
      phone: spec.phone.replace(/\d$/, "9"),
    },
    vehicleInfo: {
      vehicle: spec.vehicle,
      plate: spec.plate,
      model: vehicleModel(spec.vehicle),
      licenceNumber: motorised ? `DL-${ref}` : null,
    },
    zoneId: spec.zoneId,
    documents: kinds.map((kind) =>
      submittedDocument(
        kind,
        `${ref}-${kind}`,
        now - spec.ageDays * DAY,
        kind === "driving-licence" || kind === "insurance"
          ? new Date(now + 500 * DAY).toISOString()
          : null,
      ),
    ),
    payout: {
      method: "mobile-wallet",
      provider: "Nagad",
      accountName: spec.name,
      accountNumber: spec.phone.replace("+88", ""),
      branch: null,
    },
  };
}

/**
 * Build the fleet's onboarding records.
 *
 * Walked forward through the domain, exactly as the vendor seed is: an approved
 * rider has a submit event and an approval event, dated apart, and a suspended one
 * has the suspension on top of both — so the reviewer's log panel shows a history
 * rather than a single row on the records somebody opens first.
 */
export function buildRiderApplications(now = Date.now()): RiderApplication[] {
  const seeded = riders
    .filter((r) => !r.deletedAt)
    .map((rider) => {
      const submitted = Date.parse(rider.joinedAt) - 5 * DAY;
      const created = createRiderApplication(
        {
          draft: draftFromRider(rider, now),
          userId: rider.userId,
          riderId: rider.id,
          submit: true,
          by: rider.name,
        },
        submitted,
      );
      const approved = decideRiderApplication(
        created,
        { decision: "approve", by: REVIEWER },
        submitted + 3 * DAY,
      ).application;

      const override = SEEDED_OVERRIDES[rider.id];
      if (!override) return approved;
      return decideRiderApplication(
        approved,
        { decision: override.decision, note: override.note, by: REVIEWER },
        now - 20 * DAY,
      ).application;
    });

  const fresh = FRESH.map((spec) => {
    const at = now - spec.ageDays * DAY;
    const created = createRiderApplication(
      {
        draft: freshDraft(spec, now),
        userId: null,
        submit: spec.status !== "draft",
        by: spec.name,
      },
      at,
    );
    if (spec.status === "draft" || spec.status === "pending") return created;
    return decideRiderApplication(
      created,
      { decision: "reject", note: spec.note ?? "", by: REVIEWER },
      at + 4 * DAY,
    ).application;
  });

  return [...fresh, ...seeded];
}
