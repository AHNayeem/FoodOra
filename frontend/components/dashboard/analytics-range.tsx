"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CalendarRange } from "lucide-react";
import type { AnalyticsRange, AnalyticsRangeKey } from "@/types";
import { RANGE_KEYS } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * AnalyticsRangeControl — the window every figure on the page is computed over
 * (Phase 10, G23).
 *
 * A row of presets plus a custom pair, which is the same shape `PayoutFilters`
 * uses for periods and for the same reason: the chips answer the question a
 * restaurant asks nine times out of ten in one tap, and the date inputs exist for
 * the tenth. Native `<input type="date">` rather than a bespoke calendar — it is
 * keyboard-operable, it is localised by the platform, and it is the control a phone
 * gives a spinner for.
 *
 * The component reports a *key and a pair of dates*; it never resolves a window
 * itself. `lib/analytics.resolveRange` does that, once, so the figures, the chart
 * buckets and the CSV header cannot describe three slightly different windows.
 */
export function AnalyticsRangeControl({
  range,
  custom,
  onChange,
  disabled = false,
}: {
  /** The resolved window, for the summary line. */
  range: AnalyticsRange;
  /** The custom pair as the inputs currently hold it. */
  custom: { from: string; to: string };
  onChange: (next: {
    key: AnalyticsRangeKey;
    custom: { from: string; to: string };
  }) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("analytics");
  const format = useFormatter();

  const day = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {RANGE_KEYS.map((key) => {
          const active = range.key === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange({ key, custom })}
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {key === "custom" && <CalendarRange className="size-4" aria-hidden />}
              {t(`range.${key}`)}
            </button>
          );
        })}
      </div>

      {range.key === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted">
              {t("rangeFrom")}
            </span>
            <Input
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              disabled={disabled}
              onChange={(e) =>
                onChange({ key: "custom", custom: { ...custom, from: e.target.value } })
              }
              className="w-auto"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted">{t("rangeTo")}</span>
            <Input
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              disabled={disabled}
              onChange={(e) =>
                onChange({ key: "custom", custom: { ...custom, to: e.target.value } })
              }
              className="w-auto"
            />
          </label>
        </div>
      )}

      {/* The resolved window, spelled out. A preset chip says "30 days"; this says
          which thirty, because that is what somebody comparing the page to a
          spreadsheet needs — and it is the same pair the export names. */}
      <p className="text-xs text-muted">
        {t("rangeSummary", {
          from: day(range.from),
          to: day(range.to),
          days: range.days,
        })}
      </p>
    </div>
  );
}
