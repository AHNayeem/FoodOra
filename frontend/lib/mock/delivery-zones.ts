import type { DeliveryZone } from "@/types";
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
 * in a residential one are not the same hour. Maps onto the future
 * `DeliveryZone` model, where an admin edits these values.
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
  },
];

export const zoneById = new Map(deliveryZones.map((z) => [z.id, z]));
