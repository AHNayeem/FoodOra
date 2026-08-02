"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, Flame, Store } from "lucide-react";
import type { Allergen, FoodItem, Vendor } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { AddToCartButton } from "@/frontend/components/menu/add-to-cart-button";
import { toCartVendor } from "@/frontend/lib/cart";
import { formatPrice } from "@/frontend/lib/format";
import { allergenConflicts, estimateNutrition } from "@/frontend/lib/nutrition";
import { cn } from "@/frontend/lib/utils";

/**
 * DishSuggestion — a dish the assistant offered.
 *
 * It is a *suggestion*, not a search result, so it says three things a search
 * card does not: the estimated calories, whether it clashes with the customer's
 * allergy profile, and — most importantly — it can be ordered without leaving
 * the conversation. That last part is why it reuses `AddToCartButton` verbatim:
 * a second add-to-cart path would be a second place the single-vendor rule
 * could be got wrong.
 *
 * A dish that conflicts with a declared allergy is still rendered (the customer
 * may be asking on someone else's behalf) but is marked and cannot be added by
 * accident — the warning sits between the name and the button.
 */
export function DishSuggestion({
  food,
  vendor,
  avoid,
  className,
}: {
  food: FoodItem;
  vendor: Vendor;
  avoid: Allergen[];
  className?: string;
}) {
  const t = useTranslations("ai");
  const conflicts = allergenConflicts(food, avoid);
  const { nutrition } = estimateNutrition(food);
  const currency = vendor.currency as CurrencyCode;

  return (
    <article
      className={cn(
        "flex gap-3 rounded-card border bg-surface p-2.5 transition-shadow hover:shadow-card",
        conflicts.length ? "border-danger/40" : "border-line",
        className,
      )}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-field bg-surface-muted">
        <Image src={food.image} alt={food.name} fill sizes="64px" className="object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{food.name}</h4>
          <span className="shrink-0 text-sm font-semibold text-ink">
            {formatPrice(food.price, currency)}
          </span>
        </div>

        <Link
          href={`/restaurants/${vendor.slug}`}
          className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted hover:text-primary"
        >
          <Store className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{vendor.name}</span>
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{t("nutrition.calories", { value: nutrition.calories })}</span>
          <span>{t("nutrition.proteinShort", { value: nutrition.protein })}</span>
          {food.spicyLevel > 0 && (
            <span className="inline-flex items-center gap-0.5" aria-label={t("chip.spicy")}>
              {Array.from({ length: food.spicyLevel }).map((_, i) => (
                <Flame key={i} className="size-3 text-primary" aria-hidden />
              ))}
            </span>
          )}
        </div>

        {conflicts.length > 0 && (
          <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-field bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              {t("dish.conflict", {
                allergens: conflicts.map((a) => t(`allergen.${a}`)).join(", "),
              })}
            </span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-end">
        <AddToCartButton item={food} vendor={toCartVendor(vendor)} />
      </div>
    </article>
  );
}
