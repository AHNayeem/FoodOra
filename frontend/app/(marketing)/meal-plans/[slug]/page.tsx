import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check, Sparkles } from "lucide-react";
import {
  getMealPlanBySlug,
  getMealPlanSlugs,
  getPlanTiers,
  getPlanVendor,
  getPlanWeeklyMenu,
  planFromPrice,
} from "@/services/subscriptions";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";
import { computeSubscriptionPricing } from "@/lib/subscriptions";
import { PlanHero } from "@/components/subscriptions/plan-hero";
import { WeeklyMenu } from "@/components/subscriptions/weekly-menu";
import { NutritionStrip } from "@/components/subscriptions/nutrition-strip";

type Params = Promise<{ slug: string }>;

/** Prerender every plan at build time (spec: fast, SEO-friendly pages). */
export function generateStaticParams() {
  return getMealPlanSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const plan = await getMealPlanBySlug(slug);
  if (!plan) return {};
  return {
    title: plan.name,
    description: plan.description,
    openGraph: {
      title: plan.name,
      description: plan.tagline,
      images: [{ url: plan.cover }],
    },
  };
}

/**
 * Meal-plan detail (Phase C15). Resolves the plan by slug through the services
 * seam, 404s on miss, then loads its tiers, weekly menu and kitchen in
 * parallel. The tier prices shown here are for the plan's full delivery week —
 * the subscribe builder re-prices live once days are chosen.
 */
export default async function MealPlanPage({ params }: { params: Params }) {
  const { slug } = await params;
  const plan = await getMealPlanBySlug(slug);
  if (!plan) notFound();

  const [tiers, meals, vendor, t] = await Promise.all([
    getPlanTiers(plan.id),
    getPlanWeeklyMenu(plan.id),
    getPlanVendor(plan),
    getTranslations("subscriptions"),
  ]);
  const currency = plan.currency as CurrencyCode;

  return (
    <div className="pb-16">
      <PlanHero plan={plan} vendor={vendor} fromPrice={planFromPrice(plan.id)} />

      <div className="container-site mt-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-12">
            {/* Weekly menu */}
            <section>
              <h2 className="text-h2 text-ink">{t("menuTitle")}</h2>
              <p className="mt-1 text-body">{t("menuSubtitle")}</p>
              <div className="mt-6">
                <WeeklyMenu plan={plan} meals={meals} />
              </div>
            </section>

            {/* Tiers */}
            <section>
              <h2 className="text-h2 text-ink">{t("tiersTitle")}</h2>
              <p className="mt-1 text-body">
                {t("tiersSubtitle", { count: plan.deliveryDays.length })}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {tiers.map((tier) => {
                  const pricing = computeSubscriptionPricing({
                    pricePerMeal: tier.pricePerMeal,
                    mealsPerDay: tier.mealsPerDay,
                    deliveryDaysPerWeek: plan.deliveryDays.length,
                    cycle: tier.cycle,
                    discountRate: tier.discountRate,
                    deliveryFeePerDay: plan.deliveryFeePerDay,
                    currency: plan.currency,
                    countryCode: plan.countryCode,
                  });
                  return (
                    <article
                      key={tier.id}
                      className="flex flex-col rounded-card border border-line bg-surface p-5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-ink">{tier.name}</h3>
                        {tier.isPopular && (
                          <span className="rounded-pill bg-accent-50 px-2.5 py-1 text-xs font-bold text-accent-600">
                            {t("popular")}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-2xl font-extrabold text-ink">
                        {formatPrice(pricing.total, currency)}
                        <span className="text-sm font-normal text-muted">
                          {" "}
                          / {t(`cycleUnit.${tier.cycle}`)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-body">
                        {t("tierLine", {
                          meals: tier.mealsPerDay,
                          price: formatPrice(pricing.effectivePerMeal, currency),
                        })}
                      </p>
                      {tier.discountRate > 0 && (
                        <p className="mt-1 text-sm font-semibold text-fresh-600">
                          {t("saveRate", { rate: Math.round(tier.discountRate * 100) })}
                        </p>
                      )}
                      <Link
                        href={`/meal-plans/${plan.slug}/subscribe?tier=${tier.id}`}
                        className="mt-4 inline-flex h-11 items-center justify-center rounded-pill border border-primary px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                      >
                        {t("choosePlan")}
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="flex h-fit flex-col gap-6 lg:sticky lg:top-20">
            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("about")}</h3>
              <p className="mt-2 text-sm text-body">{plan.description}</p>
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("nutritionTitle")}</h3>
              <p className="mt-1 text-xs text-muted">{t("nutritionHint")}</p>
              <NutritionStrip nutrition={plan.nutritionPerDay} variant="grid" className="mt-3" />
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("highlights")}</h3>
              <ul className="mt-3 space-y-2">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-body">
                    <Check className="mt-0.5 size-4 shrink-0 text-fresh" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={`/meal-plans/${plan.slug}/subscribe`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <Sparkles className="size-4.5" aria-hidden />
              {t("startPlan")}
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
