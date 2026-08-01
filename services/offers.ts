import { buildOffers, couponIdForOffer, vendorById } from "@/lib/mock";
import type { Offer, OfferPlacement, Vendor } from "@/types";
import { mockDelay } from "./http";

/**
 * offers.ts — read API for promotions (spec: Offers, Coupons, Flash Deals).
 * Backend-ready async signatures over the mock seed; a real promotions service
 * drops in behind these same functions.
 *
 * The clock is read *here*, in the service, exactly as `vendor.ts` and `pos.ts`
 * do — never during a component render. Each getter returns the instant it
 * evaluated against alongside the data, so every "days left" and "ending soon"
 * decision on a page is derived from one consistent `nowMs`.
 */

/** An offer with the vendors it applies to already resolved, for display. */
export interface OfferWithVendors {
  offer: Offer;
  /** Empty for platform-wide offers. */
  vendors: Vendor[];
  /**
   * The claimable coupon minted from this campaign (Phase C21), or null when it
   * applies automatically. Resolved here so the card can offer "save to my
   * coupons" without knowing how a coupon id is derived.
   */
  couponId: string | null;
}

/** True when `nowMs` falls inside the offer's validity window. */
export function isOfferLive(offer: Offer, nowMs: number): boolean {
  return Date.parse(offer.startsAt) <= nowMs && nowMs < Date.parse(offer.endsAt);
}

/** Whole days remaining before an offer expires (0 once it has). */
export function daysRemaining(offer: Offer, nowMs: number): number {
  const ms = Date.parse(offer.endsAt) - nowMs;
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Resolve an offer's `vendorIds` to full vendors (FK lookup). */
function withVendors(offer: Offer): OfferWithVendors {
  return {
    offer,
    vendors: offer.vendorIds
      .map((id) => vendorById.get(id))
      .filter((v): v is Vendor => Boolean(v) && !v!.deletedAt),
    couponId: offer.code ? couponIdForOffer(offer.id) : null,
  };
}

/** Live offers grouped by placement, plus the instant they were evaluated at. */
export interface OfferBoard {
  /** The instant "live" was evaluated against — thread this into the cards. */
  nowMs: number;
  groups: Record<OfferPlacement, OfferWithVendors[]>;
  /** Total live offers across every group. */
  total: number;
}

/**
 * Every live offer, grouped by placement so the deals page can lay out flash
 * deals, featured banners, coupon codes and the long tail without re-filtering.
 */
export async function getOffers(): Promise<OfferBoard> {
  const nowMs = Date.now();
  const live = buildOffers(nowMs).filter((o) => !o.deletedAt && isOfferLive(o, nowMs));
  const groups: Record<OfferPlacement, OfferWithVendors[]> = {
    flash: [],
    featured: [],
    coupon: [],
    standard: [],
  };
  for (const offer of live) groups[offer.placement].push(withVendors(offer));

  // Soonest to expire first within each group — the useful ordering for deals.
  for (const list of Object.values(groups)) {
    list.sort((a, b) => Date.parse(a.offer.endsAt) - Date.parse(b.offer.endsAt));
  }
  return mockDelay({ nowMs, groups, total: live.length });
}

/** A flat list of live offers, soonest to expire first. */
export async function getLiveOffers(): Promise<{ nowMs: number; offers: OfferWithVendors[] }> {
  const nowMs = Date.now();
  const live = buildOffers(nowMs)
    .filter((o) => !o.deletedAt && isOfferLive(o, nowMs))
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
    .map(withVendors);
  return mockDelay({ nowMs, offers: live });
}

/** One offer by slug — `null` when unknown or soft-deleted. */
export async function getOfferBySlug(
  slug: string,
): Promise<{ nowMs: number; entry: OfferWithVendors } | null> {
  const nowMs = Date.now();
  const offer = buildOffers(nowMs).find((o) => o.slug === slug && !o.deletedAt);
  return mockDelay(offer ? { nowMs, entry: withVendors(offer) } : null);
}

/** Vendors currently running their own promotion, for the "deals near you" rail. */
export async function getPromoVendors(limit = 6): Promise<Vendor[]> {
  const list = Array.from(vendorById.values())
    .filter((v) => !v.deletedAt && v.promoLabel !== null)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return mockDelay(list);
}
