import { useTranslations } from "next-intl";
import type { NutritionFacts } from "@/frontend/types";
import { cn } from "@/frontend/lib/utils";

/**
 * NutritionStrip — the four macros, shown identically wherever they appear
 * (plan card, plan hero, every dish on the weekly menu). Numbers go through ICU
 * so they localise: Bengali renders its own numerals (Phase C15).
 */
export function NutritionStrip({
  nutrition,
  variant = "inline",
  className,
}: {
  nutrition: NutritionFacts;
  /** `inline` for a one-line summary, `grid` for the four-cell panel. */
  variant?: "inline" | "grid";
  className?: string;
}) {
  const t = useTranslations("subscriptions");

  const rows = [
    { key: "calories", label: t("macro.calories"), value: t("kcal", { value: nutrition.calories }) },
    { key: "protein", label: t("macro.protein"), value: t("grams", { value: nutrition.protein }) },
    { key: "carbs", label: t("macro.carbs"), value: t("grams", { value: nutrition.carbs }) },
    { key: "fat", label: t("macro.fat"), value: t("grams", { value: nutrition.fat }) },
  ];

  if (variant === "grid") {
    return (
      <dl className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
        {rows.map((row) => (
          <div key={row.key} className="rounded-field bg-surface-muted px-3.5 py-2.5">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="mt-0.5 text-sm font-bold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <p className={cn("text-xs text-muted", className)}>
      {rows.map((row) => row.value).join(" · ")}
    </p>
  );
}
