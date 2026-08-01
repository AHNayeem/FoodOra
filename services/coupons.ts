import type {
  CartLine,
  CartVendor,
  Coupon,
  CouponClaim,
  CouponContext,
  CouponEvaluation,
  CouponRedemption,
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

function liveCoupons(nowMs: number): Coupon[] {
  return buildCoupons(nowMs).filter((c) => !c.deletedAt);
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
function resolve(claims: CouponClaim[], nowMs: number): CouponBook {
  const byId = new Map(liveCoupons(nowMs).map((c) => [c.id, c]));
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
export async function getCouponBook(claims: CouponClaim[]): Promise<CouponBook> {
  return mockDelay(resolve(claims, Date.now()), 200);
}

/**
 * Codes worth advertising to a customer who has none — the claimable campaign
 * coupons they are not already holding, best value first. Powers the wallet's
 * "codes you can claim" rail and its empty state.
 */
export async function getClaimableCoupons(
  claims: CouponClaim[],
  limit = 6,
): Promise<{ nowMs: number; coupons: ClaimableCoupon[] }> {
  const nowMs = Date.now();
  const holding = new Set(claims.map((c) => c.couponId));
  const coupons = liveCoupons(nowMs)
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
): Promise<Result<{ coupon: Coupon; claim: CouponClaim }>> {
  await mockDelay(null, 400);
  const nowMs = Date.now();
  const normalised = normaliseCode(code);
  if (!normalised) return { data: null, error: "errors.emptyCode" };

  const coupon = indexByCode(liveCoupons(nowMs)).get(normalised);
  if (!coupon || !coupon.claimable) return { data: null, error: "errors.unknownCode" };
  if (claims.some((c) => c.couponId === coupon.id)) {
    return { data: null, error: "errors.alreadyHeld" };
  }

  const status = couponStatus(coupon, null, nowMs);
  if (status === "expired") return { data: null, error: "errors.expiredCode" };
  if (status === "scheduled") return { data: null, error: "errors.notStartedCode" };

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
): Promise<Result<{ coupon: Coupon; claim: CouponClaim }>> {
  await mockDelay(null, 300);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs).find((c) => c.id === couponId);
  if (!coupon || !coupon.claimable) return { data: null, error: "errors.unknownCode" };
  if (claims.some((c) => c.couponId === coupon.id)) {
    return { data: null, error: "errors.alreadyHeld" };
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
): Promise<CouponPicker> {
  const nowMs = Date.now();
  const { held } = resolve(claims, nowMs);
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
): Promise<Result<AppliedCouponResult>> {
  await mockDelay(null, 250);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs).find((c) => c.id === couponId);
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
): Promise<Result<AppliedCouponResult>> {
  const nowMs = Date.now();
  const normalised = normaliseCode(code);
  if (!normalised) return { data: null, error: "errors.emptyCode" };

  const coupon = indexByCode(liveCoupons(nowMs)).get(normalised);
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
    const res = await claimCoupon(normalised, claims);
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
): Promise<Result<CouponRedemption>> {
  await mockDelay(null, 200);
  const nowMs = Date.now();
  const coupon = liveCoupons(nowMs).find((c) => c.id === couponId);
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

/**
 * A merchant ending a campaign does not delete it — it closes the window, which
 * is exactly the UPDATE a backend would run, and leaves the coupon readable
 * (and its performance countable) afterwards.
 */
function applyEnded(coupon: Coupon, endedAt: Record<string, string>): Coupon {
  const ended = endedAt[coupon.id];
  if (!ended) return coupon;
  const endsAt = Math.min(Date.parse(coupon.endsAt), Date.parse(ended));
  return { ...coupon, endsAt: new Date(endsAt).toISOString(), updatedAt: ended };
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
