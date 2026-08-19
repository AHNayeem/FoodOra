"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, Bike, Route, Wallet } from "lucide-react";
import type { RiderEarningsPoint, RiderEarningsSummary } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { getRiderEarnings, type EarningsRange } from "@/services/delivery";
import { fromDateKey, weekdayOf } from "@/lib/dates";
import { formatCompact, formatDistance, formatPrice } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";
import { useRiderApp } from "./rider-context";
import { useRiderRecords } from "./use-rider-records";

const RANGES: EarningsRange[] = ["today", "week", "month"];

const AXIS = "#948d85"; // --color-muted, readable on both themes
const GRID = "rgba(148,141,133,0.18)";
const BRAND = "#f24822"; // --color-primary

/**
 * EarningsView — `/delivery/earnings` (Phase C18; spec: Delivery Earnings).
 *
 * A rider's question is never "what is my revenue", it is "what did today pay,
 * and was it worth the kilometres" — so the screen leads with the day, breaks the
 * money into the four things that generate it (fare, distance, bonuses, tips) and
 * shows the distance beside it. All three ranges come from one function in the
 * seam, so the day cannot disagree with the week that contains it.
 */
export function EarningsView() {
  const t = useTranslations("delivery");
  const { rider, zone } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const { ctx, hydrated } = useRiderRecords();

  const [range, setRange] = useState<EarningsRange>("today");
  const [data, setData] = useState<{ range: EarningsRange; summary: RiderEarningsSummary } | null>(
    null,
  );

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getRiderEarnings({ riderId: rider.id, range, now: Date.now(), ctx }).then((summary) => {
      if (active && summary) setData({ range, summary });
    });
    return () => {
      active = false;
    };
  }, [rider.id, range, ctx, hydrated]);

  const loading = !data || data.range !== range;
  const summary = data?.summary;

  const rows: [string, number][] = summary
    ? [
        ["payoutBase", summary.baseFare],
        ["payoutDistance", summary.distanceFee],
        ["payoutBonuses", summary.bonuses],
        ["payoutTip", summary.tips],
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-ink">{t("earningsTitle")}</h1>
        <p className="text-sm text-muted">{t("earningsSubtitle")}</p>
      </div>

      <div
        role="tablist"
        aria-label={t("earningsTitle")}
        className="flex gap-1.5 rounded-pill border border-line bg-surface p-1"
      >
        {RANGES.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={range === option}
            type="button"
            onClick={() => setRange(option)}
            className={cn(
              "flex-1 rounded-pill py-2 text-sm font-semibold transition-colors",
              range === option
                ? "bg-primary text-white"
                : "text-body hover:bg-surface-muted",
            )}
          >
            {t(`range.${option}`)}
          </button>
        ))}
      </div>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-sm font-medium text-muted">{t(`rangeLabel.${range}`)}</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
          {formatPrice(summary?.earnings ?? 0, currency)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("perTrip", { amount: formatPrice(summary?.perTrip ?? 0, currency) })}
        </p>

        {loading ? (
          <div className="mt-4 flex h-48 items-center justify-center">
            <div className="size-7 animate-spin rounded-full border-2 border-line border-t-primary" />
          </div>
        ) : summary && summary.series.length > 1 ? (
          <EarningsChart series={summary.series} currency={currency} monthly={range === "month"} />
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t("statTrips")}
          value={String(summary?.trips ?? 0)}
          icon={Bike}
          hint={t("deliveriesCount", { count: summary?.deliveries ?? 0 })}
        />
        <StatCard
          label={t("statDistance")}
          value={formatDistance(summary?.distanceKm ?? 0)}
          icon={Route}
          hint={t("statDistanceHint")}
        />
        <StatCard
          label={t("statTips")}
          value={formatPrice(summary?.tips ?? 0, currency)}
          icon={Wallet}
          hint={t("statTipsHint")}
        />
        <StatCard
          label={t("statCashCollected")}
          value={formatPrice(summary?.cashCollected ?? 0, currency)}
          icon={Banknote}
          hint={t("statCashCollectedHint")}
        />
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{t("payoutBreakdown")}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {rows.map(([key, amount]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-body">{t(key)}</dt>
              <dd className="font-semibold text-ink">{formatPrice(amount, currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="font-bold text-ink">{t("payoutTotal")}</dt>
            <dd className="font-extrabold text-ink">
              {formatPrice(summary?.earnings ?? 0, currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          {t("fareRulesHint", {
            zone: zone.name,
            base: formatPrice(zone.baseFare, currency),
            perKm: formatPrice(zone.perKm, currency),
          })}
        </p>
      </section>
    </div>
  );
}

/** Earnings per day. Weekday labels for a week, dates for a month. */
function EarningsChart({
  series,
  currency,
  monthly,
}: {
  series: RiderEarningsPoint[];
  currency: CurrencyCode;
  monthly: boolean;
}) {
  const t = useTranslations("delivery");
  const tDays = useTranslations("days");

  const rows = series.map((point) => ({
    label: monthly
      ? String(fromDateKey(point.date).getDate())
      : tDays(weekdayOf(fromDateKey(point.date))),
    earnings: point.earnings,
    trips: point.trips,
  }));

  return (
    <div className="mt-4 h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            interval="preserveStartEnd"
            dy={6}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip
            cursor={{ fill: GRID }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <div className="rounded-field border border-line bg-surface px-3 py-2 shadow-menu">
                  <p className="text-xs font-semibold text-ink">{String(label)}</p>
                  <p className="mt-0.5 text-sm font-bold text-primary">
                    {formatPrice(row.earnings, currency)}
                  </p>
                  <p className="text-xs text-muted">
                    {t("tripsCount", { count: row.trips })}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="earnings" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
