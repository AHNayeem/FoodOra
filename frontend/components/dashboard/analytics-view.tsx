"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Download,
  Percent,
  Receipt,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import type { AnalyticsRangeKey, VendorAnalytics } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders } from "@/stores/orders";
import { DEFAULT_RANGE_KEY, resolveRange } from "@/lib/analytics";
import { getVendorAnalytics } from "@/services/finance";
import { downloadCsv, exportFilename, toCsv } from "@/lib/export";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useDashboard } from "./dashboard-context";
import { StatCard } from "./stat-card";
import { RevenueChart } from "./revenue-chart";
import { PeakHoursChart } from "./peak-hours-chart";
import { BestSellers } from "./best-sellers";
import { AnalyticsRangeControl } from "./analytics-range";

/** A titled card section, matching the overview's. */
function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "YYYY-MM-DD" for a date input, from an instant. */
function inputDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * AnalyticsView — the restaurant's own reporting (Phase 10, G23).
 *
 * The prototype had three charts on the overview with no date range and no way to
 * take anything off the screen, and they were computed on the synthesised week
 * alone — so they described a different set of orders from the KPI cards above
 * them. This page is the spec's list over one window: revenue, order count, average
 * order value, peak hours, top products, cancelled and completed counts, commission
 * and net revenue, with a CSV export.
 *
 * **It computes nothing.** `services/finance.getVendorAnalytics` resolves the same
 * shared order book `/dashboard/earnings` reads and `lib/analytics.analyticsFor`
 * projects it — which is the spec's binding constraint for this phase ("analytics
 * must use actual shared order data") held the same way Phase 8 held it for money:
 * by there being nowhere else to get a number from.
 *
 * Two things on this page are deliberately shown *side by side* rather than merged,
 * because merging them is the plausible mistake:
 *
 *  - **Revenue and settled gross.** Commission only exists on a completed order, so
 *    the commission figures describe a subset. Quoting commission against total
 *    revenue would imply the platform had taken a cut of orders it has not settled.
 *  - **Completed and cancelled.** Both are counts over the same window, and the
 *    cancelled figure counts *every* bad ending — rejected, returned, failed
 *    handoff — because a "cancellations" number that only counted the customer's
 *    cancellations under-reports exactly the thing it exists to report.
 */
export function AnalyticsView() {
  const t = useTranslations("analytics");
  const format = useFormatter();
  const { vendor } = useDashboard();

  const [data, setData] = useState<VendorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState<AnalyticsRangeKey>(DEFAULT_RANGE_KEY);
  // The window depends on the clock, so the clock is state — a render must not
  // read `Date.now()`.
  const [now, setNow] = useState(() => Date.now());
  const [custom, setCustom] = useState(() => ({
    from: inputDate(Date.now() - 29 * 86_400_000),
    to: inputDate(Date.now()),
  }));

  const liveOrders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(
    () => resolveRange(rangeKey, now, custom),
    [rangeKey, now, custom],
  );

  useEffect(() => {
    if (!ordersHydrated) return;
    let active = true;
    getVendorAnalytics({ vendorId: vendor.id, live: liveOrders, range, now })
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ordersHydrated, vendor.id, liveOrders, range, now]);

  /**
   * Take the report off the screen.
   *
   * Two tables in one file — the summary and the trend — because that is what a
   * restaurant does with it: check the headline, then look at which days made it.
   * The rows are the *same* numbers the page is showing rather than a second
   * derivation, so the file cannot disagree with the screen.
   */
  function exportSummary() {
    if (!data) return;
    // Raw numbers, not formatted prices: the point of a CSV is that a spreadsheet
    // can sum the column, and "৳1,240" is text. The currency is named in its own
    // row instead.
    const csv = toCsv(
      [t("csv.metric"), t("csv.value")],
      [
        [t("csv.restaurant"), vendor.name],
        [t("csv.from"), data.range.from],
        [t("csv.to"), data.range.to],
        [t("csv.currency"), data.currency],
        [t("kpiRevenue"), data.revenue],
        [t("kpiOrders"), data.orderCount],
        [t("kpiAov"), data.avgOrderValue],
        [t("kpiCompleted"), data.completedCount],
        [t("kpiCancelled"), data.cancelledCount],
        [t("kpiSettled"), data.settledCount],
        [t("csv.settledGross"), data.settledGross],
        [t("kpiCommission"), data.commissionAmount],
        [t("kpiNet"), data.netRevenue],
      ],
    );
    const trend = toCsv(
      [t("csv.bucketStart"), t("csv.bucketDays"), t("csv.revenue"), t("csv.orders")],
      data.series.map((point) => [
        point.date,
        point.spanDays ?? 1,
        point.revenue,
        point.orders,
      ]),
    );
    const products = toCsv(
      [t("csv.product"), t("csv.units"), t("csv.revenue")],
      data.topProducts.map((p) => [p.name, p.unitsSold, p.revenue]),
    );
    downloadCsv(
      exportFilename({
        vendor: vendor.name,
        report: "analytics",
        from: data.range.from,
        to: data.range.to,
      }),
      `${csv}\r\n\r\n${trend}\r\n\r\n${products}`,
    );
    toast.success(t("exported"));
  }

  const currency = (data?.currency ?? vendor.currency) as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);
  const empty = data != null && data.orderCount === 0 && data.cancelledCount === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportSummary}
          disabled={!data || empty}
        >
          <Download className="size-4" aria-hidden />
          {t("export")}
        </Button>
      </header>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <AnalyticsRangeControl
          range={range}
          custom={custom}
          disabled={loading && !data}
          onChange={(next) => {
            setRangeKey(next.key);
            setCustom(next.custom);
          }}
        />
      </section>

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-card bg-surface" />
        </div>
      ) : !data ? (
        /* The service returns null only for a vendor it cannot resolve at all,
           which the shell has already gated — but the page says so rather than
           rendering zeros that would read as "no trade". */
        <p className="rounded-card border border-line bg-surface p-8 text-center text-sm text-muted">
          {t("errorBody")}
        </p>
      ) : (
        <>
          {/* Trade */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("kpiRevenue")}
              value={money(data.revenue)}
              icon={Banknote}
              hint={t("kpiRevenueHint")}
            />
            <StatCard
              label={t("kpiOrders")}
              value={format.number(data.orderCount)}
              icon={ShoppingBag}
              hint={t("kpiOrdersHint", { days: data.range.days })}
            />
            <StatCard
              label={t("kpiAov")}
              value={money(data.avgOrderValue)}
              icon={Receipt}
              hint={t("kpiAovHint")}
            />
            <StatCard
              label={t("kpiCancelled")}
              value={format.number(data.cancelledCount)}
              icon={XCircle}
              hint={t("kpiCancelledHint")}
            />
          </div>

          {/* Money. Separated from the four above because these describe a
              *subset* — only a completed order carries a commission record. */}
          <Panel
            title={t("moneyTitle")}
            action={
              <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                {t("settledOf", {
                  settled: data.settledCount,
                  total: data.orderCount,
                })}
              </span>
            }
          >
            {data.settledCount === 0 ? (
              <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
                {t("moneyEmpty")}
              </p>
            ) : (
              <>
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Figure label={t("kpiCompleted")} value={format.number(data.completedCount)} />
                  <Figure label={t("kpiSettledGross")} value={money(data.settledGross)} />
                  <Figure
                    label={t("kpiCommission")}
                    value={`− ${money(data.commissionAmount)}`}
                  />
                  <Figure label={t("kpiNet")} value={money(data.netRevenue)} tone="primary" />
                </dl>
                <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                  <Percent className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("moneyHint")}
                </p>
              </>
            )}
          </Panel>

          {empty ? (
            <p className="rounded-card border border-line bg-surface p-10 text-center text-sm text-muted">
              {t("emptyRange")}
            </p>
          ) : (
            <>
              <Panel title={t("trendTitle")}>
                <RevenueChart data={data.series} currency={currency} />
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title={t("peakTitle")}>
                  <PeakHoursChart data={data.peak} />
                </Panel>
                <Panel
                  title={t("productsTitle")}
                  action={
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                      <Wallet className="size-3.5" aria-hidden />
                      {t("productsHint")}
                    </span>
                  }
                >
                  <BestSellers items={data.topProducts} currency={currency} />
                </Panel>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** One figure in the money row — a `<dl>` because it reads as one sentence. */
function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary";
}) {
  return (
    <div className="rounded-field bg-surface-muted p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd
        className={
          tone === "primary"
            ? "mt-0.5 text-lg font-extrabold text-primary tabular-nums"
            : "mt-0.5 text-lg font-extrabold text-ink tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
