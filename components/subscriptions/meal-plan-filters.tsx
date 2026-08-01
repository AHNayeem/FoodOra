"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { MealSlot, PlanGoal } from "@/types";
import { MEAL_SLOTS, PLAN_GOALS, PLAN_GOAL_EMOJI } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

export type PlanSortKey = "recommended" | "rating" | "price-low" | "calories-low";

const SORTS: PlanSortKey[] = ["recommended", "rating", "price-low", "calories-low"];

interface Props {
  goal: PlanGoal | "";
  slot: MealSlot | "";
  sort: PlanSortKey;
  search: string;
}

/**
 * MealPlanFilters — the meal-plan directory filter bar (Phase C15). Same
 * contract as the catering and restaurant directories: the URL query string is
 * the source of truth, current state arrives as props parsed server-side, and
 * every change rewrites the query so a filtered view stays shareable.
 */
export function MealPlanFilters({ goal, slot, sort, search }: Props) {
  const t = useTranslations("subscriptions");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(search);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = setTimeout(() => push({ search: q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function push(next: Partial<Props>) {
    const merged: Props = { goal, slot, sort, search: q, ...next };
    const params = new URLSearchParams();
    if (merged.goal) params.set("goal", merged.goal);
    if (merged.slot) params.set("slot", merged.slot);
    if (merged.sort !== "recommended") params.set("sort", merged.sort);
    if (merged.search.trim()) params.set("q", merged.search.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasFilters = goal !== "" || slot !== "" || sort !== "recommended" || search !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-12 w-full rounded-pill border border-line bg-surface ps-12 pe-4 text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
        />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <FilterChip active={goal === ""} onClick={() => push({ goal: "" })}>
          {t("allGoals")}
        </FilterChip>
        {PLAN_GOALS.map((g) => (
          <FilterChip key={g} active={goal === g} onClick={() => push({ goal: g })}>
            <span aria-hidden>{PLAN_GOAL_EMOJI[g]}</span>
            {t(`goal.${g}`)}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <SlotChip active={slot === ""} onClick={() => push({ slot: "" })}>
            {t("anyMeal")}
          </SlotChip>
          {MEAL_SLOTS.map((s) => (
            <SlotChip key={s} active={slot === s} onClick={() => push({ slot: s })}>
              {t(`slot.${s}`)}
            </SlotChip>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-body">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
          <select
            value={sort}
            onChange={(e) => push({ sort: e.target.value as PlanSortKey })}
            className="h-10 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
          >
            {SORTS.map((sk) => (
              <option key={sk} value={sk}>
                {t(`sort.${sk}`)}
              </option>
            ))}
          </select>
        </label>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(pathname, { scroll: false });
            }}
            className="ms-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <X className="size-4" aria-hidden />
            {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function SlotChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-fresh bg-fresh/10 text-fresh-600"
          : "border-line text-body hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
