import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, Flame } from "lucide-react";
import type { MealPlan } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { Badge } from "@/frontend/components/ui/badge";
import { Rating } from "@/frontend/components/ui/rating";
import { formatPrice } from "@/frontend/lib/format";
import { PLAN_GOAL_EMOJI } from "@/frontend/lib/subscriptions";
import { cn } from "@/frontend/lib/utils";

/**
 * MealPlanCard — the listing card for a subscription plan (Phase C15). Reused
 * by the directory and the "from this kitchen" rail on a vendor page. It leads
 * with what a subscriber actually compares: the goal, the per-meal price after
 * the commitment discount, how many days a week it runs, and the daily calories.
 */
export function MealPlanCard({
  plan,
  fromPrice,
  vendorName,
  className,
}: {
  plan: MealPlan;
  /** Cheapest effective per-meal price across the plan's tiers. */
  fromPrice: number;
  vendorName?: string;
  className?: string;
}) {
  const t = useTranslations("subscriptions");
  const currency = plan.currency as CurrencyCode;

  return (
    <Link
      href={`/meal-plans/${plan.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-card-hover",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={plan.cover}
          alt={plan.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105"
        />
        <Badge
          tone="neutral"
          className="absolute start-3 top-3 bg-surface/95 shadow-sm backdrop-blur"
        >
          <span aria-hidden>{PLAN_GOAL_EMOJI[plan.goal]}</span>
          {t(`goal.${plan.goal}`)}
        </Badge>
        {plan.isFeatured && (
          <Badge
            tone="primary"
            className="absolute end-3 top-3 bg-primary text-white shadow-sm"
          >
            {t("featured")}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-extrabold text-ink group-hover:text-primary">{plan.name}</h3>
          <Rating value={plan.rating} count={plan.reviewCount} className="shrink-0" />
        </div>
        {vendorName && <p className="mt-0.5 text-xs text-muted">{vendorName}</p>}
        <p className="mt-1.5 line-clamp-2 text-sm text-body">{plan.tagline}</p>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          <li className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            {t("daysPerWeek", { count: plan.deliveryDays.length })}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Flame className="size-3.5" aria-hidden />
            {t("kcalPerDay", { value: plan.nutritionPerDay.calories })}
          </li>
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-wrap gap-1">
            {plan.slots.map((slot) => (
              <span
                key={slot}
                className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-body"
              >
                {t(`slot.${slot}`)}
              </span>
            ))}
          </div>
          <p className="shrink-0 text-end">
            <span className="block text-xs text-muted">{t("from")}</span>
            <span className="text-base font-extrabold text-ink">
              {formatPrice(fromPrice, currency)}
            </span>
            <span className="text-xs font-normal text-muted"> / {t("mealUnit")}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
