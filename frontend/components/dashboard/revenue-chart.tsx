"use client";

import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenuePoint } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatCompact, formatPrice } from "@/frontend/lib/format";

const AXIS = "#948d85"; // --color-muted, readable on both themes
const GRID = "rgba(148,141,133,0.18)";
const BRAND = "#f24822"; // --color-primary

interface Row {
  day: string;
  revenue: number;
  orders: number;
}

/** Themed tooltip card matching the dashboard surface tokens. */
function ChartTooltip({
  active,
  payload,
  label,
  currency,
  ordersLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  label?: string;
  currency: CurrencyCode;
  ordersLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-field border border-line bg-surface px-3 py-2 shadow-menu">
      <p className="text-xs font-semibold text-ink">{label}</p>
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
 * RevenueChart — 7-day revenue trend as a soft area chart (Recharts). Colours
 * are fixed brand/muted values that read on both light and dark surfaces; the
 * tooltip uses semantic tokens so it adapts to the theme.
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

  const rows: Row[] = data.map((p) => ({
    day: tDays(p.dayKey),
    revenue: p.revenue,
    orders: p.orders,
  }));

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
            dot={{ r: 3, fill: BRAND, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
