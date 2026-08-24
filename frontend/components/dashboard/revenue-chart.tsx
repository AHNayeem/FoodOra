"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenuePoint } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatCompact, formatPrice } from "@/lib/format";

const AXIS = "#948d85"; // --color-muted, readable on both themes
const GRID = "rgba(148,141,133,0.18)";
const BRAND = "#f24822"; // --color-primary

const DAY_MS = 86_400_000;

interface Row {
  day: string;
  /** The bucket's own span, so the tooltip can name a week rather than a day. */
  heading: string;
  revenue: number;
  orders: number;
}

/** Themed tooltip card matching the dashboard surface tokens. */
function ChartTooltip({
  active,
  payload,
  currency,
  ordersLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  currency: CurrencyCode;
  ordersLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-field border border-line bg-surface px-3 py-2 shadow-menu">
      <p className="text-xs font-semibold text-ink">{row.heading}</p>
      <p className="mt-0.5 text-sm font-bold text-primary">
        {formatPrice(row.revenue, currency)}
      </p>
      <p className="text-xs text-muted">
        {row.orders} {ordersLabel}
      </p>
    </div>
  );
}

/**
 * RevenueChart — the revenue trend as a soft area chart (Recharts). Colours are
 * fixed brand/muted values that read on both light and dark surfaces; the tooltip
 * uses semantic tokens so it adapts to the theme.
 *
 * Phase 10 widened it from "the last seven days" to "whatever window the range
 * control resolved". Only the *labelling* changed, and it changed here rather than
 * in `lib/analytics`: a bucket knows how many days it spans (`spanDays`) and this
 * component turns that into a label with the request's own formatter, so the axis
 * reads correctly in Bengali and Arabic. A pre-formatted string from a pure module
 * could not, and hard-coding "Aug" into the domain layer is how a localised
 * dashboard ends up with one English axis.
 */
export function RevenueChart({
  data,
  currency,
}: {
  data: RevenuePoint[];
  currency: CurrencyCode;
}) {
  const t = useTranslations("dashboard");
  const tDays = useTranslations("days");
  const format = useFormatter();

  const short = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short" });

  const rows: Row[] = data.map((p) => {
    const span = p.spanDays ?? 1;
    const start = new Date(p.date);
    // A single day is still named by its weekday — that is what a restaurant
    // comparing Fridays wants, and it is what this chart always did.
    if (span <= 1) {
      return {
        day: data.length > 8 ? short(p.date) : tDays(p.dayKey),
        heading: format.dateTime(start, { weekday: "short", day: "numeric", month: "short" }),
        revenue: p.revenue,
        orders: p.orders,
      };
    }
    const end = new Date(start.getTime() + (span - 1) * DAY_MS);
    return {
      day: short(p.date),
      // The full span, because a bar labelled "12 Aug" that actually covers a week
      // is the most plausibly wrong thing this chart could say.
      heading: `${short(p.date)} – ${short(end.toISOString())}`,
      revenue: p.revenue,
      orders: p.orders,
    };
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            // A wide window has more buckets than a phone has room for labels, so
            // Recharts is told to thin them rather than overlap them.
            interval={rows.length > 10 ? "preserveStartEnd" : 0}
            minTickGap={16}
            dy={6}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: GRID }}
            content={
              <ChartTooltip currency={currency} ordersLabel={t("ordersLower")} />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={BRAND}
            strokeWidth={2.5}
            fill="url(#revFill)"
            dot={rows.length > 14 ? false : { r: 3, fill: BRAND, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
