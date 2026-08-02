import {
  mealPlanBySlug,
  mealPlans,
  planMealsByPlan,
  planTiersByPlan,
  vendorById,
} from "@/frontend/lib/mock";
import { MEAL_SLOTS, MIN_DELIVERY_DAYS, canSkipDelivery, renewalDate } from "@/frontend/lib/subscriptions";
import { fromDateKey, toDateKey } from "@/frontend/lib/dates";
import type {
  DeliveryAddress,
  DietaryTag,
  MealPlan,
  MealSlot,
  PlanGoal,
  PlanMeal,
  PlanTier,
  Subscription,
  SubscriptionPlanRef,
  SubscriptionPricing,
  Vendor,
  Weekday,
} from "@/frontend/types";
import { mockDelay, ok, paginate, type Paginated, type Result } from "./http";

/**
 * subscriptions.ts — read + write API for meal plans (Phase C15).
 *
 * Reads resolve plans, their tiers and their weekly menus from the seed. Writes
 * are the interesting half: `createSubscription` fabricates the immutable
 * record a real endpoint would return, and the four lifecycle mutations
 * (`skipDelivery`, `pauseSubscription`, `resumeSubscription`,
 * `cancelSubscription`) own their *validation* here rather than in the UI —
 * a skip past the kitchen's cutoff is refused by the seam, not by a disabled
 * button. Each returns the updated record; the client commits it to the store,
 * which is the prototype's database.
 */

export interface MealPlanQuery {
  goal?: PlanGoal;
  slot?: MealSlot;
  dietary?: DietaryTag;
  search?: string;
  sort?: "recommended" | "rating" | "price-low" | "calories-low";
  page?: number;
  pageSize?: number;
}

/** Cheapest advertised meal on a plan — the "from" price and the price sort. */
export function planFromPrice(planId: string): number {
  const tiers = planTiersByPlan[planId] ?? [];
  return tiers.reduce(
    (min, t) => Math.min(min, Math.round(t.pricePerMeal * (1 - t.discountRate))),
    Number.POSITIVE_INFINITY,
  );
}

export async function getMealPlans(
  query: MealPlanQuery = {},
): Promise<Paginated<MealPlan>> {
  let list = mealPlans.filter((p) => !p.deletedAt);

  if (query.goal) list = list.filter((p) => p.goal === query.goal);
  if (query.slot) list = list.filter((p) => p.slots.includes(query.slot!));
  if (query.dietary) list = list.filter((p) => p.dietary.includes(query.dietary!));
  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }

  switch (query.sort) {
    case "rating":
      list = [...list].sort((a, b) => b.rating - a.rating);
      break;
    case "price-low":
      list = [...list].sort((a, b) => planFromPrice(a.id) - planFromPrice(b.id));
      break;
    case "calories-low":
      list = [...list].sort(
        (a, b) => a.nutritionPerDay.calories - b.nutritionPerDay.calories,
      );
      break;
    default:
      // "recommended": featured first, then rating.
      list = [...list].sort(
        (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating,
      );
  }

  return mockDelay(paginate(list, query.page, query.pageSize));
}

export async function getFeaturedMealPlans(limit = 3): Promise<MealPlan[]> {
  const list = mealPlans
    .filter((p) => p.isFeatured && !p.deletedAt)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return mockDelay(list);
}

export async function getMealPlanBySlug(slug: string): Promise<MealPlan | null> {
  return mockDelay(mealPlanBySlug.get(slug) ?? null);
}

/** Slugs for `generateStaticParams` — synchronous, build-time only. */
export function getMealPlanSlugs(): string[] {
  return mealPlans.filter((p) => !p.deletedAt).map((p) => p.slug);
}

/** A plan's tiers, cheapest commitment first (FK lookup by planId). */
export async function getPlanTiers(planId: string): Promise<PlanTier[]> {
  const list = [...(planTiersByPlan[planId] ?? [])]
    .filter((t) => !t.deletedAt)
    .sort((a, b) => a.mealsPerDay - b.mealsPerDay || a.discountRate - b.discountRate);
  return mockDelay(list);
}

/** A plan's rotating weekly menu, flat and ordered by day then slot. */
export async function getPlanWeeklyMenu(planId: string): Promise<PlanMeal[]> {
  const list = [...(planMealsByPlan[planId] ?? [])].filter((m) => !m.deletedAt);
  return mockDelay(list);
}

/** The kitchen behind a plan (FK lookup) — used by the detail page hero. */
export async function getPlanVendor(plan: MealPlan): Promise<Vendor | null> {
  return mockDelay(vendorById.get(plan.vendorId) ?? null);
}

/**
 * Plans cooked by one vendor — the "subscribe to this kitchen" rail on a
 * vendor's page (the weekly-menu / subscription hook C13 deferred to here).
 */
export async function getPlansByVendor(vendorId: string): Promise<MealPlan[]> {
  const list = mealPlans.filter((p) => p.vendorId === vendorId && !p.deletedAt);
  return mockDelay(list);
}

/** Kitchen names for a batch of plans, keyed by plan id (the FK join a list needs). */
export async function getMealPlanKitchens(plans: MealPlan[]): Promise<Record<string, string>> {
  return mockDelay(
    Object.fromEntries(
      plans.map((plan) => [plan.id, vendorById.get(plan.vendorId)?.name ?? ""]),
    ),
  );
}

/** Build the immutable plan snapshot a subscription carries. */
export function toPlanRef(plan: MealPlan, vendor: Vendor): SubscriptionPlanRef {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    image: plan.image,
    goal: plan.goal,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorSlug: vendor.slug,
    currency: plan.currency,
    countryCode: plan.countryCode,
    skipCutoffHours: plan.skipCutoffHours,
  };
}

/** 6-char human reference, e.g. "SUB-8F3A21", derived from a timestamp. */
function referenceFrom(ms: number): string {
  return `SUB-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

export interface CreateSubscriptionInput {
  userId: string | null;
  plan: SubscriptionPlanRef;
  tier: PlanTier;
  slots: MealSlot[];
  deliveryDays: Weekday[];
  startDate: string;
  deliveryWindow: string;
  address: DeliveryAddress;
  notes: string | null;
  pricing: SubscriptionPricing;
  /** Earliest date the plan accepts, from its lead time. */
  earliestStart: string;
}

/**
 * Start a subscription. Simulated: a real endpoint would take the first payment
 * and enqueue the kitchen's production plan; here we model the round-trip and
 * return the fully-formed record in `active` status, with the renewal date
 * already derived from the cycle.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<Result<Subscription>> {
  await mockDelay(null, 900);

  if (input.deliveryDays.length < MIN_DELIVERY_DAYS) {
    return { data: null, error: "errors.tooFewDays" };
  }
  if (input.slots.length !== input.tier.mealsPerDay) {
    return { data: null, error: "errors.slotCount" };
  }
  if (!input.startDate) return { data: null, error: "errors.startRequired" };
  if (input.startDate < input.earliestStart) {
    return { data: null, error: "errors.startTooSoon" };
  }

  const now = Date.now();
  const iso = new Date(now).toISOString();

  const subscription: Subscription = {
    id: `sub_${now.toString(36)}`,
    reference: referenceFrom(now),
    userId: input.userId,
    plan: input.plan,
    tierId: input.tier.id,
    tierName: input.tier.name,
    cycle: input.tier.cycle,
    mealsPerDay: input.tier.mealsPerDay,
    // Keep slots in day order however they were clicked.
    slots: MEAL_SLOTS.filter((slot) => input.slots.includes(slot)),
    deliveryDays: input.deliveryDays,
    startDate: input.startDate,
    deliveryWindow: input.deliveryWindow,
    address: input.address,
    notes: input.notes,
    pricing: input.pricing,
    status: "active",
    skippedDates: [],
    pausedUntil: null,
    startedAt: iso,
    cancelledAt: null,
    renewsOn: renewalDate(input.startDate, input.tier.cycle),
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };

  return ok(subscription);
}

/** Stamp an edit the way a server would, so `updatedAt` is never forgotten. */
function touch(sub: Subscription, patch: Partial<Subscription>): Subscription {
  return { ...sub, ...patch, updatedAt: new Date().toISOString() };
}

/**
 * Skip a single delivery. Refused past the kitchen's cutoff — by then the food
 * is already bought and prepped, so "cancel it" is not a thing the seam can
 * honestly promise.
 */
export async function skipDelivery(
  sub: Subscription,
  date: string,
): Promise<Result<Subscription>> {
  await mockDelay(null, 450);

  if (sub.status !== "active") return { data: null, error: "errors.notActive" };
  if (sub.skippedDates.includes(date)) return ok(sub);
  if (!canSkipDelivery(date, new Date(), sub.plan.skipCutoffHours)) {
    return { data: null, error: "errors.pastCutoff" };
  }

  return ok(touch(sub, { skippedDates: [...sub.skippedDates, date].sort() }));
}

/** Undo a skip, while the cutoff still allows the kitchen to cook it. */
export async function unskipDelivery(
  sub: Subscription,
  date: string,
): Promise<Result<Subscription>> {
  await mockDelay(null, 450);

  if (!canSkipDelivery(date, new Date(), sub.plan.skipCutoffHours)) {
    return { data: null, error: "errors.pastCutoff" };
  }
  return ok(touch(sub, { skippedDates: sub.skippedDates.filter((d) => d !== date) }));
}

/** Pause deliveries until (and not including) `until`. */
export async function pauseSubscription(
  sub: Subscription,
  until: string,
): Promise<Result<Subscription>> {
  await mockDelay(null, 600);

  if (sub.status === "cancelled") return { data: null, error: "errors.notActive" };
  if (!until) return { data: null, error: "errors.resumeRequired" };
  if (fromDateKey(until).getTime() <= new Date().setHours(0, 0, 0, 0)) {
    return { data: null, error: "errors.resumeInPast" };
  }

  return ok(touch(sub, { status: "paused", pausedUntil: until }));
}

export async function resumeSubscription(
  sub: Subscription,
): Promise<Result<Subscription>> {
  await mockDelay(null, 600);

  if (sub.status === "cancelled") return { data: null, error: "errors.notActive" };

  // Resuming early moves the pause end to today, so the calendar reopens now.
  const today = toDateKey(new Date());
  const pausedUntil = sub.pausedUntil && sub.pausedUntil > today ? today : sub.pausedUntil;
  return ok(touch(sub, { status: "active", pausedUntil }));
}

/**
 * Cancel. The current cycle is already paid for, so a real service would run it
 * to the renewal date and stop there; the prototype models the same thing by
 * keeping the record and stamping `cancelledAt`.
 */
export async function cancelSubscription(
  sub: Subscription,
): Promise<Result<Subscription>> {
  await mockDelay(null, 700);

  if (sub.status === "cancelled") return ok(sub);
  return ok(
    touch(sub, { status: "cancelled", cancelledAt: new Date().toISOString() }),
  );
}
