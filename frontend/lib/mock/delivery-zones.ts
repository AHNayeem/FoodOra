import type { DeliveryZone } from "@/types";
import { zoneForArea } from "../serviceability";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * delivery-zones.ts — the operating zones riders work in (Phase C18; spec:
 * Delivery Zones, Delivery Charges).
 *
 * Fares are **data**. A sprawling suburban zone pays more per kilometre and
 * lets riders hold more cash than a dense inner-city one, and none of that is a
 * branch in a component — the rider app reads whatever the rider's zone says.
 * Peak hours differ per zone too, because lunch in an office district and dinner
 * in a residential one are not the same hour.
 *
 * Phase 19 (G30) built the admin this file was waiting for. These rows are now the
 * **baseline**: an operator's edits to a zone's coverage, fares or cash ceiling —
 * and whether couriers work it at all — are a diff held in
 * `stores/platform-settings` and folded back here by
 * `lib/platform-settings.effectiveZones`. Two consequences worth knowing before
 * reading the callers:
 *
 *  - **`deliveryZones` and `zoneById` are the seed, not the network.** Live
 *    readers ask through the fold: `services/delivery.getDeliveryZones` (the open
 *    zones, for the storefront, the rider app and the application forms) or
 *    `stores/platform-settings.platformZones` (every zone, for dispatch and
 *    pricing). The two exports below are still the right thing to read where the
 *    *seed* is what is wanted — the synthesised week in `delivery-jobs`, and the
 *    baseline a patch is a diff against.
 *  - **A closed zone is marked, not removed.** It comes back from the fold with
 *    `deletedAt` set, which is the flag every reader here already filters on, so
 *    an order placed while the zone was open still prices.
 */
export const deliveryZones: DeliveryZone[] = [
  {
    ...base,
    id: "dzn_gulshan",
    name: "Gulshan – Banani – Baridhara",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    areas: [
      "Gulshan 1",
      "Gulshan 2",
      "Banani",
      "Baridhara",
      "Bashundhara R/A",
      "Mohakhali",
      "Niketan",
      "Badda",
    ],
    lat: 23.79,
    lng: 90.413,
    baseFare: 45,
    perKm: 12,
    peakMultiplier: 1.25,
    // Office lunch rush, then the long dinner peak.
    peakHours: [12, 13, 19, 20, 21],
    batchBonus: 25,
    cashLimit: 3000,
    // Dense and central: most of Dhaka's north sits inside this, which is why a
    // Dhanmondi kitchen can deliver here and an Uttara one cannot.
    deliveryRadiusKm: 8,
  },
  {
    ...base,
    id: "dzn_dhanmondi",
    name: "Dhanmondi – Mohammadpur",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    areas: [
      "Dhanmondi",
      "Kalabagan",
      "Mohammadpur",
      "Shantinagar",
      "Tejgaon",
      "Lalmatia",
    ],
    lat: 23.753,
    lng: 90.376,
    baseFare: 40,
    perKm: 11,
    peakMultiplier: 1.2,
    peakHours: [13, 14, 20, 21],
    batchBonus: 20,
    cashLimit: 2500,
    deliveryRadiusKm: 8,
  },
  {
    ...base,
    id: "dzn_uttara",
    name: "Uttara – Mirpur",
    city: "Dhaka",
    countryCode: "BD",
    currency: "BDT",
    areas: ["Uttara Sector 4", "Uttara Sector 7", "Mirpur 10", "Pallabi", "Kalshi"],
    lat: 23.85,
    lng: 90.376,
    // Longer rides between sectors, so distance pays more and cash runs higher.
    baseFare: 50,
    perKm: 14,
    peakMultiplier: 1.15,
    peakHours: [12, 13, 20],
    batchBonus: 30,
    cashLimit: 3500,
    // Further out and further apart, so a shorter cross-zone reach: a ride from
    // the middle of the city to Uttara is a different trip from one across it.
    deliveryRadiusKm: 7,
  },
];

export const zoneById = new Map(deliveryZones.map((z) => [z.id, z]));

/**
 * Which zone an area belongs to.
 *
 * Moved here from the orders store so dispatch, the rider app and the bridge
 * that turns a real order into a trip (G39) all answer it identically — three
 * copies of "which zone is Banani" is exactly how the two delivery realities
 * drifted apart in the first place.
 *
 * The matching *rule* moved once more in Phase 17 (G37), to
 * `lib/serviceability.zoneForArea`, because the storefront now asks the same
 * question before a basket exists and a second implementation would be a fourth
 * copy. This binds it to the seed's zones, so every existing caller is unchanged.
 *
 * A backend resolves this from coordinates; the labels are enough here because
 * the seed's zones are defined by exactly these names.
 */
export function zoneIdForArea(area: string | null | undefined): string | null {
  return zoneForArea(deliveryZones, area)?.id ?? null;
}
