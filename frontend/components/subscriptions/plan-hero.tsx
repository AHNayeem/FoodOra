import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, ChefHat, Flame, Sparkles, Timer } from "lucide-react";
import type { MealPlan, Vendor } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { Badge } from "@/frontend/components/ui/badge";
import { Rating } from "@/frontend/components/ui/rating";
import { formatPrice } from "@/frontend/lib/format";
import { PLAN_GOAL_EMOJI } from "@/frontend/lib/subscriptions";

/**
 * PlanHero — the header of a meal-plan detail page (Phase C15). Four stats sit
 * under the title because they are the four questions a subscriber asks before
 * anything else: what does a meal cost, how often does it come, how much am I
 * eating, and how soon can it start.
 */
export function PlanHero({
  plan,
  vendor,
  fromPrice,
}: {
  plan: MealPlan;
  vendor: Vendor | null;
  fromPrice: number;
}) {
  const t = useTranslations("subscriptions");
  const td = useTranslations("dietary");
  const currency = plan.currency as CurrencyCode;

  const stats = [
    {
      icon: Sparkles,
      label: t("stat.fromPerMeal"),
      value: formatPrice(fromPrice, currency),
    },
    {
      icon: CalendarDays,
      label: t("stat.schedule"),
      value: t("daysPerWeek", { count: plan.deliveryDays.length }),
    },
    {
      icon: Flame,
      label: t("stat.perDay"),
      value: t("kcalPerDay", { value: plan.nutritionPerDay.calories }),
    },
    {
      icon: Timer,
      label: t("stat.startsIn"),
      value: t("leadTimeDays", { count: plan.leadTimeDays }),
    },
  ];

  return (
    <section className="border-b border-line bg-surface-alt">
      <div className="container-site py-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="fresh">
                <span aria-hidden>{PLAN_GOAL_EMOJI[plan.goal]}</span>
                {t(`goal.${plan.goal}`)}
              </Badge>
              {plan.dietary.map((tag) => (
                <Badge key={tag}>{td(tag)}</Badge>
              ))}
            </div>

            <h1 className="mt-3 text-h1 text-ink md:text-5xl md:leading-tight">{plan.name}</h1>
            <p className="mt-2 text-lg text-body">{plan.tagline}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Rating value={plan.rating} count={plan.reviewCount} />
              {vendor && (
                <Link
                  href={`/restaurants/${vendor.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <ChefHat className="size-4" aria-hidden />
                  {t("cookedBy", { name: vendor.name })}
                </Link>
              )}
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-field bg-surface px-3.5 py-3">
                  <dt className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <Link
              href={`/meal-plans/${plan.slug}/subscribe`}
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
            >
              {t("startPlan")}
            </Link>
          </div>

          <div className="relative aspect-[16/10] overflow-hidden rounded-panel shadow-card">
            <Image
              src={plan.cover}
              alt={plan.name}
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
