"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { OnboardingStatus } from "@/types";
import {
  APPLICATION_DATE_RANGES,
  type ApplicationQuery,
} from "@/lib/onboarding-search";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * ApplicationFilters — the search and filter bar both admin queues use
 * (Phases 6–7).
 *
 * Shared rather than written twice because the *behaviour* is what has to match:
 * the status counts move with the search and the date window but not with the
 * status selection, and reproducing that rule in two components is how one of them
 * ends up wrong. The queue supplies the statuses and the counts; this only renders
 * and reports.
 */
export function ApplicationFilters({
  query,
  onChange,
  statuses,
  counts,
  awaitingCount,
  searchPlaceholder,
  searchLabel,
}: {
  query: ApplicationQuery;
  onChange: (next: ApplicationQuery) => void;
  statuses: readonly OnboardingStatus[];
  counts: Record<string, number>;
  awaitingCount: number;
  searchPlaceholder: string;
  searchLabel: string;
}) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query.text}
          onChange={(e) => onChange({ ...query, text: e.target.value })}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="ps-10"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {/* The pending queue is its own toggle rather than a status chip: it is the
            question this screen exists to answer, and it must survive changing the
            status filter. */}
        <Chip
          label={t("filterAwaiting")}
          count={awaitingCount}
          active={query.awaitingOnly}
          onClick={() => onChange({ ...query, awaitingOnly: !query.awaitingOnly })}
          emphasis
        />
        <Chip
          label={t("filterAny")}
          active={query.status === null}
          onClick={() => onChange({ ...query, status: null })}
        />
        {statuses.map((status) => (
          <Chip
            key={status}
            label={t(`status.${status}`)}
            count={counts[status] ?? 0}
            active={query.status === status}
            onClick={() =>
              onChange({ ...query, status: query.status === status ? null : status })
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {APPLICATION_DATE_RANGES.map((range) => (
          <Chip
            key={range}
            label={t(`range.${range}`)}
            active={query.range === range}
            onClick={() => onChange({ ...query, range })}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
  emphasis,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : emphasis
            ? "border-accent/40 bg-accent-50/60 text-accent-600 hover:bg-accent-50"
            : "border-line text-body hover:bg-surface-muted",
      )}
    >
      {label}
      {count != null && (
        <span className="text-xs font-bold tabular-nums opacity-70">{count}</span>
      )}
    </button>
  );
}
