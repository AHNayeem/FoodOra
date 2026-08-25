import type {
  CampaignRow,
  CampaignSegment,
  CampaignSort,
  CartLine,
  CartVendor,
  Coupon,
  CouponClaim,
  CouponContext,
  CouponEvaluation,
  CouponRedemption,
  CouponStatus,
  CouponVendorRef,
  FulfillmentType,
  HeldCoupon,
  Order,
  Vendor,
  VendorCouponRow,
} from "@/types";
import {
  buildCouponClaims,
  buildCouponPerformance,
  buildCoupons,
  categories,
  foodById,
  vendorById,
} from "@/lib/mock";
import { cartSubtotal, deliveryFeeFor } from "@/lib/cart";
import {
  couponStatus,
  daysLeft,
  evaluateCoupon,
  evaluateWallet,
  isGrantedCoupon,
  isPlatformCampaign,
  normaliseCode,
  remainingUses,
  sortHeld,
  toHeldCoupon,
  type CouponOption,
} from "@/lib/coupons";
import { mockDelay, ok, type Result } from "./http";

/**
 * coupons.ts — the coupon seam (Phase C21).
 *
 * Three responsibilities, all of which a real backend keeps on the server:
 *
 * 1. **It owns the clock.** Every getter stamps the catalogue at `Date.now()`
 *    and hands the instant it used back to the caller, so a wallet page and the
 *    checkout picker never disagree about whether a ticket is still live. No
 *    component reads the clock to decide this.
 * 2. **It owns the rules.** Claiming an unknown code, re-claiming one you
 *    already hold, spending a coupon past its limit or against the wrong vendor
 *    is refused *here*, with an i18n key — not by a disabled button. The refusal
 *    always comes from `lib/coupons.evaluateCoupon`, the same function the
 *    picker uses to decide what to offer, so the two cannot disagree.
 * 3. **It resolves the joins.** A claim stores a `couponId`; this turns that
 *    into terms, status and money. Ids that no longer resolve are dropped and
 *    counted rather than rendered as holes (the C23 favorites convention).
 *
 * The client hands over its cart, not a hand-assembled pricing context: the
 * subtotal, the delivery fee and the basket's categories are derived here, so a
 * component can never mis-state the basket a coupon was priced against.
 */

/** A wallet's worth of coupons, resolved at one instant. */
export interface CouponBook {
  /** The instant status was evaluated against — thread it into the cards. */
  nowMs: number;
  held: HeldCoupon[];
  /** Claimed ids that no longer resolve to a live coupon. */
  stale: number;
}

/** What the checkout hands over: the cart as it stands. */
export interface BasketInput {
  vendor: CartVendor;
  lines: CartLine[];
  fulfillment: FulfillmentType;
  /** The customer has never placed an order (drives first-order-only codes). */
  isFirstOrder: boolean;
}

/** A coupon on offer to a customer who does not hold it yet. */
export interface ClaimableCoupon {
  coupon: Coupon;
  vendors: CouponVendorRef[];
  daysLeft: number;
}

/** Every coupon in the wallet, priced against the current basket. */
export interface CouponPicker {
  nowMs: number;
  options: CouponOption[];
  /** The single best-value coupon that applies, or null. */
  best: CouponOption | null;
}

/** A coupon applied at checkout: the ticket, the verdict and the claim behind it. */
export interface AppliedCouponResult {
  coupon: Coupon;
  claim: CouponClaim;
  evaluation: CouponEvaluation;
  /** True when applying the code also added it to the wallet. */
  claimed: boolean;
}

/**
 * What the **platform desk** has done to the campaign catalogue (Phase 12, G28).
 *
 * The C16 `BookContext` / C18 `RiderContext` / C21 `VendorCouponContext` pattern
 * again: campaigns issued from `/admin/coupons`, the ones it deactivated, and the
 * ones it ended early travel *into* the seam on every call, so the seam stays the
 * only place that decides what a code is worth. With a backend these are three
 * columns on the `coupons` table and this parameter disappears.
 *
 * It is threaded through the **customer** reads as well as the admin board, and
 * that is the point: a campaign created here is claimable in the wallet and
 * spendable at checkout, and a campaign deactivated here is refused there. An
 * admin surface whose writes no customer surface can see would be exactly the
 * "disconnected copy" §5.2 forbids.
 */
export interface PlatformCampaignContext {
  /** Campaigns created from `/admin/coupons`. */
  created: Coupon[];
  /** Coupon id → the instant the desk deactivated it. */
  paused: Record<string, string>;
  /** Coupon id → the instant the desk ended it early. */
  endedAt: Record<string, string>;
}

export function emptyCampaignContext(): PlatformCampaignContext {
  return { created: [], paused: {}, endedAt: {} };
}

const NO_DESK: PlatformCampaignContext = { created: [], paused: {}, endedAt: {} };

/**
 * Ending a campaign does not delete it — it closes the window, which is exactly
 * the UPDATE a backend would run, and leaves the coupon readable (and its
 * performance countable) afterwards. Shared by the merchant's "end now" and the
 * platform desk's.
 */
function applyEnded(coupon: Coupon, endedAt: Record<string, string>): Coupon {
  const ended = endedAt[coupon.id];
  if (!ended) return coupon;
  const endsAt = Math.min(Date.parse(coupon.endsAt), Date.parse(ended));
  return { ...coupon, endsAt: new Date(endsAt).toISOString(), updatedAt: ended };
}

/** Stamp the desk's decisions onto a catalogue coupon (Phase 12). */
function applyDesk(coupon: Coupon, desk: PlatformCampaignContext): Coupon {
  const withEnd = applyEnded(coupon, desk.endedAt);
  const pausedAt = desk.paused[coupon.id] ?? null;
  if (pausedAt === null) return withEnd;
  return {
    ...withEnd,
    pausedAt,
    // ISO strings compare lexicographically, so this is "the later decision".
    updatedAt: pausedAt > withEnd.updatedAt ? pausedAt : withEnd.updatedAt,
  };
}

/**
 * The redeemable catalogue at an instant, with the desk's decisions applied.
 *
 * Every read in this file goes through it, which is what stops a paused campaign
 * from being paused on one surface and live on another.
 */
function liveCoupons(nowMs: number, desk: PlatformCampaignContext = NO_DESK): Coupon[] {
  return [...buildCoupons(nowMs), ...desk.created]
    .filter((c) => !c.deletedAt)
    .map((c) => applyDesk(c, desk));
}

function indexByCode(list: Coupon[]): Map<string, Coupon> {
  return new Map(list.map((c) => [c.code, c]));
}

/**
 * Which browse categories a basket falls into.
 *
 * `FoodItem` has no category FK in the prototype — categories are keyword
 * queries (see `lib/mock/categories.ts`, and the same matching in
 * `services/search.ts`) — so a category-scoped coupon resolves its basket by
 * matching those keywords against the dishes in it. When the backend gives
 * dishes a real `categoryId`, this function becomes a join and nothing above it
 * changes.
 */
function basketCategories(lines: CartLine[]): string[] {
  const haystacks = lines.map((line) => {
    const food = foodById.get(line.foodId);
    return [line.name, food?.name, food?.description, ...(food?.dietary ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  });

  return categories
    .filter((category) =>
      haystacks.some((hay) => category.keywords.some((kw) => hay.includes(kw.toLowerCase()))),
    )
    .map((category) => category.slug);
}

/** Build the pricing context a coupon is evaluated against, from the raw cart. */
function toContext(basket: BasketInput, nowMs: number): CouponContext {
  const subtotal = cartSubtotal(basket.lines);
  return {
    nowMs,
    currency: basket.vendor.currency,
    subtotal,
    deliveryFee:
      basket.fulfillment === "pickup" ? 0 : deliveryFeeFor(basket.vendor, subtotal),
    fulfillment: basket.fulfillment,
    vendorId: basket.vendor.id,
    categorySlugs: basketCategories(basket.lines),
    lines: basket.lines.map((l) => ({
      foodId: l.foodId,
      name: l.name,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
    })),
    isFirstOrder: basket.isFirstOrder,
  };
}

/** Resolve a coupon's `vendorIds` into names the ticket can link to (FK lookup). */
function couponVendors(coupon: Coupon): CouponVendorRef[] {
  return coupon.vendorIds
    .map((id) => vendorById.get(id))
    .filter((v): v is Vendor => Boolean(v) && !v!.deletedAt)
    .map((v) => ({ id: v.id, slug: v.slug, name: v.name }));
}

/** Resolve claims into held coupons, newest-usable first. */
function resolve(
  claims: CouponClaim[],
  nowMs: number,
  desk: PlatformCampaignContext,
): CouponBook {
  const byId = new Map(liveCoupons(nowMs, desk).map((c) => [c.id, c]));
  const held: HeldCoupon[] = [];
  for (const claim of claims) {
    const coupon = byId.get(claim.couponId);
    if (coupon) held.push(toHeldCoupon(coupon, claim, nowMs, couponVendors(coupon)));
  }
  return { nowMs, held: sortHeld(held), stale: claims.length - held.length };
}

// ---- Customer reads --------------------------------------------------------

/**
 * The coupons this account is issued on sign-up — the welcome gift, a referral
 * reward, an apology credit. The store seeds itself from this once, then owns
 * the claims; in production this is a `GET /me/coupons`.
 */
export async function getGrantedClaims(): Promise<CouponClaim[]> {
  return mockDelay(buildCouponClaims(Date.now()), 200);
}

/** The wallet: every coupon held, with its derived status. */
export async function getCouponBook(
  claims: CouponClaim[],
  desk: PlatformCampaignContext = NO_DESK,
): Promise<CouponBook> {
  return mockDelay(resolve(claims, Date.now(), desk), 200);
}

/**
 * Codes worth advertising to a customer who has none — the claimable campaign
 * coupons they are not already holding, best value first. Powers the wallet's
 * "codes you can claim" rail and its empty state.
 */
export async function getClaimableCoupons(
  claims: CouponClaim[],
  limit = 6,
  desk: PlatformCampaignContext = NO_DESK,
): Promise<{ nowMs: number; coupons: ClaimableCoupon[] }> {
  const nowMs = Date.now();
  const holding = new Set(claims.map((c) => c.couponId));
  const coupons = liveCoupons(nowMs, desk)
    .filter(
      (c) =>
        c.claimable && !holding.has(c.id) && couponStatus(c, null, nowMs) === "active",
    )
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
    .slice(0, limit)
    .map((coupon) => ({
      coupon,
      vendors: couponVendors(coupon),
      daysLeft: daysLeft(coupon, nowMs),
    }));
  return mockDelay({ nowMs, coupons }, 200);
}

// ---- Customer mutations ----------------------------------------------------

/**
 * Add a code to the wallet. Refuses an unknown code, a code that is not handed
 * out (granted coupons carry a code but cannot be claimed with it), one already
 * held, and one outside its window — each with the key that explains which.
 */
export async function claimCoupon(
  code: string,
  claims: CouponClaim[],
  desk: PlatformCampaignContext = NO_DESK,
): Promise<Result<{ coupon: Coupon; claim: CouponClaim }>> {
  await mockDelay(null, 400);
  const nowMs = Date.now();
  const normalised = normaliseCode(code);
  if (!normalised) return { data: null, error: "errors.emptyCode" };

  const coupon = indexByCode(liveCoupons(nowMs, desk)).get(normalised);
  if (!coupon || !coupon.claimable) return { data: null, error: "errors.unknownCode" };
  if (claims.some((c) => c.couponId === coupon.id)) {
    return { data: null, error: "errors.alreadyHeld" };
  }

  const status = couponStatus(coupon, null, nowMs);
  if (status === "expired") return { data: null, error: "errors.expiredCode" };
  if (status === "scheduled") return { data: null, error: "errors.notStartedCode" };
  // Phase 12: a deactivated campaign cannot be added to a wallet either — the
  // code is real, it is just not being handed out at the moment.
  if (status === "paused") return { data: null, error: "errors.pausedCode" };

  return ok({
    coupon,
    claim: {
      couponId: coupon.id,
      claimedAt: new Date(nowMs).toISOString(),
      via: "code" as const,
      redemptions: [],
    },
  });
}

/** Claim a coupon the customer tapped on the deals page (the code is already known good). */
export async function claimById(
  couponId: string,
  claims: CouponClaim[],
  desk: PlatformCampaignContext = NO_DESK,
): Promise<Result<{ coupon: Coupon; claim: CouponClaim }>> {
  await mockDelay(null, 300);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs, desk).find((c) => c.id === couponId);
  if (!coupon || !coupon.claimable) return { data: null, error: "errors.unknownCode" };
  if (claims.some((c) => c.couponId === coupon.id)) {
    return { data: null, error: "errors.alreadyHeld" };
  }
  if (couponStatus(coupon, null, nowMs) === "paused") {
    return { data: null, error: "errors.pausedCode" };
  }
  return ok({
    coupon,
    claim: {
      couponId: coupon.id,
      claimedAt: new Date(nowMs).toISOString(),
      via: "code" as const,
      redemptions: [],
    },
  });
}

// ---- Checkout --------------------------------------------------------------

/** Every held coupon priced against this basket — eligible ones first. */
export async function getBasketCoupons(
  claims: CouponClaim[],
  basket: BasketInput,
  desk: PlatformCampaignContext = NO_DESK,
): Promise<CouponPicker> {
  const nowMs = Date.now();
  const { held } = resolve(claims, nowMs, desk);
  const options = evaluateWallet(held, toContext(basket, nowMs));
  const best = options.find((o) => o.evaluation.eligible) ?? null;
  return mockDelay({ nowMs, options, best }, 150);
}

/**
 * Apply a coupon to a basket by id (picked from the wallet) — re-priced here so
 * the total the customer sees is the one the seam agreed to.
 */
export async function applyCoupon(
  couponId: string,
  claims: CouponClaim[],
  basket: BasketInput,
  desk: PlatformCampaignContext = NO_DESK,
): Promise<Result<AppliedCouponResult>> {
  await mockDelay(null, 250);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs, desk).find((c) => c.id === couponId);
  const claim = claims.find((c) => c.couponId === couponId) ?? null;
  if (!coupon || !claim) return { data: null, error: "errors.notHeld" };

  const evaluation = evaluateCoupon(coupon, claim, toContext(basket, nowMs));
  if (!evaluation.eligible) {
    return { data: null, error: `reason.${evaluation.reasonKey}` };
  }
  return ok({ coupon, claim, evaluation, claimed: false });
}

/**
 * Apply a typed code. A code the customer does not hold yet is claimed on the
 * spot — entering a code at checkout should not mean a detour through the
 * wallet — and the caller is told (`claimed`) so it can persist the new claim.
 */
export async function applyCouponCode(
  code: string,
  claims: CouponClaim[],
  basket: BasketInput,
  desk: PlatformCampaignContext = NO_DESK,
): Promise<Result<AppliedCouponResult>> {
  const nowMs = Date.now();
  const normalised = normaliseCode(code);
  if (!normalised) return { data: null, error: "errors.emptyCode" };

  const coupon = indexByCode(liveCoupons(nowMs, desk)).get(normalised);
  const existing = coupon ? claims.find((c) => c.couponId === coupon.id) ?? null : null;

  // A held-but-not-claimable coupon (a referral reward) is still spendable by
  // typing its code; an unheld one is only claimable if the campaign says so.
  if (!coupon || (!coupon.claimable && !existing)) {
    await mockDelay(null, 300);
    return { data: null, error: "errors.unknownCode" };
  }

  let claim = existing;
  let claimed = false;
  if (!claim) {
    const res = await claimCoupon(normalised, claims, desk);
    if (res.error || !res.data) return { data: null, error: res.error ?? "errors.unknownCode" };
    claim = res.data.claim;
    claimed = true;
  } else {
    await mockDelay(null, 250);
  }

  const evaluation = evaluateCoupon(coupon, claim, toContext(basket, nowMs));
  if (!evaluation.eligible) {
    // The claim still stands (it is a real ticket, just not for this basket), so
    // hand it back for persisting alongside the reason it cannot be used now.
    return { data: null, error: `reason.${evaluation.reasonKey}` };
  }
  return ok({ coupon, claim, evaluation, claimed });
}

/**
 * Record a spend against a placed order. Validates the claim still has a use
 * left and the window is still open — the same guards the apply step ran, re-run
 * at the moment money moves, because a basket can sit on screen past midnight.
 */
export async function redeemCoupon(
  couponId: string,
  claims: CouponClaim[],
  order: Order,
  evaluation: CouponEvaluation,
  desk: PlatformCampaignContext = NO_DESK,
): Promise<Result<CouponRedemption>> {
  await mockDelay(null, 200);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs, desk).find((c) => c.id === couponId);
  const claim = claims.find((c) => c.couponId === couponId);
  if (!coupon || !claim) return { data: null, error: "errors.notHeld" };
  if (remainingUses(coupon, claim) === 0) return { data: null, error: "reason.used" };
  if (couponStatus(coupon, claim, nowMs) !== "active") {
    return { data: null, error: "reason.expired" };
  }

  return ok({
    orderId: order.id,
    orderNumber: order.orderNumber,
    discount: evaluation.discount,
    deliveryWaived: evaluation.deliveryWaived,
    cashback: evaluation.cashback,
    currency: order.pricing.currency,
    redeemedAt: new Date(nowMs).toISOString(),
  });
}

// ---- Merchant --------------------------------------------------------------

/**
 * The merchant's local changes to their coupon book, handed back to the seam on
 * every read — the C16 `BookContext` / C18 `RiderContext` pattern. With a
 * backend these rows live in the database and this parameter disappears.
 */
export interface VendorCouponContext {
  /** Coupons created from the dashboard. */
  created: Coupon[];
  /** Coupon id → the instant the merchant ended it early. */
  endedAt: Record<string, string>;
}

export interface VendorCouponBoard {
  nowMs: number;
  rows: VendorCouponRow[];
  totals: { live: number; redemptions: number; discountGiven: number; revenue: number };
}

/** Every coupon a vendor has issued, with how it has performed. */
export async function getVendorCoupons(
  vendorId: string,
  ctx: VendorCouponContext,
): Promise<VendorCouponBoard> {
  const nowMs = Date.now();
  const mine = [...liveCoupons(nowMs), ...ctx.created]
    .filter((c) => c.vendorIds.includes(vendorId))
    .map((c) => applyEnded(c, ctx.endedAt));

  const rows: VendorCouponRow[] = mine
    .map((coupon) => {
      const performance = buildCouponPerformance(coupon, nowMs);
      return {
        coupon,
        status: couponStatus(coupon, null, nowMs),
        daysLeft: daysLeft(coupon, nowMs),
        ...performance,
      };
    })
    .sort((a, b) => {
      // Live campaigns first — they are the ones a merchant acts on.
      if ((a.status === "active") !== (b.status === "active")) {
        return a.status === "active" ? -1 : 1;
      }
      return Date.parse(b.coupon.startsAt) - Date.parse(a.coupon.startsAt);
    });

  return mockDelay({
    nowMs,
    rows,
    totals: {
      live: rows.filter((r) => r.status === "active").length,
      redemptions: rows.reduce((n, r) => n + r.redemptions, 0),
      discountGiven: rows.reduce((n, r) => n + r.discountGiven, 0),
      revenue: rows.reduce((n, r) => n + r.revenue, 0),
    },
  });
}

/** What the dashboard's create form collects. */
export interface NewVendorCoupon {
  code: string;
  title: string;
  description: string;
  kind: Coupon["kind"];
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  usageLimit: number;
  /** How many days the campaign runs from today. */
  durationDays: number;
}

const CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/**
 * Issue a vendor coupon. Validation lives here rather than in the form so the
 * same rules would hold for an API client: the code must be unique across the
 * *whole* catalogue (a customer types one code, not one per restaurant), and a
 * percentage cannot exceed 100.
 */
export async function createVendorCoupon(
  vendorId: string,
  input: NewVendorCoupon,
  ctx: VendorCouponContext,
  currency: string,
): Promise<Result<Coupon>> {
  await mockDelay(null, 500);
  const nowMs = Date.now();

  const code = normaliseCode(input.code);
  if (!CODE_PATTERN.test(code)) return { data: null, error: "errors.badCode" };
  const taken = [...liveCoupons(nowMs), ...ctx.created].some((c) => c.code === code);
  if (taken) return { data: null, error: "errors.codeTaken" };

  if (!input.title.trim()) return { data: null, error: "errors.titleRequired" };
  if (input.kind === "percentage" && (input.value <= 0 || input.value > 100)) {
    return { data: null, error: "errors.badPercent" };
  }
  if ((input.kind === "fixed" || input.kind === "percentage") && input.value <= 0) {
    return { data: null, error: "errors.badValue" };
  }
  if (input.durationDays < 1) return { data: null, error: "errors.badDuration" };
  if (input.usageLimit < 1) return { data: null, error: "errors.badLimit" };

  const iso = new Date(nowMs).toISOString();
  return ok({
    id: `cpn_ven_${nowMs.toString(36)}`,
    code,
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.kind,
    value: input.kind === "free-delivery" ? 0 : input.value,
    maxDiscount: input.kind === "percentage" ? input.maxDiscount : null,
    minOrder: Math.max(0, input.minOrder),
    currency,
    scope: "vendor",
    vendorIds: [vendorId],
    categorySlugs: [],
    startsAt: iso,
    endsAt: new Date(nowMs + input.durationDays * 86_400_000).toISOString(),
    usageLimit: input.usageLimit,
    firstOrderOnly: false,
    source: "vendor",
    claimable: true,
    pausedAt: null,
    terms: [],
    offerId: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  });
}

/** End a campaign now. Refuses one that is already over — there is nothing to end. */
export async function endVendorCoupon(
  couponId: string,
  ctx: VendorCouponContext,
): Promise<Result<{ couponId: string; endedAt: string }>> {
  await mockDelay(null, 300);
  const nowMs = Date.now();
  const coupon = [...liveCoupons(nowMs), ...ctx.created]
    .map((c) => applyEnded(c, ctx.endedAt))
    .find((c) => c.id === couponId);
  if (!coupon) return { data: null, error: "errors.unknownCode" };
  if (couponStatus(coupon, null, nowMs) === "expired") {
    return { data: null, error: "errors.alreadyEnded" };
  }
  return ok({ couponId, endedAt: new Date(nowMs).toISOString() });
}

// ---- Platform desk (Phase 12, G28) ----------------------------------------

/** Everything the campaign board can refuse, as an i18n key under `campaigns.*`. */
export type CampaignError =
  | "errors.badCode"
  | "errors.codeTaken"
  | "errors.titleRequired"
  | "errors.badPercent"
  | "errors.badValue"
  | "errors.badCap"
  | "errors.badMinOrder"
  | "errors.badLimit"
  | "errors.badDuration"
  | "errors.badStart"
  | "errors.unknownCategory"
  | "errors.notFound"
  | "errors.notPlatform"
  | "errors.alreadyPaused"
  | "errors.notPaused"
  | "errors.alreadyEnded";

/** How the desk has narrowed the board. */
export interface CampaignQuery {
  segment?: CampaignSegment;
  sort?: CampaignSort;
  /** Free text over code, title and description. */
  text?: string;
}

export interface CampaignBoard {
  /** The instant every status and window was evaluated at. */
  nowMs: number;
  rows: CampaignRow[];
  /** Rows per segment *before* the segment filter — the counts on the chips. */
  counts: Record<CampaignSegment, number>;
  totals: {
    /** Campaigns on the board, whatever their state. */
    campaigns: number;
    live: number;
    redemptions: number;
    discountGiven: number;
    revenue: number;
    /**
     * Tickets issued to individual accounts (welcome gift, apology credit).
     * Counted, not listed: they are not campaigns and nothing on this board
     * manages them — see `lib/coupons.isGrantedCoupon`.
     */
    grants: number;
    /** Restaurant-issued codes, which each merchant manages themselves. */
    vendorCodes: number;
  };
  /** The currency the board's money is expressed in. */
  currency: string;
}

const CAMPAIGN_SEGMENTS: readonly CampaignSegment[] = [
  "all",
  "live",
  "scheduled",
  "paused",
  "ended",
];

/** Which segment a campaign falls in. One status, one chip — no overlaps. */
function segmentOf(status: CouponStatus): Exclude<CampaignSegment, "all"> {
  // A campaign has no claim behind it, so `used` cannot occur here; it is folded
  // into `ended` rather than left to fall through to nothing.
  return status === "active"
    ? "live"
    : status === "scheduled"
      ? "scheduled"
      : status === "paused"
        ? "paused"
        : "ended";
}

function matchesText(coupon: Coupon, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return [coupon.code, coupon.title, coupon.description]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function sortRows(rows: CampaignRow[], sort: CampaignSort): CampaignRow[] {
  const byNewest = (a: CampaignRow, b: CampaignRow) =>
    Date.parse(b.coupon.startsAt) - Date.parse(a.coupon.startsAt);
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "endingSoon": {
        // Only a live campaign can end soon; everything else keeps its own order
        // below rather than being ranked on a date that has already passed.
        const live = (r: CampaignRow) => (r.status === "active" ? 0 : 1);
        if (live(a) !== live(b)) return live(a) - live(b);
        if (a.status === "active") {
          return Date.parse(a.coupon.endsAt) - Date.parse(b.coupon.endsAt);
        }
        return byNewest(a, b);
      }
      case "redemptions":
        return b.redemptions - a.redemptions || byNewest(a, b);
      case "spend":
        return b.discountGiven - a.discountGiven || byNewest(a, b);
      case "newest":
        return byNewest(a, b);
    }
  });
}

/**
 * Every platform campaign, with where it stands and what it has done (G28).
 *
 * Three things worth stating, because each is a rule the spec asks for:
 *
 *  - **Restaurant codes are not here.** `isPlatformCampaign` keeps the two
 *    populations apart on `source`, and the merchant's own book stays at
 *    `/dashboard/coupons`. They are counted (`totals.vendorCodes`) so the desk
 *    knows they exist without being handed controls over somebody else's
 *    campaign.
 *  - **Performance is derived, never stored.** `buildCouponPerformance` counts
 *    the redemptions a campaign's live days produced, deterministically from its
 *    id — so a reload never reshuffles the numbers and no cached total can drift
 *    from them (§5.4).
 *  - **The counts do not collapse when a segment is picked.** They are taken
 *    from the text-filtered set, exactly as the customer directory's do
 *    (Phase 11), so choosing a chip never hides the sizes of the others.
 */
export async function getPlatformCampaigns(
  desk: PlatformCampaignContext,
  query: CampaignQuery = {},
): Promise<CampaignBoard> {
  const nowMs = Date.now();
  const catalogue = liveCoupons(nowMs, desk);

  const searched = catalogue.filter(
    (c) => isPlatformCampaign(c) && matchesText(c, query.text ?? ""),
  );

  const all: CampaignRow[] = searched.map((coupon) => ({
    coupon,
    status: couponStatus(coupon, null, nowMs),
    daysLeft: daysLeft(coupon, nowMs),
    vendors: couponVendors(coupon),
    ...buildCouponPerformance(coupon, nowMs),
  }));

  const counts = CAMPAIGN_SEGMENTS.reduce(
    (acc, segment) => {
      acc[segment] =
        segment === "all"
          ? all.length
          : all.filter((row) => segmentOf(row.status) === segment).length;
      return acc;
    },
    {} as Record<CampaignSegment, number>,
  );

  const segment = query.segment ?? "all";
  const rows = sortRows(
    segment === "all" ? all : all.filter((row) => segmentOf(row.status) === segment),
    query.sort ?? "newest",
  );

  return mockDelay(
    {
      nowMs,
      rows,
      counts,
      totals: {
        campaigns: all.length,
        live: counts.live,
        redemptions: all.reduce((n, r) => n + r.redemptions, 0),
        discountGiven: all.reduce((n, r) => n + r.discountGiven, 0),
        revenue: all.reduce((n, r) => n + r.revenue, 0),
        grants: catalogue.filter(isGrantedCoupon).length,
        vendorCodes: catalogue.filter((c) => c.source === "vendor").length,
      },
      currency: all[0]?.coupon.currency ?? "BDT",
    },
    200,
  );
}

/** What the campaign form collects. Everything else is stamped by the seam. */
export interface NewPlatformCampaign {
  code: string;
  title: string;
  description: string;
  kind: Coupon["kind"];
  /** Percentage points for `percentage`/`cashback`, money for `fixed`. */
  value: number;
  /** Ceiling on the discount, or null for none. */
  maxDiscount: number | null;
  minOrder: number;
  /** How many times one customer may spend it. */
  usageLimit: number;
  firstOrderOnly: boolean;
  /** Days from today the campaign opens (0 = now). */
  startsInDays: number;
  /** How many days it runs from its start. */
  durationDays: number;
  /** Browse categories it is limited to; empty means any dish. */
  categorySlugs: string[];
}

/** The kinds the platform can run. BOGO needs a basket rule the desk cannot set. */
export const CAMPAIGN_KINDS: readonly Coupon["kind"][] = [
  "percentage",
  "fixed",
  "free-delivery",
  "cashback",
];

/** How far ahead a campaign may be scheduled, and how long it may run. */
const MAX_START_DAYS = 90;
const MAX_DURATION_DAYS = 365;

/**
 * Issue a platform campaign.
 *
 * Validation lives here rather than in the form, so the same rules would hold for
 * an API client — and the one that matters most is **code uniqueness across the
 * whole catalogue**, restaurant codes included: a customer types one code, not
 * one per issuer, so a platform campaign that shadowed `BELLALUNCH` would make
 * the merchant's flyer stop working.
 *
 * The window is collected as offsets rather than dates because that is what a
 * desk actually decides ("start Monday, run a fortnight"), and it keeps the
 * created row anchored to the same clock the rest of the catalogue is stamped
 * from.
 */
export async function createPlatformCampaign(
  input: NewPlatformCampaign,
  desk: PlatformCampaignContext,
  currency = "BDT",
): Promise<Result<Coupon>> {
  await mockDelay(null, 500);
  const nowMs = Date.now();

  const code = normaliseCode(input.code);
  if (!CODE_PATTERN.test(code)) return { data: null, error: "errors.badCode" };
  if (liveCoupons(nowMs, desk).some((c) => c.code === code)) {
    return { data: null, error: "errors.codeTaken" };
  }

  if (!input.title.trim()) return { data: null, error: "errors.titleRequired" };

  const percentage = input.kind === "percentage" || input.kind === "cashback";
  if (percentage && (input.value <= 0 || input.value > 100)) {
    return { data: null, error: "errors.badPercent" };
  }
  if (input.kind === "fixed" && input.value <= 0) {
    return { data: null, error: "errors.badValue" };
  }
  if (input.maxDiscount !== null && input.maxDiscount <= 0) {
    return { data: null, error: "errors.badCap" };
  }
  if (input.minOrder < 0) return { data: null, error: "errors.badMinOrder" };
  if (!Number.isInteger(input.usageLimit) || input.usageLimit < 1) {
    return { data: null, error: "errors.badLimit" };
  }
  if (input.durationDays < 1 || input.durationDays > MAX_DURATION_DAYS) {
    return { data: null, error: "errors.badDuration" };
  }
  if (input.startsInDays < 0 || input.startsInDays > MAX_START_DAYS) {
    return { data: null, error: "errors.badStart" };
  }

  const known = new Set(categories.map((c) => c.slug));
  const slugs = [...new Set(input.categorySlugs)];
  if (slugs.some((slug) => !known.has(slug))) {
    return { data: null, error: "errors.unknownCategory" };
  }

  const iso = new Date(nowMs).toISOString();
  const startsAt = new Date(nowMs + input.startsInDays * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + input.durationDays * 86_400_000);

  return ok({
    id: `cpn_plat_${nowMs.toString(36)}`,
    code,
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.kind,
    value: input.kind === "free-delivery" ? 0 : input.value,
    // A cap only means something where a percentage is being taken off.
    maxDiscount: percentage ? input.maxDiscount : null,
    minOrder: Math.max(0, input.minOrder),
    currency,
    // A campaign limited to categories *is* category-scoped; the scope is derived
    // from the eligibility the desk set rather than asked for twice.
    scope: slugs.length > 0 ? "category" : "platform",
    vendorIds: [],
    categorySlugs: slugs,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    pausedAt: null,
    usageLimit: input.usageLimit,
    firstOrderOnly: input.firstOrderOnly,
    source: "campaign",
    claimable: true,
    terms: [],
    offerId: null,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  });
}

/** The campaign this id names, with the desk's decisions applied. */
function findCampaign(
  couponId: string,
  desk: PlatformCampaignContext,
  nowMs: number,
): Coupon | null {
  return liveCoupons(nowMs, desk).find((c) => c.id === couponId) ?? null;
}

/**
 * Deactivate or reactivate a campaign — the reversible half of the board.
 *
 * It refuses to act on a restaurant's code (`errors.notPlatform`), on a campaign
 * that is already over (`errors.alreadyEnded` — deactivating something finished
 * would look like an action and change nothing), and on a no-op in either
 * direction, so the toast a desk gets always describes something that happened.
 */
export async function setCampaignPaused(
  couponId: string,
  paused: boolean,
  desk: PlatformCampaignContext,
): Promise<Result<{ couponId: string; pausedAt: string | null }>> {
  await mockDelay(null, 350);
  const nowMs = Date.now();
  const coupon = findCampaign(couponId, desk, nowMs);
  if (!coupon) return { data: null, error: "errors.notFound" };
  if (!isPlatformCampaign(coupon)) return { data: null, error: "errors.notPlatform" };

  const status = couponStatus(coupon, null, nowMs);
  if (status === "expired") return { data: null, error: "errors.alreadyEnded" };
  if (paused && status === "paused") return { data: null, error: "errors.alreadyPaused" };
  if (!paused && status !== "paused") return { data: null, error: "errors.notPaused" };

  return ok({ couponId, pausedAt: paused ? new Date(nowMs).toISOString() : null });
}

/**
 * End a campaign now. The window closes; the row and its performance stay
 * readable, exactly as the merchant's "end now" does — and unlike a pause, this
 * one cannot be taken back, which is why the surface confirms it first.
 */
export async function endCampaign(
  couponId: string,
  desk: PlatformCampaignContext,
): Promise<Result<{ couponId: string; endedAt: string }>> {
  await mockDelay(null, 400);
  const nowMs = Date.now();
  const coupon = findCampaign(couponId, desk, nowMs);
  if (!coupon) return { data: null, error: "errors.notFound" };
  if (!isPlatformCampaign(coupon)) return { data: null, error: "errors.notPlatform" };
  if (couponStatus(coupon, null, nowMs) === "expired") {
    return { data: null, error: "errors.alreadyEnded" };
  }
  return ok({ couponId, endedAt: new Date(nowMs).toISOString() });
}
