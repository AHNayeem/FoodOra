"use client";

import { useTranslations } from "next-intl";
import type { NutritionFacts } from "@/types";
import { macroShares } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/**
 * NutritionBars — calories plus the protein/carbs/fat split (spec: Nutrition
 * Analysis, Calories, Protein, Carbs, Fat).
 *
 * One stacked bar rather than three, because the interesting thing about macros
 * is their *proportion*: three separate bars invite reading grams against each
 * other, which is meaningless when a gram of fat carries twice the energy of a
 * gram of carbohydrate. The widths here are shares of energy
 * (`lib/nutrition.macroShares`), the numbers underneath are grams.
 */
export function NutritionBars({
  nutrition,
  target,
  compact = false,
  className,
}: {
  nutrition: NutritionFacts;
  /** Daily calorie target, when this is a whole day rather than one dish. */
  target?: number;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("ai");
  const shares = macroShares(nutrition);

  const macros = [
    { key: "protein", grams: nutrition.protein, share: shares.protein, tone: "bg-fresh-500" },
    { key: "carbs", grams: nutrition.carbs, share: shares.carbs, tone: "bg-accent-500" },
    { key: "fat", grams: nutrition.fat, share: shares.fat, tone: "bg-primary" },
  ] as const;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-ink">
          {t("nutrition.calories", { value: nutrition.calories })}
        </span>
        {target ? (
          <span className="text-xs text-muted">
            {t("nutrition.ofTarget", {
              percent: Math.round((nutrition.calories / Math.max(target, 1)) * 100),
            })}
          </span>
        ) : null}
      </div>

      <div
        className="mt-2 flex h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
        role="img"
        aria-label={t("nutrition.barLabel", {
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
        })}
      >
        {macros.map((macro) => (
          <span
            key={macro.key}
            className={macro.tone}
            style={{ width: `${Math.max(0, macro.share * 100)}%` }}
          />
        ))}
      </div>

      <dl
        className={cn(
          "mt-2 grid grid-cols-3 gap-2",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {macros.map((macro) => (
          <div key={macro.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-muted">
              <span className={cn("size-2 shrink-0 rounded-pill", macro.tone)} aria-hidden />
              <span className="truncate">{t(`nutrition.${macro.key}`)}</span>
            </dt>
            <dd className="font-semibold text-ink">{t("nutrition.grams", { value: macro.grams })}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
