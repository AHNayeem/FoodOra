"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RatingPoint } from "@/types";
import { formatRating } from "@/lib/format";

const AXIS = "#948d85"; // --color-muted, readable on both themes
const GRID = "rgba(148,141,133,0.18)";
const RATING = "#f5a524"; // --color-rating

interface Row {
  label: string;
  average: number;
  count: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  reviewsLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  label?: string;
  reviewsLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-field border border-line bg-surface px-3 py-2 shadow-menu">
      <p className="text-xs font-semibold text-ink">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">
        ★ {row.count === 0 ? "—" : formatRating(row.average)}
      </p>
      <p className="text-xs text-muted">
        {row.count} {reviewsLabel}
      </p>
    </div>
  );
}

/**
 * RatingTrendChart — six months of a restaurant's average (Phase C22).
 *
 * Fixed to the 1–5 domain rather than auto-scaled: a chart that zooms to
 * 4.6–4.8 turns ordinary noise into a cliff, which is exactly the wrong story to
 * tell a merchant about their own reviews. Months with no reviews break the line
 * instead of dropping it to zero — nothing happened, and a chart should not
 * report that as a collapse.
 */
export function RatingTrendChart({ data }: { data: RatingPoint[] }) {
  const t = useTranslations("reviews");
  const locale = useLocale();

  const rows: Row[] = data.map((point) => {
    const [year, month] = point.month.split("-").map(Number);
    return {
      label: new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short" }),
      average: point.count === 0 ? Number.NaN : point.average,
      count: point.count,
    };
  });

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            dy={6}
          />
          <YAxis
            width={32}
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: GRID }}
            content={<ChartTooltip reviewsLabel={t("reviewsLower")} />}
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke={RATING}
            strokeWidth={2.5}
            connectNulls={false}
            dot={{ r: 3, fill: RATING, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
