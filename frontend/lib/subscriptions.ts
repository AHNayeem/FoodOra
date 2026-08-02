import {
  countries,
  defaultCountry,
  type CountryCode,
} from "@/frontend/config/regions";
import type {
  BillingCycle,
  MealSlot,
  NutritionFacts,
  PlanGoal,
  PlannedDelivery,
  PlanMeal,
  Subscription,
  SubscriptionPricing,
  SubscriptionStatus,
  Weekday,
} from "@/frontend/types";
import { WEEKDAYS, addDays, fromDateKey, toDateKey, weekdayOf } from "./dates";
import { totalNutrition } from "./nutrition";
import { roundMoney } from "./checkout";

/**
 * subscriptions.ts — pure meal-plan math + the plan vocabularies (Phase C15).
 *
 * Two things live here and nowhere else: the **cycle pricing** (shared by the
 * subscribe builder's live summary and the `createSubscription` service) and
 * the **delivery calendar**. The calendar is *derived*, following the same rule
 * as C9 tracking and C12 rounds: a subscription stores only its rules (start
 * date, weekdays, skips, pause) and `buildSchedule` projects them against a
 * `now` that is always passed in. Nothing here reads the clock or mutates
 * state, so both are trivially testable.
 */

/** Goals a plan can target, in display order. */
export const PLAN_GOALS = [
  "balanced",
  "weight-loss",
  "muscle-gain",
  "keto",
  "plant-based",
  "family",
] as const satisfies readonly PlanGoal[];

/** Emoji for the goal chips (label text comes from i18n). */
export const PLAN_GOAL_EMOJI: Record<PlanGoal, string> = {
  balanced: "🥗",
  "weight-loss": "🔥",
  "muscle-gain": "💪",
  keto: "🥑",
  "plant-based": "🌱",
  family: "👨‍👩‍👧",
};

/** Meal slots in the order they happen in a day. */
export const MEAL_SLOTS = [
  "breakfast",
  "lunch",
  "dinner",
] as const satisfies readonly MealSlot[];

/** Hand-off windows a customer can choose, paired with the slot they suit. */
export const DELIVERY_WINDOWS: Record<MealSlot, string> = {
  breakfast: "07:00–09:00",
  lunch: "11:30–13:30",
  dinner: "18:00–20:00",
};

/** A plan must run on at least this many weekdays to be worth subscribing to. */
export const MIN_DELIVERY_DAYS = 2;

/** How many weeks one billing cycle covers. */
export function cycleWeeks(cycle: BillingCycle): number {
  return cycle === "weekly" ? 1 : 4;
}

export function isPlanGoal(value: string | undefined): value is PlanGoal {
  return !!value && (PLAN_GOALS as readonly string[]).includes(value);
}

export function isMealSlot(value: string | undefined): value is MealSlot {
  return !!value && (MEAL_SLOTS as readonly string[]).includes(value);
}

/** The first delivery date a plan can accept, given its lead time. */
export function earliestStartDate(now: Date, leadTimeDays: number): string {
  return toDateKey(addDays(now, leadTimeDays));
}

/** The date a cycle beginning on `startDate` renews on. */
export function renewalDate(startDate: string, cycle: BillingCycle): string {
  return toDateKey(addDays(fromDateKey(startDate), cycleWeeks(cycle) * 7));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface SubscriptionPricingInput {
  pricePerMeal: number;
  mealsPerDay: number;
  deliveryDaysPerWeek: number;
  cycle: BillingCycle;
  /** Commitment discount on the subtotal (0–1). */
  discountRate: number;
  deliveryFeePerDay: number;
  currency: string;
  countryCode: string;
}

/**
 * Price one billing cycle. Meals are counted first (meals/day × delivery days ×
 * weeks) because every other figure scales off that count; the commitment
 * discount comes off the meals only, delivery is charged per delivery day, and
 * the country's tax applies to what is left. All amounts are rounded to the
 * currency's precision.
 */
export function computeSubscriptionPricing({
  pricePerMeal,
  mealsPerDay,
  deliveryDaysPerWeek,
  cycle,
  discountRate,
  deliveryFeePerDay,
  currency,
  countryCode,
}: SubscriptionPricingInput): SubscriptionPricing {
  const country = countries[countryCode as CountryCode] ?? countries[defaultCountry];
  const weeks = cycleWeeks(cycle);

  const deliveryCount = deliveryDaysPerWeek * weeks;
  const mealCount = mealsPerDay * deliveryCount;

  const subtotal = roundMoney(pricePerMeal * mealCount, currency);
  const discount = roundMoney(subtotal * discountRate, currency);
  const deliveryFee = roundMoney(deliveryFeePerDay * deliveryCount, currency);
  const taxable = subtotal - discount + deliveryFee;
  const tax = roundMoney(taxable * country.taxRate, currency);
  const total = roundMoney(taxable + tax, currency);

  return {
    currency,
    pricePerMeal,
    mealsPerDay,
    deliveryDaysPerWeek,
    weeks,
    mealCount,
    subtotal,
    discount,
    discountRate,
    deliveryFee,
    tax,
    taxLabel: country.taxLabel,
    taxRate: country.taxRate,
    total,
    effectivePerMeal:
      mealCount === 0 ? 0 : roundMoney((subtotal - discount) / mealCount, currency),
  };
}

// ---------------------------------------------------------------------------
// The delivery calendar (derived)
// ---------------------------------------------------------------------------

/** How far ahead `buildSchedule` will scan for occurrences. */
const SCAN_LIMIT_DAYS = 120;

/** Rules a schedule is projected from — everything `buildSchedule` reads. */
type ScheduleRules = Pick<
  Subscription,
  "startDate" | "deliveryDays" | "slots" | "skippedDates" | "pausedUntil" | "status"
>;

/**
 * Can this delivery still be skipped? The kitchen shops and preps ahead, so the
 * cutoff is measured back from local midnight on the delivery day: a 12-hour
 * cutoff means "tell us before noon the day before".
 */
export function canSkipDelivery(
  dateKey: string,
  now: Date,
  skipCutoffHours: number,
): boolean {
  const cutoff = fromDateKey(dateKey).getTime() - skipCutoffHours * 3_600_000;
  return now.getTime() < cutoff;
}

function deliveryState(
  dateKey: string,
  rules: ScheduleRules,
  todayKey: string,
): PlannedDelivery["state"] {
  if (rules.skippedDates.includes(dateKey)) return "skipped";
  if (rules.pausedUntil && dateKey < rules.pausedUntil) return "paused";
  if (dateKey < todayKey) return "delivered";
  return "scheduled";
}

export interface ScheduleOptions {
  /** How many occurrences to return. */
  count?: number;
  /** Start scanning from this date instead of today (used for history). */
  from?: Date;
  /** Skip cutoff of the plan, for the per-occurrence `canSkip` flag. */
  skipCutoffHours?: number;
}

/**
 * Project the next `count` delivery occurrences. Walks the calendar forward
 * from the later of the subscription's start date and `from` (default today),
 * keeping only the chosen weekdays, and labels each one from the same rules the
 * customer edits — so a skip or a pause shows up immediately without anything
 * being rewritten.
 */
export function buildSchedule(
  sub: ScheduleRules,
  now: Date,
  { count = 8, from, skipCutoffHours = 12 }: ScheduleOptions = {},
): PlannedDelivery[] {
  if (sub.status === "cancelled" || sub.deliveryDays.length === 0) return [];

  const todayKey = toDateKey(now);
  const start = fromDateKey(sub.startDate);
  const scanFrom = from ?? now;
  let cursor = scanFrom.getTime() > start.getTime() ? addDays(scanFrom, 0) : start;

  const out: PlannedDelivery[] = [];
  for (let i = 0; i < SCAN_LIMIT_DAYS && out.length < count; i++, cursor = addDays(cursor, 1)) {
    const day = weekdayOf(cursor);
    if (!sub.deliveryDays.includes(day)) continue;

    const date = toDateKey(cursor);
    const state = deliveryState(date, sub, todayKey);
    out.push({
      date,
      day,
      slots: sub.slots,
      state,
      canSkip: state === "scheduled" && canSkipDelivery(date, now, skipCutoffHours),
    });
  }
  return out;
}

/**
 * The status to *show*. A pause carries its own end date, so a subscription
 * paused until the 12th is simply active again on the 12th — deriving that here
 * means nothing has to run on a schedule to flip the stored flag back.
 */
export function effectiveStatus(
  sub: Pick<Subscription, "status" | "pausedUntil">,
  now: Date,
): SubscriptionStatus {
  if (sub.status !== "paused") return sub.status;
  return sub.pausedUntil && sub.pausedUntil > toDateKey(now) ? "paused" : "active";
}

/** The next delivery actually going out (skipped and paused days excluded). */
export function nextDelivery(
  sub: ScheduleRules,
  now: Date,
  skipCutoffHours = 12,
): PlannedDelivery | null {
  return (
    buildSchedule(sub, now, { count: 30, skipCutoffHours }).find(
      (d) => d.state === "scheduled",
    ) ?? null
  );
}

/**
 * Deliveries already made since the subscription started. Counted, not stored —
 * a cancelled subscription keeps the history it earned before it stopped.
 */
export function deliveredCount(sub: ScheduleRules, now: Date): number {
  const todayKey = toDateKey(now);
  let cursor = fromDateKey(sub.startDate);
  let count = 0;
  for (let i = 0; i < SCAN_LIMIT_DAYS && toDateKey(cursor) < todayKey; i++) {
    const date = toDateKey(cursor);
    if (
      sub.deliveryDays.includes(weekdayOf(cursor)) &&
      deliveryState(date, sub, todayKey) === "delivered"
    ) {
      count++;
    }
    cursor = addDays(cursor, 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Menu helpers
// ---------------------------------------------------------------------------

/**
 * Sum the macros of a set of meals — a day's total, or a whole week's.
 *
 * The arithmetic itself moved to `lib/nutrition.totalNutrition` in C24, when
 * the diet planner needed to add up à-la-carte dishes rather than plan meals;
 * this stays as the plan-shaped door onto it (the `lib/dates` precedent).
 */
export function sumNutrition(meals: PlanMeal[]): NutritionFacts {
  return totalNutrition(meals.map((meal) => meal.nutrition));
}

/** Group a plan's weekly menu by weekday, in Monday-first order. */
export function menuByDay(meals: PlanMeal[]): Record<Weekday, PlanMeal[]> {
  const bySlot = (a: PlanMeal, b: PlanMeal) =>
    MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot);
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, meals.filter((m) => m.day === day).sort(bySlot)]),
  ) as Record<Weekday, PlanMeal[]>;
}

/** Default hand-off window for the chosen slots (earliest slot wins). */
export function defaultDeliveryWindow(slots: MealSlot[]): string {
  const earliest = MEAL_SLOTS.find((slot) => slots.includes(slot)) ?? "lunch";
  return DELIVERY_WINDOWS[earliest];
}
