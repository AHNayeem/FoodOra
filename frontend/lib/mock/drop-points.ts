/**
 * drop-points.ts — where a zone's deliveries actually go.
 *
 * Residential coordinates per zone, extracted from the trip synthesiser so two
 * callers can share one geography (G39): the synthesised offer pool places its
 * invented drops here, and the bridge that turns a *real* order into a trip
 * resolves the customer's area to the same point. Without that, the same
 * neighbourhood would sit at two different coordinates and a real delivery would
 * be paid a different distance from a synthesised one beside it.
 *
 * A typed address carries no coordinates in this prototype (`DeliveryAddress` is
 * a postal snapshot), so the area label is the only geography a real order has.
 * Matching it here is honest about that: the answer is the *area's* centre, not
 * the doorstep. Phase E geocodes at checkout and every caller keeps working.
 */
export interface DropPoint {
  area: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Coordinates are inside each zone, so routes look like the rides a courier in
 * that part of Dhaka would make (and a zone's trips never wander into another
 * zone's streets).
 */
export const DROP_POINTS: Record<string, DropPoint[]> = {
  dzn_gulshan: [
    { area: "Gulshan 1", address: "House 42, Road 11", lat: 23.7793, lng: 90.4165 },
    { area: "Gulshan 2", address: "House 7, Road 53", lat: 23.7948, lng: 90.4172 },
    { area: "Banani", address: "Flat 4B, House 21, Road 6", lat: 23.7942, lng: 90.4009 },
    { area: "Baridhara", address: "Block J, Road 8", lat: 23.8062, lng: 90.4238 },
    { area: "Bashundhara R/A", address: "Block C, Road 3", lat: 23.8156, lng: 90.4362 },
    { area: "Niketan", address: "House 63, Road 4", lat: 23.7771, lng: 90.4121 },
    { area: "Mohakhali", address: "DOHS Road 5, House 318", lat: 23.7801, lng: 90.3998 },
    { area: "Badda", address: "Link Road, Ranavola", lat: 23.7838, lng: 90.4271 },
  ],
  dzn_dhanmondi: [
    { area: "Dhanmondi", address: "House 55, Road 27", lat: 23.7566, lng: 90.3729 },
    { area: "Dhanmondi", address: "House 12, Road 8/A", lat: 23.7452, lng: 90.3736 },
    { area: "Kalabagan", address: "Lake Circus, 2nd floor", lat: 23.7495, lng: 90.3841 },
    { area: "Mohammadpur", address: "Block D, Shyamoli", lat: 23.7671, lng: 90.3603 },
    { area: "Lalmatia", address: "Block B, House 4", lat: 23.7602, lng: 90.3672 },
    { area: "Shantinagar", address: "Chamelibagh, House 19", lat: 23.7398, lng: 90.4135 },
    { area: "Tejgaon", address: "Nakhalpara, Road 2", lat: 23.7657, lng: 90.3921 },
  ],
  dzn_uttara: [
    { area: "Uttara Sector 4", address: "House 18, Road 12", lat: 23.8628, lng: 90.3985 },
    { area: "Uttara Sector 7", address: "House 3, Road 35", lat: 23.8741, lng: 90.3812 },
    { area: "Mirpur 10", address: "Block B, Senpara", lat: 23.8072, lng: 90.3691 },
    { area: "Pallabi", address: "Block D, Road 5", lat: 23.8248, lng: 90.3652 },
    { area: "Kalshi", address: "Housing Estate, Building 7", lat: 23.8291, lng: 90.3789 },
  ],
};

/** Every drop point, flattened — the lookup table for a free-text area. */
const ALL_POINTS: DropPoint[] = Object.values(DROP_POINTS).flat();

/**
 * The point that best represents a free-text area label, or null when nothing
 * in the seed covers it. Matched both ways round so "Uttara" finds "Uttara
 * Sector 4" and "Gulshan 2" finds itself — a customer types an area the way they
 * say it, not the way a zone lists it.
 */
export function dropPointFor(area: string | null | undefined): DropPoint | null {
  const needle = area?.trim().toLowerCase();
  if (!needle) return null;
  return (
    ALL_POINTS.find((p) => p.area.toLowerCase() === needle) ??
    ALL_POINTS.find(
      (p) =>
        p.area.toLowerCase().includes(needle) || needle.includes(p.area.toLowerCase()),
    ) ??
    null
  );
}
