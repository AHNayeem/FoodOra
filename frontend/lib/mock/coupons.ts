import type { Coupon, CouponClaim, Offer } from "@/types";
import { SEED_NOW } from "./cuisines";
import { buildOffers } from "./offers";
import { hashSeed, mulberry32 } from "./rng";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null, pausedAt: null };

const DAY = 86_400_000;

/**
 * Coupons (Phase C21) — the redeemable tickets behind `/account/coupons`.
 *
 * The catalogue is assembled from two sources, and deliberately not written out
 * twice:
 *
 * 1. **Campaign coupons are minted from the C20 offer seed.** Every offer that
 *    carries a `code` is claimable, so the terms on the deals page and the terms
 *    on the ticket in a wallet are the *same row* — they cannot drift apart. The
 *    minting rule lives in `couponFromOffer` below.
 * 2. **Granted coupons** — a welcome gift, a referral reward, an apology credit
 *    after a late delivery, a birthday freebie, a loyalty cashback — have no
 *    campaign behind them. They are seeded here and are *not* claimable: their
 *    code identifies the ticket, it does not hand it out.
 *
 * Like offers, windows are stored as **day offsets** and stamped by
 * `buildCoupons(now)`, so the wallet always has live tickets (and one that just
 * expired) no matter when the prototype is opened, and the seed never reads the
 * clock.
 */
type CouponSeed = Omit<Coupon, "startsAt" | "endsAt"> & {
  /** Days before now the coupon opened (negative = in the past). */
  startsInDays: number;
  /** Days from now it expires (negative = already expired). */
  endsInDays: number;
};

/**
 * How many times one customer may spend a campaign code. A first-order code is
 * obviously once; everything else is a small book of tickets rather than an
 * unlimited discount, which is how real campaign codes are issued.
 */
function usageLimitFor(offer: Offer): number {
  return offer.firstOrderOnly ? 1 : 3;
}

/**
 * Mint the coupon behind an advertised code. The offer owns the rule; the
 * coupon adds only what a *held* ticket needs — a usage limit, a source, and
 * the fact that it can be claimed by anyone who knows the code.
 *
 * The id is derived from the offer's (`off_x` → `cpn_x`), so the deals page can
 * tell whether a campaign is already in a customer's wallet without a lookup.
 */
export function couponIdForOffer(offerId: string): string {
  return `cpn_${offerId.replace(/^off_/, "")}`;
}

function couponFromOffer(offer: Offer): Coupon {
  return {
    id: couponIdForOffer(offer.id),
    code: offer.code!,
    title: offer.title,
    description: offer.description,
    kind: offer.kind,
    value: offer.value,
    maxDiscount: offer.maxDiscount,
    minOrder: offer.minOrder,
    currency: offer.currency,
    scope: offer.scope,
    vendorIds: offer.vendorIds,
    categorySlugs: offer.categorySlugs,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    usageLimit: usageLimitFor(offer),
    firstOrderOnly: offer.firstOrderOnly,
    source: "campaign",
    claimable: true,
    // A campaign is live or it is not; a *pause* is a decision the platform desk
    // takes afterwards and it lives in `stores/campaigns` (Phase 12), never in
    // the catalogue the coupon was minted from.
    pausedAt: null,
    terms: offer.terms,
    offerId: offer.id,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    deletedAt: offer.deletedAt,
  };
}

/**
 * Granted coupons — issued to an account, not advertised. Between them they
 * cover every kind the engine prices (fixed, free delivery, cashback,
 * percentage) and every status the wallet renders (active, expiring, expired),
 * so the UI has something real to show in each state on a first visit.
 */
const GRANTED_SEEDS: CouponSeed[] = [
  {
    id: "cpn_referral_reward",
    code: "REF-KX9F",
    title: "Referral reward",
    description:
      "Rezwana joined on your invite and placed her first order — here's ৳200 off yours.",
    kind: "fixed",
    value: 200,
    maxDiscount: null,
    minOrder: 700,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -4,
    endsInDays: 26,
    usageLimit: 1,
    firstOrderOnly: false,
    source: "referral",
    claimable: false,
    terms: [
      "One reward per friend who completes their first order.",
      "Applies to the food subtotal, not delivery or tips.",
    ],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_late_apology",
    code: "SORRY-150",
    title: "Sorry your order ran late",
    description:
      "Your Bangkok House order arrived 34 minutes past its estimate. This one's on us.",
    kind: "fixed",
    value: 150,
    maxDiscount: null,
    minOrder: 0,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -2,
    endsInDays: 12,
    usageLimit: 1,
    firstOrderOnly: false,
    source: "apology",
    claimable: false,
    terms: ["Issued by support for order FO-4K21XZ.", "Valid on any vendor."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_birthday_delivery",
    code: "BDAY-FREE",
    title: "Birthday delivery, on us",
    description: "No delivery fee on anything you order this week. Many happy returns.",
    kind: "free-delivery",
    value: 0,
    maxDiscount: null,
    minOrder: 0,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -1,
    endsInDays: 2,
    usageLimit: 2,
    firstOrderOnly: false,
    source: "birthday",
    claimable: false,
    terms: ["Delivery orders only.", "Two uses during your birthday week."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_loyalty_cashback",
    code: "LOYAL-5",
    title: "5% back for a hundred orders",
    description:
      "You've ordered a hundred times. Every order this month pays 5% back into your wallet.",
    kind: "cashback",
    value: 5,
    maxDiscount: 250,
    minOrder: 500,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -6,
    endsInDays: 24,
    usageLimit: 10,
    firstOrderOnly: false,
    source: "loyalty",
    claimable: false,
    terms: [
      "Cashback lands in your wallet when the order is delivered.",
      "Maximum ৳250 back per order.",
    ],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_welcome_gift",
    code: "HELLO-15",
    title: "Welcome to FoodOra",
    description: "15% off your first week with us — a small thank-you for signing up.",
    kind: "percentage",
    value: 15,
    maxDiscount: 200,
    minOrder: 400,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -21,
    endsInDays: -2,
    usageLimit: 1,
    firstOrderOnly: false,
    source: "welcome",
    claimable: false,
    terms: ["Valid for 14 days after sign-up."],
    offerId: null,
    ...base,
  },
];

/**
 * Platform campaigns that are **not** advertised on `/offers` (Phase 12, G28).
 *
 * The offer catalogue mints the codes the deals page shows; these are the ones
 * the platform hands out another way — a launch code printed on a flyer in a new
 * city, a seasonal free-delivery window announced by SMS, a category push that
 * has already finished. They exist for the same reason the vendor seeds do: the
 * admin campaign board has to open on real rows in every state it can render,
 * and a board whose "scheduled" and "ended" tabs are empty on a first visit
 * teaches a reviewer nothing.
 *
 * `source: "campaign"` and `claimable: true` put them on the platform board and
 * in the customer's claimable rail — they are the platform's to fund, start and
 * stop, which is exactly what `lib/coupons.isPlatformCampaign` tests for.
 */
const PLATFORM_SEEDS: CouponSeed[] = [
  {
    id: "cpn_plat_new_city",
    code: "CTG25",
    title: "Chattogram launch week",
    description: "We've just opened in Chattogram — 25% off your first order there.",
    kind: "percentage",
    value: 25,
    maxDiscount: 300,
    minOrder: 300,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -5,
    endsInDays: 9,
    usageLimit: 1,
    firstOrderOnly: true,
    source: "campaign",
    claimable: true,
    terms: ["First order only.", "Maximum ৳300 off."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_plat_iftar_delivery",
    code: "IFTAR0",
    title: "Iftar delivery on us",
    description: "No delivery fee on iftar orders over ৳500, every evening of the campaign.",
    kind: "free-delivery",
    value: 0,
    maxDiscount: null,
    minOrder: 500,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    // Scheduled: the board needs a campaign that has been approved and has not
    // opened yet, because that is the one a desk most often has to pull.
    startsInDays: 4,
    endsInDays: 18,
    usageLimit: 5,
    firstOrderOnly: false,
    source: "campaign",
    claimable: true,
    terms: ["Delivery orders over ৳500.", "Five uses per customer."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_plat_weekend_treat",
    code: "WEEKEND10",
    title: "Weekend cashback",
    description: "10% of every weekend order back into your wallet, up to ৳200.",
    kind: "cashback",
    value: 10,
    maxDiscount: 200,
    minOrder: 600,
    currency: "BDT",
    scope: "platform",
    vendorIds: [],
    categorySlugs: [],
    startsInDays: -9,
    endsInDays: 21,
    usageLimit: 4,
    firstOrderOnly: false,
    source: "campaign",
    claimable: true,
    terms: ["Cashback lands in your wallet when the order is delivered."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_plat_biryani_hundred",
    code: "BIRYANI100",
    title: "৳100 off biryani",
    description: "A hundred taka off any biryani order over ৳800.",
    kind: "fixed",
    value: 100,
    maxDiscount: null,
    minOrder: 800,
    currency: "BDT",
    scope: "category",
    vendorIds: [],
    categorySlugs: ["biryani"],
    // Finished a week ago: the board's "ended" tab, and the proof that a closed
    // campaign keeps its performance rather than disappearing.
    startsInDays: -40,
    endsInDays: -6,
    usageLimit: 2,
    firstOrderOnly: false,
    source: "campaign",
    claimable: true,
    terms: ["Biryani orders over ৳800."],
    offerId: null,
    ...base,
  },
];

/**
 * Coupons a vendor issued from their own dashboard. These belong to the
 * merchant surface (`/dashboard/coupons`) rather than the deals page: a
 * restaurant hands the code out on a flyer or a receipt, so it is claimable but
 * never advertised platform-wide.
 */
const VENDOR_SEEDS: CouponSeed[] = [
  {
    id: "cpn_ven_bella_lunch",
    code: "BELLALUNCH",
    title: "Lunch at Bella Napoli",
    description: "15% off pizzas ordered before 4pm, straight from our counter card.",
    kind: "percentage",
    value: 15,
    maxDiscount: 250,
    minOrder: 500,
    currency: "BDT",
    scope: "vendor",
    vendorIds: ["ven_bella_napoli"],
    categorySlugs: [],
    startsInDays: -12,
    endsInDays: 18,
    usageLimit: 3,
    firstOrderOnly: false,
    source: "vendor",
    claimable: true,
    terms: ["Dine-in, pickup and delivery.", "Not valid with another code."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_ven_bella_family",
    code: "NAPOLI300",
    title: "৳300 off a family order",
    description: "Feeding the whole table? Take ৳300 off any order over ৳2,000.",
    kind: "fixed",
    value: 300,
    maxDiscount: null,
    minOrder: 2000,
    currency: "BDT",
    scope: "vendor",
    vendorIds: ["ven_bella_napoli"],
    categorySlugs: [],
    startsInDays: -30,
    endsInDays: -3,
    usageLimit: 1,
    firstOrderOnly: false,
    source: "vendor",
    claimable: true,
    terms: ["One per household per campaign."],
    offerId: null,
    ...base,
  },
  {
    id: "cpn_ven_bella_freeship",
    code: "NAPOLIRIDE",
    title: "Free delivery week",
    description: "We're covering the rider for every Bella Napoli order this week.",
    kind: "free-delivery",
    value: 0,
    maxDiscount: null,
    minOrder: 700,
    currency: "BDT",
    scope: "vendor",
    vendorIds: ["ven_bella_napoli"],
    categorySlugs: [],
    startsInDays: 2,
    endsInDays: 16,
    usageLimit: 2,
    firstOrderOnly: false,
    source: "vendor",
    claimable: true,
    terms: ["Delivery orders over ৳700.", "Starts Monday."],
    offerId: null,
    ...base,
  },
];

function stamp(seed: CouponSeed, now: number): Coupon {
  const { startsInDays, endsInDays, ...coupon } = seed;
  return {
    ...coupon,
    startsAt: new Date(now + startsInDays * DAY).toISOString(),
    endsAt: new Date(now + endsInDays * DAY).toISOString(),
  };
}

/**
 * The whole redeemable catalogue at an instant: every advertised code, plus the
 * granted and vendor-issued tickets. `services/coupons.ts` is the only caller —
 * it owns the clock, exactly as the offers service does.
 */
export function buildCoupons(now: number): Coupon[] {
  const fromOffers = buildOffers(now)
    .filter((offer) => offer.code !== null && !offer.deletedAt)
    .map(couponFromOffer);
  const seeded = [...GRANTED_SEEDS, ...PLATFORM_SEEDS, ...VENDOR_SEEDS].map((seed) =>
    stamp(seed, now),
  );
  return [...fromOffers, ...seeded];
}

/**
 * What the demo account already holds the first time the wallet is opened: the
 * four granted tickets, an expired welcome gift, and one campaign code that has
 * been claimed and spent — so the wallet's three tabs all have something in them
 * before the customer claims anything.
 *
 * Claim timestamps are offsets too, and the spent one carries a real redemption
 * row pointing at an order number from the seeded history.
 */
export function buildCouponClaims(now: number): CouponClaim[] {
  const at = (days: number) => new Date(now + days * DAY).toISOString();

  return [
    { couponId: "cpn_referral_reward", claimedAt: at(-4), via: "granted", redemptions: [] },
    { couponId: "cpn_late_apology", claimedAt: at(-2), via: "granted", redemptions: [] },
    { couponId: "cpn_birthday_delivery", claimedAt: at(-1), via: "granted", redemptions: [] },
    { couponId: "cpn_loyalty_cashback", claimedAt: at(-6), via: "granted", redemptions: [] },
    { couponId: "cpn_welcome_gift", claimedAt: at(-21), via: "granted", redemptions: [] },
    {
      couponId: "cpn_sweet_tooth",
      claimedAt: at(-9),
      via: "code",
      // Spent to its usage limit, so the wallet has a "used" ticket to show.
      redemptions: [
        {
          orderId: "ord_seed_sweet_1",
          orderNumber: "FO-7C42A9",
          discount: 150,
          deliveryWaived: 0,
          cashback: 0,
          currency: "BDT",
          redeemedAt: at(-8),
        },
        {
          orderId: "ord_seed_sweet_2",
          orderNumber: "FO-7D93B1",
          discount: 150,
          deliveryWaived: 0,
          cashback: 0,
          currency: "BDT",
          redeemedAt: at(-6),
        },
        {
          orderId: "ord_seed_sweet_3",
          orderNumber: "FO-8A11C4",
          discount: 150,
          deliveryWaived: 0,
          cashback: 0,
          currency: "BDT",
          redeemedAt: at(-3),
        },
      ],
    },
  ];
}

/**
 * What the platform desk has already decided about the campaign catalogue
 * (Phase 12) — one deactivated campaign, so `/admin/coupons` opens with a
 * *reversible* decision on screen rather than only a create button.
 *
 * It is a **desk decision, not catalogue data**, which is why it is a separate
 * builder that `stores/campaigns` seeds itself from: the same shape any pause
 * made on this device takes, so the seeded row and a row a reviewer pauses
 * themselves are indistinguishable to every reader.
 */
export function buildCampaignDeskSeed(now: number): { paused: Record<string, string> } {
  return {
    paused: { cpn_plat_weekend_treat: new Date(now - 2 * DAY).toISOString() },
  };
}

/** How a coupon has performed across all customers (merchant dashboard). */
export interface CouponPerformance {
  redemptions: number;
  discountGiven: number;
  revenue: number;
}

/**
 * Synthesise a coupon's redemption history deterministically from its id and the
 * days it has been live — the C10 pattern. A code that opened a month ago has
 * more redemptions than one that opened yesterday, and a reload never reshuffles
 * the numbers.
 */
export function buildCouponPerformance(coupon: Coupon, now: number): CouponPerformance {
  const openedMs = Math.min(now, Date.parse(coupon.endsAt)) - Date.parse(coupon.startsAt);
  const daysLive = Math.max(0, Math.floor(openedMs / DAY));
  if (daysLive === 0) return { redemptions: 0, discountGiven: 0, revenue: 0 };

  const rand = mulberry32(hashSeed(coupon.id));
  let redemptions = 0;
  let discountGiven = 0;
  let revenue = 0;

  for (let day = 0; day < daysLive; day++) {
    // Between 0 and 5 redemptions a day, weighted low — most days are quiet.
    const count = Math.floor(rand() ** 2 * 6);
    for (let i = 0; i < count; i++) {
      // Baskets cluster just above the minimum the coupon unlocks at.
      const basket = Math.round(Math.max(coupon.minOrder, 400) * (1 + rand() * 0.9));
      const off =
        coupon.kind === "percentage"
          ? Math.min((basket * coupon.value) / 100, coupon.maxDiscount ?? Infinity)
          : coupon.kind === "fixed"
            ? Math.min(coupon.value, basket)
            : coupon.kind === "free-delivery"
              ? 60
              : 0;
      redemptions++;
      revenue += basket;
      discountGiven += Math.round(off);
    }
  }
  return { redemptions, discountGiven, revenue };
}
