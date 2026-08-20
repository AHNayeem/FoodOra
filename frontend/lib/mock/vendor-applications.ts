import type {
  OnboardingDocument,
  Vendor,
  VendorApplication,
  VendorDocumentKind,
  VendorStatus,
} from "@/types";
import {
  VENDOR_DOCUMENTS,
  createVendorApplication,
  decideVendorApplication,
  type VendorApplicationDraft,
} from "@/lib/vendor-onboarding";
import { submittedDocument } from "@/lib/onboarding";
import { slugify } from "@/lib/utils";
import { vendors } from "./vendors";

/**
 * vendor-applications.ts — the restaurant onboarding records the prototype opens
 * with (Phase 6, G08/G09/G12).
 *
 * Seeded for the same reason the orders and the tickets are: an approval queue with
 * nothing in it demonstrates nothing, and a reviewer should not have to fill in an
 * eight-step form before they can see the admin surface work.
 *
 * Four properties, and the first two are the ones that matter:
 *
 *  - **Every catalog restaurant has one.** `Vendor` deliberately has no status
 *    field, so this is where a listing's onboarding state lives — and if the 24
 *    seeded restaurants had no record, "what is this vendor's status" would need a
 *    default, which is a second answer waiting to disagree with the first.
 *  - **They are built by the domain.** Every record here comes out of
 *    `createVendorApplication` and is walked with `moveVendorApplication` /
 *    `decideVendorApplication`, so a seeded application and one a restaurant files
 *    are the same shape with the same event log. Nothing is hand-assembled.
 *  - **The paperwork is synthesised from the listing, and says so.** A seeded
 *    restaurant has no real trade licence, so one is derived from its slug. It is
 *    obviously a demo number rather than a plausible-looking fake.
 *  - **Deterministic given `now`.** Same device, same reload, same queue.
 */

const DAY = 24 * 60 * 60_000;

/** A reviewer name for the seeded decisions, so the log has a person on it. */
const REVIEWER = "Nusrat Jahan";

/**
 * Restaurants that are *not* simply live, and why.
 *
 * Bella Napoli is deliberately absent: it is the demo dashboard's restaurant, and
 * suspending it would make the owner login land on a locked door instead of the
 * dashboard every other phase's validation walks through.
 */
const SUSPENDED_SEEDS: Record<string, string> = {
  ven_naan_stop:
    "Suspended pending a food-safety re-inspection after three hygiene complaints in one week.",
};

/** Documents a seeded, long-live restaurant is assumed to have on file. */
function verifiedDocuments(slug: string, now: number): OnboardingDocument[] {
  const licence = `TL-${slugify(slug).toUpperCase().replace(/-/g, "").slice(0, 8)}`;
  return VENDOR_DOCUMENTS.map((kind) => ({
    ...submittedDocument(kind, `${licence}-${kind}`, now - 200 * DAY),
    status: "verified" as const,
    // Only the documents that actually lapse carry an expiry — a national ID and
    // a photograph of the premises do not.
    expiresAt:
      kind === "trade-licence" || kind === "food-safety"
        ? new Date(now + 300 * DAY).toISOString()
        : null,
  }));
}

/** The application a seeded catalog listing would have produced. */
function draftFromVendor(vendor: Vendor, now: number): VendorApplicationDraft {
  const ref = slugify(vendor.slug).toUpperCase().replace(/-/g, "").slice(0, 8);
  return {
    owner: {
      name: vendor.ownerId ? "Tanvir Hossain" : `${vendor.name} Management`,
      email: `owner@${vendor.slug}.example.com`,
      phone: "+8801711000002",
      nationalId: `NID-${ref}`,
    },
    business: {
      legalName: `${vendor.name} Ltd.`,
      tradeLicence: `TL-${ref}`,
      tin: `TIN-${ref}`,
      bin: `BIN-${ref}`,
      vendorType: vendor.type,
      yearsTrading: 4,
    },
    restaurant: {
      name: vendor.name,
      tagline: vendor.tagline,
      description: vendor.description,
      cuisineIds: vendor.cuisineIds,
      priceLevel: vendor.priceLevel,
      location: vendor.location,
      phone: "+8801711000002",
      email: `hello@${vendor.slug}.example.com`,
    },
    hours: vendor.hours,
    delivery: {
      offersDelivery: true,
      offersPickup: true,
      deliveryFee: vendor.deliveryFee,
      minOrder: vendor.minOrder,
      freeDeliveryOver: vendor.freeDeliveryOver,
      etaMinutes: vendor.etaMinutes,
      zoneIds: ["dzn_gulshan"],
    },
    documents: verifiedDocuments(vendor.slug, now),
    payout: {
      method: "bank-transfer",
      provider: "BRAC Bank",
      accountName: `${vendor.name} Ltd.`,
      accountNumber: `15${ref.replace(/\D/g, "").padEnd(6, "0").slice(0, 6)}0091`,
      branch: "Gulshan",
    },
    branches: [],
  };
}

/**
 * One brand-new application to seed — a restaurant that is *not* in the catalog.
 *
 * These are what the pending queue is actually for. They carry no `vendorId`, so
 * approving one mints the listing, which is the path a real application takes and
 * the one a reviewer should be able to walk end to end in the demo.
 */
interface FreshSpec {
  key: string;
  status: VendorStatus;
  ageDays: number;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  legalName: string;
  restaurantName: string;
  tagline: string;
  description: string;
  cuisineIds: string[];
  priceLevel: 1 | 2 | 3 | 4;
  address: string;
  /** Documents left out on purpose — the reason the application is stuck. */
  withhold?: VendorDocumentKind[];
  /** The reviewer's sentence, for a refusal. */
  note?: string;
}

const FRESH: FreshSpec[] = [
  {
    key: "kacchi_bari",
    status: "pending",
    ageDays: 2,
    ownerName: "Shahriar Kabir",
    ownerEmail: "shahriar@kacchibari.example.com",
    ownerPhone: "+8801712345601",
    legalName: "Kacchi Bari Restaurant Ltd.",
    restaurantName: "Kacchi Bari",
    tagline: "Old Dhaka kacchi, cooked the long way",
    description:
      "A family kitchen from Nazira Bazar cooking mutton kacchi biryani in sealed clay pots over charcoal, the way it has been made in the neighbourhood for forty years.",
    cuisineIds: ["cus_bengali", "cus_indian"],
    priceLevel: 2,
    address: "12 Nazira Bazar Road, Old Dhaka",
  },
  {
    key: "seoul_kitchen",
    status: "pending",
    ageDays: 5,
    ownerName: "Minji Park",
    ownerEmail: "minji@seoulkitchen.example.com",
    ownerPhone: "+8801712345602",
    legalName: "Seoul Kitchen BD Ltd.",
    restaurantName: "Seoul Kitchen",
    tagline: "Korean comfort food in Banani",
    description:
      "Bibimbap, army stew and Korean fried chicken from a two-cook kitchen off Banani 11, with kimchi fermented on the premises.",
    cuisineIds: ["cus_japanese"],
    priceLevel: 3,
    address: "House 42, Road 11, Banani",
    // The pending queue needs one application a reviewer must chase rather than
    // simply approve — otherwise "approve" is the only button anybody presses.
    withhold: ["food-safety", "premises-photo"],
  },
  {
    key: "midnight_shawarma",
    status: "rejected",
    ageDays: 12,
    ownerName: "Rezaul Karim",
    ownerEmail: "rezaul@midnightshawarma.example.com",
    ownerPhone: "+8801712345603",
    legalName: "Midnight Shawarma",
    restaurantName: "Midnight Shawarma",
    tagline: "Shawarma until 4am",
    description:
      "A late-night shawarma counter near the Mohakhali bus terminal, open from nine in the evening until the last bus leaves.",
    cuisineIds: ["cus_indian"],
    priceLevel: 1,
    address: "Terminal Road, Mohakhali",
    note: "The trade licence names a different premises from the address on the application. Send the licence for this address and we will look again.",
  },
  {
    key: "the_greenhouse",
    status: "draft",
    ageDays: 1,
    ownerName: "Farhana Islam",
    ownerEmail: "farhana@greenhouse.example.com",
    ownerPhone: "+8801712345604",
    legalName: "The Greenhouse Cafe",
    restaurantName: "The Greenhouse",
    tagline: "Plant-forward plates and slow coffee",
    description:
      "A glasshouse cafe in Dhanmondi serving vegetarian bowls, house-fermented sodas and single-origin filter coffee.",
    cuisineIds: ["cus_italian"],
    priceLevel: 2,
    address: "Road 27, Dhanmondi",
    withhold: ["bank-statement", "food-safety", "premises-photo"],
  },
];

function freshDraft(spec: FreshSpec, now: number): VendorApplicationDraft {
  const ref = slugify(spec.key).toUpperCase().replace(/-/g, "").slice(0, 8);
  const withheld = new Set(spec.withhold ?? []);
  return {
    owner: {
      name: spec.ownerName,
      email: spec.ownerEmail,
      phone: spec.ownerPhone,
      nationalId: `NID-${ref}`,
    },
    business: {
      legalName: spec.legalName,
      tradeLicence: `TL-${ref}`,
      tin: `TIN-${ref}`,
      bin: null,
      vendorType: "restaurant",
      yearsTrading: 1,
    },
    restaurant: {
      name: spec.restaurantName,
      tagline: spec.tagline,
      description: spec.description,
      cuisineIds: spec.cuisineIds,
      priceLevel: spec.priceLevel,
      location: {
        lat: 23.7806,
        lng: 90.4152,
        address: spec.address,
        city: "Dhaka",
        countryCode: "BD",
      },
      phone: spec.ownerPhone,
      email: spec.ownerEmail,
    },
    hours: {
      mon: { open: "11:00", close: "23:00" },
      tue: { open: "11:00", close: "23:00" },
      wed: { open: "11:00", close: "23:00" },
      thu: { open: "11:00", close: "23:00" },
      fri: { open: "11:00", close: "23:59" },
      sat: { open: "11:00", close: "23:59" },
      sun: { open: "12:00", close: "22:00" },
    },
    delivery: {
      offersDelivery: true,
      offersPickup: true,
      deliveryFee: 60,
      minOrder: 250,
      freeDeliveryOver: 900,
      etaMinutes: [30, 45],
      zoneIds: ["dzn_gulshan"],
    },
    documents: VENDOR_DOCUMENTS.filter((kind) => !withheld.has(kind)).map((kind) =>
      submittedDocument(kind, `${ref}-${kind}`, now - spec.ageDays * DAY),
    ),
    payout: {
      method: "mobile-wallet",
      provider: "bKash",
      accountName: spec.ownerName,
      accountNumber: spec.ownerPhone.replace("+88", ""),
      branch: null,
    },
    branches: [],
  };
}

/**
 * Build the onboarding record set.
 *
 * Walked forward through the domain rather than constructed at its destination: a
 * seeded approved restaurant has a submit event *and* an approval event, dated
 * apart, because that is what its history was. A record that appeared already
 * approved would have an empty log, and the admin's log panel would look broken on
 * exactly the rows a reviewer opens first.
 */
export function buildVendorApplications(now = Date.now()): VendorApplication[] {
  const seeded = vendors
    .filter((v) => !v.deletedAt)
    .map((vendor, index) => {
      // Spread the seeded history so the list has a believable ordering rather
      // than 24 records sharing one timestamp.
      const submitted = now - (400 + index * 3) * DAY;
      const created = createVendorApplication(
        {
          draft: draftFromVendor(vendor, now),
          ownerId: vendor.ownerId,
          vendorId: vendor.id,
          submit: true,
          by: vendor.name,
        },
        submitted,
      );
      const approved = decideVendorApplication(
        created,
        { decision: "approve", by: REVIEWER },
        submitted + 2 * DAY,
      ).application;

      const suspension = SUSPENDED_SEEDS[vendor.id];
      if (!suspension) return approved;
      return decideVendorApplication(
        approved,
        { decision: "suspend", note: suspension, by: REVIEWER },
        now - 6 * DAY,
      ).application;
    });

  const fresh = FRESH.map((spec) => {
    const at = now - spec.ageDays * DAY;
    const created = createVendorApplication(
      {
        draft: freshDraft(spec, now),
        ownerId: null,
        submit: spec.status !== "draft",
        by: spec.ownerName,
      },
      at,
    );
    if (spec.status === "draft" || spec.status === "pending") return created;
    // A rejection is a decision on a submitted application, so it is walked as
    // one — the log has to show the submit it was refusing.
    return decideVendorApplication(
      created,
      { decision: "reject", note: spec.note ?? "", by: REVIEWER },
      at + 3 * DAY,
    ).application;
  });

  return [...fresh, ...seeded];
}
