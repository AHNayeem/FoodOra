import type { Rider } from "@/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * riders.ts — the delivery fleet (Phase C18; spec: Delivery Partner,
 * Registration, Verification).
 *
 * `userId` links a rider to a demo account exactly as `Vendor.ownerId` links a
 * restaurant to its owner: `rid_rakib` belongs to `rider@foodora.dev`, which is
 * how the rider app resolves "me". The other two have no login — they exist so
 * the fleet is not a fleet of one, and so a zone other than Gulshan has someone
 * in it.
 *
 * Note this is a different entity from `lib/mock/couriers.ts`: a `Courier` is the
 * thin snapshot the customer's tracker shows (name, vehicle, rating), while a
 * `Rider` is the working record the rider app runs on — zone, documents,
 * acceptance rate. Real deployments keep both for the same reason: one is public.
 */
export const riders: Rider[] = [
  {
    ...base,
    id: "rid_rakib",
    userId: "usr_rider",
    name: "Rakib Islam",
    phone: "+8801711000003",
    photo:
      "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?auto=format&fit=crop&w=160&q=80",
    vehicle: "bike",
    plate: "DHA-M-1284",
    zoneId: "dzn_gulshan",
    rating: 4.9,
    trips: 1284,
    acceptanceRate: 0.92,
    onTimeRate: 0.96,
    joinedAt: "2025-03-14T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "licence", status: "verified", expiresAt: "2028-01-31T00:00:00.000Z" },
      { kind: "vehicle-registration", status: "verified", expiresAt: "2027-06-30T00:00:00.000Z" },
      // One document still in review — the profile screen has a real state to show.
      { kind: "insurance", status: "pending", expiresAt: null },
    ],
  },
  {
    ...base,
    id: "rid_shanto",
    userId: null,
    name: "Shanto Ahmed",
    phone: "+8801922334455",
    photo: null,
    vehicle: "scooter",
    plate: "DHA-L-5521",
    zoneId: "dzn_dhanmondi",
    rating: 4.8,
    trips: 973,
    acceptanceRate: 0.88,
    onTimeRate: 0.94,
    joinedAt: "2025-07-02T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "licence", status: "verified", expiresAt: "2027-09-30T00:00:00.000Z" },
      { kind: "vehicle-registration", status: "verified", expiresAt: "2026-12-31T00:00:00.000Z" },
      { kind: "insurance", status: "verified", expiresAt: "2026-11-30T00:00:00.000Z" },
    ],
  },
  {
    ...base,
    id: "rid_jamil",
    userId: null,
    name: "Jamil Uddin",
    phone: "+8801733445566",
    photo: null,
    vehicle: "bicycle",
    // A bicycle has nothing to register.
    plate: null,
    zoneId: "dzn_uttara",
    rating: 4.7,
    trips: 612,
    acceptanceRate: 0.81,
    onTimeRate: 0.9,
    joinedAt: "2026-01-20T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "insurance", status: "expired", expiresAt: "2026-06-30T00:00:00.000Z" },
    ],
  },
  // The fleet below exists so dispatch has somebody to pick (and, when a rider
  // hands a job back, somebody else to pick) in every zone. Three riders made a
  // reassignment demo impossible in two of the three zones.
  {
    ...base,
    id: "rid_tanvir",
    userId: null,
    name: "Tanvir Hossain",
    phone: "+8801844556677",
    photo: null,
    vehicle: "bike",
    plate: "DHA-M-3390",
    zoneId: "dzn_gulshan",
    rating: 4.85,
    trips: 1105,
    acceptanceRate: 0.9,
    onTimeRate: 0.95,
    joinedAt: "2025-05-08T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "licence", status: "verified", expiresAt: "2029-04-30T00:00:00.000Z" },
      { kind: "vehicle-registration", status: "verified", expiresAt: "2028-02-28T00:00:00.000Z" },
      { kind: "insurance", status: "verified", expiresAt: "2027-03-31T00:00:00.000Z" },
    ],
  },
  {
    ...base,
    id: "rid_sumaiya",
    userId: null,
    name: "Sumaiya Akter",
    phone: "+8801955667788",
    photo: null,
    vehicle: "scooter",
    plate: "DHA-L-7712",
    zoneId: "dzn_dhanmondi",
    rating: 4.95,
    trips: 842,
    acceptanceRate: 0.94,
    onTimeRate: 0.97,
    joinedAt: "2025-09-16T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "licence", status: "verified", expiresAt: "2028-08-31T00:00:00.000Z" },
      { kind: "vehicle-registration", status: "verified", expiresAt: "2027-10-31T00:00:00.000Z" },
      { kind: "insurance", status: "verified", expiresAt: "2027-01-31T00:00:00.000Z" },
    ],
  },
  {
    ...base,
    id: "rid_nayeem",
    userId: null,
    name: "Nayeem Sarker",
    phone: "+8801766778899",
    photo: null,
    vehicle: "car",
    plate: "DHA-GA-2245",
    zoneId: "dzn_uttara",
    rating: 4.6,
    trips: 388,
    acceptanceRate: 0.76,
    onTimeRate: 0.88,
    joinedAt: "2026-03-02T09:00:00.000Z",
    documents: [
      { kind: "national-id", status: "verified", expiresAt: null },
      { kind: "licence", status: "verified", expiresAt: "2030-01-31T00:00:00.000Z" },
      { kind: "vehicle-registration", status: "pending", expiresAt: null },
    ],
  },
];

export const riderById = new Map(riders.map((r) => [r.id, r]));
export const riderByUserId = new Map(
  riders.filter((r) => r.userId).map((r) => [r.userId as string, r]),
);
