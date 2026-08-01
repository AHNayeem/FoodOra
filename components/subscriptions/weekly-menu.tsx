"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarOff } from "lucide-react";
import type { MealPlan, PlanMeal, Weekday } from "@/types";
import { MEAL_SLOTS, menuByDay, sumNutrition } from "@/lib/subscriptions";
import { WEEKDAYS } from "@/lib/dates";
import { NutritionStrip } from "./nutrition-strip";
import { cn } from "@/lib/utils";

/**
 * WeeklyMenu — a plan's rotating week (Phase C15; the home-chef "Weekly Menu"
 * feature C13 deferred here). A day is picked from the rail and its meals are
 * listed slot by slot with their macros, plus the day's total — which is what a
 * subscriber is really checking when they compare plans.
 */
export function WeeklyMenu({ plan, meals }: { plan: MealPlan; meals: PlanMeal[] }) {
  const t = useTranslations("subscriptions");
  const td = useTranslations("days");
  const tag = useTranslations("dietary");

  const byDay = useMemo(() => menuByDay(meals), [meals]);
  const servedDays = WEEKDAYS.filter((day) => byDay[day].length > 0);
  const [active, setActive] = useState<Weekday>(servedDays[0] ?? "mon");

  const dayMeals = byDay[active] ?? [];
  const dayTotal = sumNutrition(dayMeals);

  if (servedDays.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-line p-8 text-center text-body">
        {t("menuEmpty")}
      </p>
    );
  }

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {WEEKDAYS.map((day) => {
          const served = byDay[day].length > 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => served && setActive(day)}
              disabled={!served}
              aria-pressed={active === day}
              className={cn(
                "shrink-0 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors",
                !served && "cursor-not-allowed border-dashed border-line text-muted opacity-60",
                served && active === day
                  ? "border-primary bg-primary text-white"
                  : served && "border-line bg-surface text-body hover:border-primary hover:text-primary",
              )}
              title={served ? undefined : t("noDeliveryOn", { day: td(day) })}
            >
              {td(day)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {MEAL_SLOTS.filter((slot) => plan.slots.includes(slot)).map((slot) => {
          const meal = dayMeals.find((m) => m.slot === slot);
          if (!meal) return null;
          return (
            <article
              key={slot}
              className="rounded-card border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fresh-600">
                    {t(`slot.${slot}`)}
                  </span>
                  <h3 className="mt-0.5 font-bold text-ink">{meal.name}</h3>
                  <p className="mt-1 text-sm text-body">{meal.description}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {meal.dietary.map((d) => (
                    <span
                      key={d}
                      className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-body"
                    >
                      {tag(d)}
                    </span>
                  ))}
                </div>
              </div>
              <NutritionStrip nutrition={meal.nutrition} className="mt-3" />
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-muted px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {t("dayTotal", { day: td(active) })}
        </p>
        <NutritionStrip nutrition={dayTotal} className="text-body" />
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
        <CalendarOff className="size-3.5" aria-hidden />
        {t("menuRotationNote")}
      </p>
    </div>
  );
}
