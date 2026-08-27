/**
 * geo.js — straight-line distance, the other field §3 row 4 forbids storing.
 *
 * `Vendor.distanceKm` depends on **who is asking**, which is the whole reason
 * `catalog.prisma` refuses to keep a column for it: two customers looking at the
 * same restaurant are different distances from it, so a stored value is wrong for
 * everyone except the last person it was computed for.
 *
 * Straight-line and not routed. `VendorBranch.deliveryRadiusKm` is documented as
 * "max straight-line distance served", `ZoneArea`'s centroids are the same
 * measure, and the frontend's cards say "1.2 km" rather than "6 min by road" — so
 * the honest answer here is the one the rest of the system is already written
 * against. A routing provider is module 10's business, if it is anyone's.
 */

/** Mean Earth radius, km — the sphere the haversine formula assumes. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** A pair of finite numbers in range, or null. Anything else is not a point. */
export function toPoint(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

/**
 * Great-circle distance in km, rounded to one decimal.
 *
 * One decimal because that is the precision the cards render ("1.2 km") and
 * because more of it would be a false claim: a branch's coordinates are its
 * front door at best, and the customer's origin is a map pin.
 *
 * Either point missing → `null`, never `0`. A caller that sent no coordinates
 * gets "unknown", and a zero would read as "you are standing in the kitchen".
 */
export function distanceKm(from, to) {
  if (!from || !to) return null;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 10) / 10;
}
