import type { BaseEntity, DietaryTag, ISODate, Weekday } from "./common";
import type { DeliveryAddress } from "./order";

/**
 * subscription.ts — recurring meal plans (Phase C15; spec: Subscription Meal,
 * Healthy Meal Plans, and the home-chef "Weekly Menu" / "Subscription Meals"
 * features).
 *
 * A `MealPlan` belongs to a vendor (FK `vendorId`) and publishes a *rotating
 * weekly menu* (`PlanMeal`, one row per weekday × meal slot) plus purchasable
 * `PlanTier`s. A customer's commitment is a `Subscription`: it snapshots the
 * plan the way an `Order` snapshots its vendor, and stores only the *rules* of
 * the schedule (start date, weekdays, skips, pause) — the delivery calendar
 * itself is always derived in `lib/subscriptions.ts`, never persisted, so it
 * cannot drift from the clock.
 */

/** What a plan is optimised for. Drives the directory's primary filter. */
export type PlanGoal =
  | "balanced"
  | "weight-loss"
  | "muscle-gain"
  | "keto"
  | "plant-based"
  | "family";

/** Which meal of the day a plan slot covers. */
export type MealSlot = "breakfast" | "lunch" | "dinner";

/** How often the subscription renews (and is charged). */
export type BillingCycle = "weekly" | "monthly";

/** Per-meal macros, shown on every dish and summed per day. */
export interface NutritionFacts {
  calories: number;
  /** Grams. */
  protein: number;
  carbs: number;
  fat: number;
}

/** One dish on a plan's rotating weekly menu (FK `planId`). */
export interface PlanMeal extends BaseEntity {
  planId: string;
  day: Weekday;
  slot: MealSlot;
  name: string;
  description: string;
  nutrition: NutritionFacts;
  dietary: DietaryTag[];
}

/**
 * A purchasable commitment on a plan: how long you commit for and how many
 * meals land per delivery day. Longer commitments carry a `discountRate` —
 * that is the whole reason a subscription exists rather than daily ordering.
 */
export interface PlanTier extends BaseEntity {
  planId: string;
  name: string;
  cycle: BillingCycle;
  /** Meals delivered on each delivery day. */
  mealsPerDay: number;
  /** List price of one meal, in the plan's currency. */
  pricePerMeal: number;
  /** Commitment discount on the cycle subtotal (0 = none). */
  discountRate: number;
  isPopular: boolean;
}

export interface MealPlan extends BaseEntity {
  /** FK → vendors (`ven_*`) — the kitchen that cooks it. */
  vendorId: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  cover: string;
  goal: PlanGoal;
  dietary: DietaryTag[];
  /** Weekdays this kitchen delivers the plan on. */
  deliveryDays: Weekday[];
  /** Meal slots the plan covers. */
  slots: MealSlot[];
  /** Mean macros for a full day on the plan — the weekly menu averaged out. */
  nutritionPerDay: NutritionFacts;
  /** Short selling points — DATA strings, like vendor taglines. */
  highlights: string[];
  rating: number; // 0–5
  reviewCount: number;
  currency: string;
  countryCode: string;
  /** Delivery charge per delivery day, in `currency`. */
  deliveryFeePerDay: number;
  /** Minimum notice before the first delivery, in days. */
  leadTimeDays: number;
  /** How long before a delivery it can still be skipped. */
  skipCutoffHours: number;
  isFeatured: boolean;
}

/** Immutable snapshot of the plan stored on a subscription (like CartVendor). */
export interface SubscriptionPlanRef {
  id: string;
  slug: string;
  name: string;
  image: string;
  goal: PlanGoal;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  currency: string;
  countryCode: string;
  skipCutoffHours: number;
}

/**
 * The money breakdown for one billing cycle — pure-derived, mirrors
 * `OrderPricing`. Everything scales off `mealCount`, which is itself derived
 * from meals/day × delivery days × weeks in the cycle.
 */
export interface SubscriptionPricing {
  currency: string;
  pricePerMeal: number;
  mealsPerDay: number;
  deliveryDaysPerWeek: number;
  /** Weeks covered by one billing cycle (weekly = 1, monthly = 4). */
  weeks: number;
  /** Meals in one cycle. */
  mealCount: number;
  /** pricePerMeal × mealCount. */
  subtotal: number;
  /** Commitment discount taken off the subtotal. */
  discount: number;
  discountRate: number;
  /** deliveryFeePerDay × delivery days in the cycle. */
  deliveryFee: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  /** Charged at the start of every cycle. */
  total: number;
  /** subtotal ÷ mealCount after discount — the honest "per meal" figure. */
  effectivePerMeal: number;
}

/** Lifecycle of a subscription. Simulated — starts `active`. */
export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription extends BaseEntity {
  /** Human-facing reference, e.g. "SUB-8F3A21". */
  reference: string;
  userId: string | null;
  plan: SubscriptionPlanRef;
  tierId: string;
  tierName: string;
  cycle: BillingCycle;
  mealsPerDay: number;
  slots: MealSlot[];
  /** Weekdays the customer chose to receive deliveries on. */
  deliveryDays: Weekday[];
  /** First delivery, as a plain local date ("YYYY-MM-DD"). */
  startDate: string;
  /** Preferred hand-off window, e.g. "07:00–09:00". */
  deliveryWindow: string;
  address: DeliveryAddress;
  /** Allergies / dislikes for the kitchen. */
  notes: string | null;
  pricing: SubscriptionPricing;
  status: SubscriptionStatus;
  /** Plain dates the customer skipped ("YYYY-MM-DD"). */
  skippedDates: string[];
  /** While paused, deliveries resume on this date; null when active. */
  pausedUntil: string | null;
  startedAt: ISODate;
  cancelledAt: ISODate | null;
  /** Next charge, as a plain date. Derived at write time, re-derived on renew. */
  renewsOn: string;
}

/** Why a planned delivery is not going out. */
export type DeliveryState = "scheduled" | "skipped" | "paused" | "delivered";

/**
 * One occurrence on the delivery calendar. **Never stored** — `buildSchedule`
 * derives it from the subscription's rules and the current time, so a schedule
 * is always consistent with the clock and with any skip/pause applied since.
 */
export interface PlannedDelivery {
  /** Plain local date ("YYYY-MM-DD"). */
  date: string;
  day: Weekday;
  slots: MealSlot[];
  state: DeliveryState;
  /** True while the skip cutoff has not passed yet. */
  canSkip: boolean;
}
