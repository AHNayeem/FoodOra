"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import type {
  AiReviewSummary,
  Allergen,
  AssistantBlock,
  AssistantEntities,
  DietPlan,
  DishInsight,
  RecognitionResult,
} from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { fromDateKey } from "@/frontend/lib/dates";
import { cn } from "@/frontend/lib/utils";
import { DishSuggestion } from "./dish-suggestion";
import { VendorSuggestion } from "./vendor-suggestion";
import { NutritionBars } from "./nutrition-bars";
import { FoodProfileForm } from "./food-profile-form";

/**
 * The block renderers — one per `AssistantBlock` kind.
 *
 * Every block resolves its ids against {@link AssistantEntities}, the cache the
 * chat hook fills from the seam, and **renders nothing when an id no longer
 * resolves** rather than drawing a hole. That is the C23 favorites rule applied
 * to a conversation: a thread from last week that mentions a delisted dish
 * quietly loses that card instead of breaking.
 */
export function AssistantBlocks({
  blocks,
  entities,
  avoid,
}: {
  blocks: AssistantBlock[];
  entities: AssistantEntities;
  avoid: Allergen[];
}) {
  if (!blocks.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} entities={entities} avoid={avoid} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  entities,
  avoid,
}: {
  block: AssistantBlock;
  entities: AssistantEntities;
  avoid: Allergen[];
}) {
  switch (block.kind) {
    case "dishes":
      return <DishesBlock foodIds={block.foodIds} entities={entities} avoid={avoid} />;
    case "vendors":
      return <VendorsBlock vendorIds={block.vendorIds} entities={entities} />;
    case "insight":
      return <InsightBlock insight={block.insight} entities={entities} />;
    case "allergy":
      return <AllergyBlock conflicts={block.conflicts} entities={entities} />;
    case "plan":
      return <PlanBlock plan={block.plan} entities={entities} />;
    case "review-summary":
      return <ReviewSummaryBlock summary={block.summary} entities={entities} />;
    case "recognition":
      return <RecognitionBlock result={block.result} entities={entities} />;
    case "link":
      return <LinkBlock labelKey={block.labelKey} values={block.values} href={block.href} />;
    case "profile":
      return <FoodProfileForm compact />;
    default:
      return null;
  }
}

function DishesBlock({
  foodIds,
  entities,
  avoid,
}: {
  foodIds: string[];
  entities: AssistantEntities;
  avoid: Allergen[];
}) {
  const resolved = foodIds
    .map((id) => entities.foods[id])
    .filter(Boolean)
    .map((entry) => ({ food: entry.food, vendor: entities.vendors[entry.vendorId] }))
    .filter((entry) => Boolean(entry.vendor));

  if (!resolved.length) return null;
  return (
    <div className="space-y-2">
      {resolved.map(({ food, vendor }) => (
        <DishSuggestion key={food.id} food={food} vendor={vendor} avoid={avoid} />
      ))}
    </div>
  );
}

function VendorsBlock({
  vendorIds,
  entities,
}: {
  vendorIds: string[];
  entities: AssistantEntities;
}) {
  const resolved = vendorIds.map((id) => entities.vendors[id]).filter(Boolean);
  if (!resolved.length) return null;
  return (
    <div className="space-y-2">
      {resolved.map((vendor) => (
        <VendorSuggestion key={vendor.id} vendor={vendor} />
      ))}
    </div>
  );
}

/** One dish, fully analysed: macros, tags and every allergen it may carry. */
function InsightBlock({
  insight,
  entities,
}: {
  insight: DishInsight;
  entities: AssistantEntities;
}) {
  const t = useTranslations("ai");
  const entry = entities.foods[insight.foodId];
  if (!entry) return null;
  const vendor = entities.vendors[insight.vendorId];

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <header className="flex items-baseline justify-between gap-3">
        <h4 className="min-w-0 truncate text-sm font-semibold text-ink">{entry.food.name}</h4>
        <span
          className={cn(
            "shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            insight.estimate.confidence === "high"
              ? "bg-fresh-50 text-fresh-600"
              : insight.estimate.confidence === "medium"
                ? "bg-accent-50 text-accent-600"
                : "bg-surface-muted text-muted",
          )}
        >
          {t(`confidence.${insight.estimate.confidence}`)}
        </span>
      </header>

      <NutritionBars nutrition={insight.estimate.nutrition} className="mt-3" />

      <p className="mt-3 text-xs text-muted">
        {t("insight.basedOn", { profile: t(`profileClass.${insight.estimate.profile}`) })}
      </p>

      {insight.allergens.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold text-ink">{t("insight.mayContain")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {insight.allergens.map((allergen) => {
              const clashes = insight.conflicts.includes(allergen);
              return (
                <li
                  key={allergen}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-medium",
                    clashes ? "bg-danger/10 text-danger" : "bg-surface-muted text-body",
                  )}
                >
                  {clashes && <AlertTriangle className="size-3" aria-hidden />}
                  {t(`allergen.${allergen}`)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 border-t border-line pt-3 text-xs font-medium text-fresh-600">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("insight.noneDetected")}
        </p>
      )}

      {vendor && (
        <Link
          href={`/restaurants/${vendor.slug}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {t("insight.viewOnMenu", { vendor: vendor.name })}
          <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** The dishes to steer around — the other half of an allergy answer. */
function AllergyBlock({
  conflicts,
  entities,
}: {
  conflicts: DishInsight[];
  entities: AssistantEntities;
}) {
  const t = useTranslations("ai");
  const rows = conflicts.filter((insight) => entities.foods[insight.foodId]);
  if (!rows.length) return null;

  return (
    <section className="rounded-card border border-danger/30 bg-danger/5 p-3">
      <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
        <AlertTriangle className="size-4" aria-hidden />
        {t("allergy.avoidHeading")}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {rows.map((insight) => (
          <li key={insight.foodId} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-ink">
              {entities.foods[insight.foodId].food.name}
            </span>
            <span className="shrink-0 text-danger">
              {insight.conflicts.map((a) => t(`allergen.${a}`)).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The diet planner's output: days, each with three meals and a running total. */
export function PlanBlock({ plan, entities }: { plan: DietPlan; entities: AssistantEntities }) {
  const t = useTranslations("ai");
  const format = useFormatter();
  const currency = plan.currency as CurrencyCode;

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{t(`goal.${plan.goal}`)}</h4>
        <span className="text-xs text-muted">
          {t("plan.targetLine", { target: plan.target })}
        </span>
      </header>

      <div className="mt-3 space-y-4">
        {plan.days.map((day) => (
          <div key={day.date}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {format.dateTime(fromDateKey(day.date), { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <p className="text-xs text-muted">
                {t("nutrition.calories", { value: day.total.calories })}
              </p>
            </div>

            <ul className="mt-1.5 space-y-1">
              {day.meals.map((meal) => {
                const entry = entities.foods[meal.foodId];
                const vendor = entities.vendors[meal.vendorId];
                if (!entry) return null;
                return (
                  <li
                    key={`${day.date}-${meal.slot}`}
                    className="flex items-baseline gap-2 rounded-field bg-surface-muted px-2.5 py-1.5 text-xs"
                  >
                    <span className="w-16 shrink-0 font-semibold text-muted">
                      {t(`slot.${meal.slot}`)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{entry.food.name}</span>
                    {vendor && (
                      <span className="hidden shrink-0 text-muted sm:inline">{vendor.name}</span>
                    )}
                    <span className="shrink-0 text-muted">
                      {t("nutrition.calories", { value: meal.nutrition.calories })}
                    </span>
                  </li>
                );
              })}
            </ul>

            <NutritionBars nutrition={day.total} target={plan.target} compact className="mt-2" />
          </div>
        ))}
      </div>

      <footer className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-xs">
        <span className="text-muted">{t("plan.totalCost")}</span>
        <span className="font-semibold text-ink">{formatPrice(plan.totalCost, currency)}</span>
      </footer>
    </section>
  );
}

/** What the camera "saw" — with its confidence stated, never implied. */
function RecognitionBlock({
  result,
  entities,
}: {
  result: RecognitionResult;
  entities: AssistantEntities;
}) {
  const t = useTranslations("ai");
  const [topId] = result.foodIds;
  const top = topId ? entities.foods[topId] : undefined;
  if (!top) return null;

  return (
    <section className="rounded-card border border-line bg-surface-muted p-3">
      <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Camera className="size-4 text-primary" aria-hidden />
        {t(result.mode === "menu" ? "scan.menuHeading" : "scan.dishHeading")}
      </h4>
      <p className="mt-1 text-xs text-body">
        {t("scan.match", {
          dish: top.food.name,
          confidence: Math.round(result.confidence * 100),
        })}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface">
        <span
          className="block h-full bg-primary"
          style={{ width: `${Math.round(result.confidence * 100)}%` }}
        />
      </div>
    </section>
  );
}

/** AI Review Summary, rendered inside a reply. Shares its body with the band. */
function ReviewSummaryBlock({
  summary,
  entities,
}: {
  summary: AiReviewSummary;
  entities: AssistantEntities;
}) {
  const vendor = entities.vendors[summary.vendorId];
  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <ReviewSummaryBody summary={summary} vendorName={vendor?.name} />
    </section>
  );
}

/**
 * The review summary itself, shared by the chat block and the storefront band
 * (`ai-review-summary.tsx`), so the two can never say different things about
 * the same restaurant.
 */
export function ReviewSummaryBody({
  summary,
  vendorName,
}: {
  summary: AiReviewSummary;
  vendorName?: string;
}) {
  const t = useTranslations("ai");

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <h4 className="text-sm font-semibold text-ink">
          {vendorName ? t("review.headingNamed", { vendor: vendorName }) : t("review.heading")}
        </h4>
      </div>

      <p className="mt-2 text-sm text-body">
        {t(summary.verdictKey, {
          count: summary.reviewCount,
          average: summary.average.toFixed(1),
          recommend: Math.round(summary.recommendShare * 100),
        })}
      </p>

      {summary.praise.length > 0 && (
        <ThemeRow
          tone="good"
          label={t("review.praise")}
          items={summary.praise.map((tag) => t(`tag.${tag}`))}
        />
      )}
      {summary.gripes.length > 0 && (
        <ThemeRow
          tone="bad"
          label={t("review.gripes")}
          items={summary.gripes.map((tag) => t(`tag.${tag}`))}
        />
      )}

      {summary.aspects.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.aspects.map(({ aspect, score }) => (
            <div key={aspect} className="rounded-field bg-surface-muted px-2.5 py-2">
              <dt className="truncate text-xs text-muted">{t(`aspect.${aspect}`)}</dt>
              <dd className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
                <Star className="size-3 fill-rating text-rating" aria-hidden />
                {score.toFixed(1)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-xs text-muted">{t("note.reviewDerived")}</p>
    </div>
  );
}

function ThemeRow({
  tone,
  label,
  items,
}: {
  tone: "good" | "bad";
  label: string;
  items: string[];
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
        {tone === "good" ? (
          <CheckCircle2 className="size-3.5 text-fresh-600" aria-hidden />
        ) : (
          <AlertTriangle className="size-3.5 text-accent-600" aria-hidden />
        )}
        {label}
      </span>
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-pill px-2 py-0.5 text-xs font-medium",
            tone === "good" ? "bg-fresh-50 text-fresh-600" : "bg-accent-50 text-accent-600",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function LinkBlock({
  labelKey,
  values,
  href,
}: {
  labelKey: string;
  values?: Record<string, string | number>;
  href: string;
}) {
  const t = useTranslations("ai");
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
    >
      {t(labelKey, values)}
      <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
