"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarRange, RefreshCw } from "lucide-react";
import type { AssistantEntities, DietPlan } from "@/types";
import { buildDietPlan, planTotals, MAX_PLAN_DAYS } from "@/services/ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlanBlock } from "./assistant-blocks";
import { NutritionBars } from "./nutrition-bars";
import { useAssistantContext } from "./use-assistant-context";

const DAY_CHOICES = [1, 3, 7] as const;

/**
 * DietPlanner — the planner as a standing tool rather than a chat answer
 * (spec: Diet Planner, Meal Recommendation).
 *
 * It reads the same food profile the conversation does, so a nut allergy
 * declared in a reply is honoured here without being entered twice, and it
 * rebuilds whenever that profile changes — a plan that still contains peanuts
 * after you declared the allergy is worse than no plan.
 *
 * The plan is **projected, never stored**: nothing is ordered, nothing is
 * scheduled, and building it again with the same profile on the same day gives
 * the same days back, because the planner is a deterministic best fit rather
 * than a shuffle (`lib/nutrition.planDays`).
 */
export function DietPlanner() {
  const t = useTranslations("ai");
  const ctx = useAssistantContext();
  const [days, setDays] = useState<number>(3);
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [entities, setEntities] = useState<AssistantEntities>({ foods: {}, vendors: {} });
  const [loading, setLoading] = useState(true);
  /** Bumped by the rebuild button — the only way to ask for the same plan twice. */
  const [nonce, setNonce] = useState(0);

  // The effect only *reads*; every state write happens in the promise callback,
  // the codebase's data-loading shape (a synchronous setState in an effect body
  // is a lint error here). The spinner is raised by whichever control asked.
  useEffect(() => {
    let live = true;
    void buildDietPlan(ctx, days).then((res) => {
      if (!live) return;
      setLoading(false);
      if (!res.data) {
        setPlan(null);
        toast.error(t(res.error));
        return;
      }
      setPlan(res.data.plan);
      setEntities(res.data.entities);
    });
    return () => {
      live = false;
    };
  }, [ctx, days, nonce, t]);

  /** Any control that changes what the plan is asks for the spinner itself. */
  const request = useCallback((next: number) => {
    setLoading(true);
    setDays(next);
    setNonce((n) => n + 1);
  }, []);

  const totals = plan ? planTotals(plan) : null;

  return (
    <section className="rounded-panel border border-line bg-surface p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-h3 text-ink">
            <CalendarRange className="size-5 text-primary" aria-hidden />
            {t("planner.heading")}
          </h2>
          <p className="mt-1 text-sm text-body">{t("planner.subtitle")}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {DAY_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => request(choice)}
              aria-pressed={days === choice}
              className={cn(
                "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                days === choice
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-surface text-body hover:border-primary hover:text-ink",
              )}
            >
              {t("planner.days", { count: Math.min(choice, MAX_PLAN_DAYS) })}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => request(days)}
            aria-label={t("planner.rebuild")}
            disabled={loading}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </header>

      {totals && plan ? (
        <>
          <div className="mt-4 rounded-card bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("planner.averageDay")}
            </p>
            <NutritionBars nutrition={totals.average} target={totals.target} className="mt-2" />
          </div>

          <div className="mt-4">
            <PlanBlock plan={plan} entities={entities} />
          </div>

          <p className="mt-3 text-xs text-muted">{t("note.planProjected")}</p>
        </>
      ) : (
        <p className="mt-4 rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {loading ? t("planner.building") : t("planner.empty")}
        </p>
      )}
    </section>
  );
}
