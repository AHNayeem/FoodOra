"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import {
  SETTLEMENT_STATUSES,
  type PayoutQuery,
} from "@/lib/payout-search";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * PayoutFilters — the search and filter bar the payout run uses for both payees
 * (Phase 8, G17).
 *
 * Shared rather than written twice for the reason `ApplicationFilters` is: the
 * *behaviour* has to match. The status counts move with the search and the period
 * but not with the status selection, and reproducing that rule in a vendor copy and
 * a rider copy is how one of them ends up wrong. The screen supplies the counts and
 * the periods; this only renders and reports.
 */
export function PayoutFilters({
  query,
  onChange,
  counts,
  payableCount,
  periods,
  searchPlaceholder,
  searchLabel,
}: {
  query: PayoutQuery;
  onChange: (next: PayoutQuery) => void;
  counts: Record<string, number>;
  payableCount: number;
  /** Every period present in the data, newest first. */
  periods: string[];
  searchPlaceholder: string;
  searchLabel: string;
}) {
  const t = useTranslations("finance");

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
        {/* "What can I pay today" is the question this screen exists to answer, so
            it is its own toggle and survives changing the status filter. It is not
            the same as `pending`: a period that nets to nothing is pending and has
            nothing to send. */}
        <Chip
          label={t("filterPayable")}
          count={payableCount}
          active={query.payableOnly}
          onClick={() => onChange({ ...query, payableOnly: !query.payableOnly })}
          emphasis
        />
        <Chip
          label={t("filterAny")}
          active={query.status === null}
          onClick={() => onChange({ ...query, status: null })}
        />
        {SETTLEMENT_STATUSES.map((status) => (
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

      {/* Periods come from the data, so the filter never offers a week the platform
          did no business in. */}
      {periods.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip
            label={t("periodAll")}
            active={query.periodRef === null}
            onClick={() => onChange({ ...query, periodRef: null })}
          />
          {periods.map((periodRef) => (
            <Chip
              key={periodRef}
              label={periodRef}
              active={query.periodRef === periodRef}
              onClick={() =>
                onChange({
                  ...query,
                  periodRef: query.periodRef === periodRef ? null : periodRef,
                })
              }
            />
          ))}
        </div>
      )}
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
