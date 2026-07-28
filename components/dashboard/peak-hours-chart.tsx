"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import type { HourlyPoint } from "@/types";

const AXIS = "#948d85";
const BRAND = "#f24822";
const BRAND_SOFT = "rgba(242,72,34,0.28)";

/** Format an hour (0–23) as a short 12-hour label, e.g. 13 → "1p". */
function hourLabel(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${period}`;
}

interface Row {
  label: string;
  hour: number;
  orders: number;
}

function ChartTooltip({
  active,
  payload,
  ordersLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  ordersLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-field border border-line bg-surface px-3 py-2 shadow-menu">
      <p className="text-xs font-semibold text-ink">{hourRange(row.hour)}</p>
      <p className="mt-0.5 text-sm font-bold text-primary">
        {row.orders} {ordersLabel}
      </p>
    </div>
  );
}

function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}

/**
 * PeakHoursChart — orders-per-hour bar chart highlighting service peaks. The
 * busiest hour is emphasised with the solid brand colour; the rest are softened.
 */
export function PeakHoursChart({ data }: { data: HourlyPoint[] }) {
  const t = useTranslations("dashboard");

  const max = Math.max(1, ...data.map((d) => d.orders));
  const rows: Row[] = data.map((d) => ({
    label: hourLabel(d.hour),
    hour: d.hour,
    orders: d.orders,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            interval={1}
            dy={4}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,141,133,0.08)" }}
            content={<ChartTooltip ordersLabel={t("ordersLower")} />}
          />
          <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={26}>
            {rows.map((row) => (
              <Cell
                key={row.hour}
                fill={row.orders === max ? BRAND : BRAND_SOFT}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
