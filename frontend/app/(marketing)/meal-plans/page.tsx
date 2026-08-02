import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarX } from "lucide-react";
import {
  getMealPlanKitchens,
  getMealPlans,
  planFromPrice,
} from "@/frontend/services/subscriptions";
import { isMealSlot, isPlanGoal } from "@/frontend/lib/subscriptions";
import type { MealSlot, PlanGoal } from "@/frontend/types";
import { HowPlansWork, MealPlansHero } from "@/frontend/components/subscriptions/meal-plans-hero";
import {
  MealPlanFilters,
  type PlanSortKey,
} from "@/frontend/components/subscriptions/meal-plan-filters";
import { MealPlanCard } from "@/frontend/components/subscriptions/meal-plan-card";

const SORTS = new Set<PlanSortKey>(["recommended", "rating", "price-low", "calories-low"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("subscriptions");
  return { title: t("metaTitle"), description: t("heroSubtitle") };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Meal-plan directory (Phase C15). The URL query string is the source of truth
 * for the goal / meal / sort / search filters — parsed and validated here, then
 * passed to the subscriptions service, exactly as the other directories do.
 */
export default async function MealPlansPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const t = await getTranslations("subscriptions");

  const goal: PlanGoal | "" =
    typeof raw.goal === "string" && isPlanGoal(raw.goal) ? raw.goal : "";
  const slot: MealSlot | "" =
    typeof raw.slot === "string" && isMealSlot(raw.slot) ? raw.slot : "";
  const sort =
    typeof raw.sort === "string" && SORTS.has(raw.sort as PlanSortKey)
      ? (raw.sort as PlanSortKey)
      : "recommended";
  const search = typeof raw.q === "string" ? raw.q : "";

  const { items, total } = await getMealPlans({
    goal: goal || undefined,
    slot: slot || undefined,
    search: search || undefined,
    sort,
    pageSize: 100,
  });
  const kitchens = await getMealPlanKitchens(items);

  return (
    <div className="pb-16">
      <MealPlansHero />

      <div className="container-site mt-10 space-y-10">
        <div>
          <MealPlanFilters goal={goal} slot={slot} sort={sort} search={search} />

          <p className="mt-6 text-sm font-medium text-muted" aria-live="polite">
            {t("resultsCount", { count: total })}
          </p>

          {items.length > 0 ? (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((plan) => (
                <MealPlanCard
                  key={plan.id}
                  plan={plan}
                  fromPrice={planFromPrice(plan.id)}
                  vendorName={kitchens[plan.id]}
                />
              ))}
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
              <CalendarX className="size-10 text-muted" aria-hidden />
              <p className="text-lg font-semibold text-ink">{t("noResults")}</p>
              <p className="text-body">{t("noResultsHint")}</p>
            </div>
          )}
        </div>

        <HowPlansWork />
      </div>
    </div>
  );
}
