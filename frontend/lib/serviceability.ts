import type { CartVendor, DeliveryAddress, DeliveryZone } from "@/types";
import { haversineKm } from "./delivery";

/**
 * serviceability.ts — "do we deliver there, and can *this* restaurant?"
 * (Phase 17, G37).
 *
 * The prototype had no answer to either question. Distance was measured from one
 * hard-coded point in Gulshan for every visitor (`services/catalog`'s
 * `DEFAULT_ORIGIN`), and `lib/mock/delivery-zones` — which dispatch and the rider
 * payout have always read — was never consulted by a customer-facing surface at
 * all. So a customer in an area no courier works could fill a basket, check out,
 * and only discover the problem when nobody came.
 *
 * Two rules, and keeping them separate is the point:
 *
 *  1. **Is the area on the network?** It is if it resolves to a delivery zone.
 *     A zone is where riders work, so an address outside every zone is one the
 *     platform cannot serve at any price.
 *  2. **Does this restaurant reach it?** Always, if the restaurant is in the same
 *     zone. Otherwise only if it is within that zone's `deliveryRadiusKm` of the
 *     zone centre — the cross-zone allowance, which is data on the zone rather
 *     than a constant here, for the same reason its fares are.
 *
 * Pure, and free of the seed: the zones are injected, exactly as
 * `lib/delivery-bridge` takes the zone it prices against. `lib/mock/delivery-zones`
 * binds `zoneForArea` to the seeded list, which is how dispatch and the storefront
 * are guaranteed the same answer — the rule has one implementation and it is this
 * one.
 *
 * Phase 19 (G30) changed *which* zones get injected and nothing else here. Callers
 * now pass the folded network — the seed with the platform's own settings applied —
 * so an area an operator removed stops matching and a zone they narrowed starts
 * refusing restaurants that used to reach it. That this file needed no change to
 * absorb that is the argument for the zones having been a parameter all along.
 */

// ---------------------------------------------------------------------------
// Matching an area to a zone
// ---------------------------------------------------------------------------

/** Non-letters either side, so "Banani" does not match "Bananiville". */
function boundedIndexOf(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return true;
    from = at + 1;
  }
}

/**
 * The zone an address label belongs to, or null if it is outside all of them.
 *
 * Three degrees of match, in order, because the same function has to cope with
 * three kinds of label:
 *
 *  - **Exact** — `DeliveryAddress.area` is picked from the zone's own list.
 *  - **The label contains a zone area** — a restaurant's address line reads
 *    "Gulshan Ave, Gulshan 1" and the zone knows "Gulshan 1".
 *  - **A zone area contains the label** — a customer typed "Uttara" and the zone
 *    lists "Uttara Sector 4".
 *
 * Both loose forms are word-bounded, so a partial word never matches. The seed's
 * neighbourhood spellings used to be a hand-written regular expression per zone
 * (`dzn_gulshan`, `dzn_dhanmondi`, `dzn_uttara`), which could only ever describe
 * the three zones somebody had written it for; this describes any zone from its
 * own `areas`.
 */
export function zoneForArea(
  zones: readonly DeliveryZone[],
  area: string | null | undefined,
): DeliveryZone | null {
  const needle = area?.trim().toLowerCase();
  if (!needle) return null;

  const exact = zones.find((zone) =>
    zone.areas.some((name) => name.toLowerCase() === needle),
  );
  if (exact) return exact;

  return (
    zones.find((zone) =>
      zone.areas.some((name) => {
        const label = name.toLowerCase();
        return boundedIndexOf(needle, label) || boundedIndexOf(label, needle);
      }),
    ) ?? null
  );
}

/**
 * Every area the platform serves, flattened for a picker.
 *
 * Sorted by name rather than by zone, because a customer looking for "Banani"
 * does not know or care which zone it is in — the zone comes back on the entry
 * so the picker can say who covers it.
 */
export function servedAreas(
  zones: readonly DeliveryZone[],
): Array<{ area: string; zone: DeliveryZone }> {
  return zones
    .flatMap((zone) => zone.areas.map((area) => ({ area, zone })))
    .sort((a, b) => a.area.localeCompare(b.area));
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Why a delivery cannot happen, as an i18n key suffix. `null` when it can.
 *
 * `unknown` is deliberately not a refusal: it means the question could not be
 * asked — a basket persisted before this phase carries no restaurant location —
 * and a surface that blocked on it would be refusing orders on the strength of
 * missing data (§5.4). It reads as "we could not check", and nothing gates on it.
 */
export type ServiceabilityReason =
  /** Nobody has said where they are yet. */
  | "noLocation"
  /** The area is outside every delivery zone. */
  | "outsideNetwork"
  /** On the network, but this restaurant is too far from it. */
  | "tooFar"
  /** Not enough information to decide. */
  | "unknown";

export interface ServiceabilityCheck {
  /** Can this be delivered? False only for a reason we can actually stand behind. */
  serviceable: boolean;
  /** The zone the drop is in, when it is in one. */
  zone: DeliveryZone | null;
  /** Distance from the restaurant to the zone centre, km; null when unknown. */
  distanceKm: number | null;
  reason: ServiceabilityReason | null;
}

const SERVED: ServiceabilityCheck = {
  serviceable: true,
  zone: null,
  distanceKm: null,
  reason: null,
};

/**
 * Is `area` on the network at all? The platform-level question, asked without a
 * restaurant in mind — what the location picker and the checkout address field
 * need.
 */
export function checkArea(
  zones: readonly DeliveryZone[],
  area: string | null | undefined,
): ServiceabilityCheck {
  if (!area?.trim()) {
    return { serviceable: false, zone: null, distanceKm: null, reason: "noLocation" };
  }
  const zone = zoneForArea(zones, area);
  if (!zone) {
    return { serviceable: false, zone: null, distanceKm: null, reason: "outsideNetwork" };
  }
  return { ...SERVED, zone };
}

/**
 * Can this restaurant deliver to this area?
 *
 * The full question: the area has to be on the network *and* the restaurant has
 * to reach it. A restaurant in the drop's own zone always reaches it — that is
 * what a zone is — so the distance only decides the cross-zone case.
 */
export function checkVendorDelivery(
  zones: readonly DeliveryZone[],
  vendor: Pick<CartVendor, "location">,
  area: string | null | undefined,
): ServiceabilityCheck {
  const base = checkArea(zones, area);
  if (!base.serviceable || !base.zone) return base;

  const location = vendor.location;
  if (!location) return { ...base, reason: "unknown" };

  const vendorZone = zoneForArea(zones, location.place);
  if (vendorZone?.id === base.zone.id) return base;

  const distanceKm = haversineKm(location, { lat: base.zone.lat, lng: base.zone.lng });
  return distanceKm <= base.zone.deliveryRadiusKm
    ? { ...base, distanceKm }
    : { serviceable: false, zone: base.zone, distanceKm, reason: "tooFar" };
}

/** The same question asked of a delivery address rather than a bare area label. */
export function checkAddressDelivery(
  zones: readonly DeliveryZone[],
  vendor: Pick<CartVendor, "location">,
  address: Pick<DeliveryAddress, "area"> | null,
): ServiceabilityCheck {
  return checkVendorDelivery(zones, vendor, address?.area);
}
