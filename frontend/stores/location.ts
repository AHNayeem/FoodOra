"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryZone, SavedAddress } from "@/types";

/**
 * location store — where the customer says they are (Phase 17, G37).
 *
 * The prototype had nowhere to put this, which is why every distance on every
 * card was measured from one fixed point in Gulshan and why the delivery zones —
 * the same rows dispatch and the rider payout read — were never consulted by a
 * customer-facing surface at all.
 *
 * Two fields and no cleverness: the **area label** the customer chose, and where
 * that choice came from. The zone is *derived* (`zoneForArea`) rather than stored,
 * for the reason `stuckReason` is derived from the clock — a stored zone id is a
 * second fact that can disagree with the first, and nothing would be responsible
 * for correcting it if the zone's areas were ever edited.
 *
 * `zones` is reference data, not preference: it is loaded from
 * `services/delivery.getDeliveryZones` and deliberately **not** persisted, so a
 * device cannot answer "do you deliver here" out of a stale copy of the network.
 * Everything else follows the same hydration contract as the other stores.
 */
interface LocationState {
  /** The area label, e.g. "Banani". Null until the customer says. */
  area: string | null;
  /** A friendlier name for it where there is one — a saved address's label. */
  label: string | null;
  /** Where the choice came from, so the picker can show what is selected. */
  source: "address" | "area" | null;
  /** The delivery network. Reference data — never persisted. */
  zones: DeliveryZone[];
  hydrated: boolean;

  seedZones: (zones: DeliveryZone[]) => void;
  /** Choose an area from the picker's list. */
  setArea: (area: string) => void;
  /** Choose one of the customer's saved addresses. */
  setFromAddress: (address: SavedAddress) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useLocation = create<LocationState>()(
  persist(
    (set) => ({
      area: null,
      label: null,
      source: null,
      zones: [],
      hydrated: false,

      seedZones: (zones) => set({ zones }),
      setArea: (area) => set({ area, label: null, source: "area" }),
      setFromAddress: (address) =>
        set({ area: address.area, label: address.label, source: "address" }),
      clear: () => set({ area: null, label: null, source: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-location",
      partialize: (s) => ({ area: s.area, label: s.label, source: s.source }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
