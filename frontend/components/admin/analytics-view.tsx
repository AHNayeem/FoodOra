"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Bike,
  ChartColumn,
  Clock,
  Download,
  Inbox,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Store,
  Users,
  XCircle,
} from "lucide-react";
import type { AnalyticsRangeKey, PlatformAnalytics } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders } from "@/stores/orders";
import { DEFAULT_RANGE_KEY, resolveRange } from "@/lib/analytics";
import { getPlatformAnalytics } from "@/services/finance";
import { downloadCsv, exportFilename, toCsv } from "@/lib/export";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PeakHoursChart } from "@/components/dashboard/peak-hours-chart";
import { BestSellers } from "@/components/dashboard/best-sellers";
import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range";

/** A titled card section, matching every other admin surface. */
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

/** One figure in a money row — a `<dl>` because it reads as one sentence. */
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

/** "YYYY-MM-DD" for a date input, from an instant. */
function inputDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** An empty table body, so a league table with nobody in it says why. */
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-xs text-muted">
        <Inbox className="mx-auto mb-2 size-5" aria-hidden />
        {text}
      </td>
    </tr>
  );
}

/**
 * AdminAnalytics — the platform's own reporting (Phase 16, G33).
 *
 * The only reporting the admin surface had was the live board's KPI strip, which
 * answers "what is happening right now" and cannot answer "how was last month".
 * This is the spec's list over one window: GMV and revenue, orders, completed,
 * cancelled, refunded, commission, vendor and rider performance, customer
 * activity, top restaurants, top products, delivery performance, a date range and
 * an export.
 *
 * **It computes nothing.** `services/finance.getPlatformAnalytics` resolves the
 * same order book `/admin/payouts` settles from, and `lib/platform-analytics`
 * projects it by calling `lib/analytics.analyticsFor` (the restaurant's own
 * projection) and `lib/settlement.platformFinancials` (the payout run's) over that
 * one set. So the platform's revenue is the sum of what each restaurant sees on
 * its own analytics screen and the commission under it is the money the payout run
 * will pay against — the spec's "do not fabricate numbers where shared domain data
 * already exists", held by there being nowhere else to get one.
 *
 * Three things are kept visibly apart because merging them is the plausible
 * mistake:
 *
 *  - **Revenue and settled gross.** Commission only exists on a completed order.
 *    Quoting the platform's take against total revenue would claim a cut of orders
 *    still in a kitchen, so the settled subset is labelled with its own count.
 *  - **Refunds and revenue.** Money returned is shown beside takings, not netted
 *    off them: "we took ৳100,000 and gave ৳4,000 back" and "we took ৳96,000" are
 *    different facts and an operations desk needs the first.
 *  - **Counts and durations.** Delivery timings are measured only over orders whose
 *    event log was recorded rather than reconstructed, and the panel says how many
 *    that was. The synthesised trailing week divides placement-to-ETA evenly across
 *    the stages, so averaging it would publish a 100% on-time rate that means
 *    nothing.
 */
export function AdminAnalytics() {
  const t = useTranslations("platformAnalytics");
  const tAnalytics = useTranslations("analytics");
  const format = useFormatter();

  const [data, setData] = useState<PlatformAnalytics | null>(null);
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
    getPlatformAnalytics({ live: liveOrders, range, now })
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ordersHydrated, liveOrders, range, now]);

  const currency = (data?.currency ?? "BDT") as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);
  const pct = (n: number | null) =>
    n == null ? t("noData") : format.number(n, { style: "percent", maximumFractionDigits: 1 });
  const mins = (n: number | null) =>
    n == null ? t("noData") : t("minutes", { minutes: Math.round(n) });

  /**
   * Take the report off the screen.
   *
   * Six tables in one file, because that is what the report is: the desk checks the
   * headline, then wants to know which restaurants, which couriers and which
   * customers made it. Every row is the *same* number the page is showing rather
   * than a second derivation, so the file cannot disagree with the screen — and the
   * figures are raw, not formatted prices, because the point of a CSV is that a
   * spreadsheet can sum the column and "৳1,240" is text.
   */
  function exportReport() {
    if (!data) return;
    const { trade, money: m, delivery, customers } = data;

    const summary = toCsv(
      [t("csv.metric"), t("csv.value")],
      [
        [t("csv.from"), data.range.from],
        [t("csv.to"), data.range.to],
        [t("csv.currency"), data.currency],
        [t("kpiGmv"), trade.revenue],
        [t("kpiOrders"), trade.orderCount],
        [t("kpiAov"), trade.avgOrderValue],
        [t("kpiCompleted"), trade.completedCount],
        [t("kpiCancelled"), trade.cancelledCount],
        [t("kpiRefunded"), m.refundedCount],
        [t("csv.refundedAmount"), m.refundedAmount],
        [t("kpiSettled"), trade.settledCount],
        [t("csv.settledGross"), m.gmv],
        [t("kpiCommission"), m.commissionAmount],
        [t("kpiVendorNet"), m.vendorNetAmount],
        [t("csv.deliveryFees"), m.deliveryFees],
        [t("csv.tips"), m.tips],
        [t("csv.tax"), m.tax],
        [t("kpiPlatform"), m.platformAmount],
      ],
    );
    const trend = toCsv(
      [t("csv.bucketStart"), t("csv.bucketDays"), t("csv.revenue"), t("csv.orders")],
      trade.series.map((p) => [p.date, p.spanDays ?? 1, p.revenue, p.orders]),
    );
    const vendors = toCsv(
      [
        t("colRestaurant"),
        t("csv.orders"),
        t("csv.revenue"),
        t("colAov"),
        t("colCompleted"),
        t("colCancelled"),
        t("colCancelRate"),
        t("colSettled"),
        t("colCommission"),
        t("colNet"),
        t("colRating"),
      ],
      data.vendors.map((v) => [
        v.name,
        v.orders,
        v.revenue,
        v.avgOrderValue,
        v.completed,
        v.cancelled,
        v.cancelRate,
        v.settled,
        v.commission,
        v.net,
        v.rating ?? "",
      ]),
    );
    const riders = toCsv(
      [
        t("colRider"),
        t("colAssigned"),
        t("colDeliveries"),
        t("colSettled"),
        t("colEarned"),
        t("colTips"),
        t("colCash"),
        t("colMeasured"),
        t("colAvgMinutes"),
        t("colOnTime"),
      ],
      data.riders.map((r) => [
        r.name,
        r.assigned,
        r.deliveries,
        r.settled,
        r.earned,
        r.tips,
        r.cashCollected,
        r.measured,
        r.avgMinutes == null ? "" : Math.round(r.avgMinutes),
        r.onTimeRate ?? "",
      ]),
    );
    const products = toCsv(
      [t("csv.product"), t("csv.units"), t("csv.revenue")],
      trade.topProducts.map((p) => [p.name, p.unitsSold, p.revenue]),
    );
    const people = toCsv(
      [t("colCustomer"), t("csv.phone"), t("csv.orders"), t("csv.spend")],
      customers.top.map((c) => [c.name, c.phone, c.orders, c.spend]),
    );
    const ops = toCsv(
      [t("csv.metric"), t("csv.value")],
      [
        [t("deliveryOrders"), delivery.deliveryOrders],
        [t("deliveryDelivered"), delivery.delivered],
        [t("deliveryFailed"), delivery.failed],
        [t("deliveryAssigned"), delivery.assigned],
        [t("deliveryMeasured"), delivery.measured],
        [t("deliveryAvg"), delivery.avgMinutes == null ? "" : Math.round(delivery.avgMinutes)],
        [t("deliveryPrep"), delivery.avgPrepMinutes == null ? "" : Math.round(delivery.avgPrepMinutes)],
        [t("deliveryDispatch"), delivery.avgDispatchMinutes == null ? "" : Math.round(delivery.avgDispatchMinutes)],
        [t("deliveryCourier"), delivery.avgCourierMinutes == null ? "" : Math.round(delivery.avgCourierMinutes)],
        [t("deliveryOnTime"), delivery.onTimeRate ?? ""],
        [t("customersOrders"), customers.orders],
        [t("customersActive"), customers.active],
        [t("customersNew"), customers.newCustomers],
        [t("customersReturning"), customers.returning],
        [t("customersRepeat"), customers.repeat],
        [t("customersPerHead"), customers.ordersPerCustomer],
      ],
    );

    downloadCsv(
      exportFilename({
        vendor: "foodora-platform",
        report: "analytics",
        from: data.range.from,
        to: data.range.to,
      }),
      [summary, trend, vendors, riders, products, people, ops].join("\r\n\r\n"),
    );
    toast.success(tAnalytics("exported"));
  }

  const empty =
    data != null && data.trade.orderCount === 0 && data.trade.cancelledCount === 0;

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
          onClick={exportReport}
          disabled={!data || empty}
        >
          <Download className="size-4" aria-hidden />
          {tAnalytics("export")}
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
      ) : !data ? null : (
        <>
          {/* Trade */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("kpiGmv")}
              value={money(data.trade.revenue)}
              icon={Banknote}
              hint={t("kpiGmvHint")}
            />
            <StatCard
              label={t("kpiOrders")}
              value={format.number(data.trade.orderCount)}
              icon={ShoppingBag}
              hint={t("kpiOrdersHint", { days: data.range.days })}
            />
            <StatCard
              label={t("kpiAov")}
              value={money(data.trade.avgOrderValue)}
              icon={Receipt}
              hint={t("kpiAovHint")}
            />
            <StatCard
              label={t("kpiCancelled")}
              value={format.number(data.trade.cancelledCount)}
              icon={XCircle}
              hint={t("kpiCancelledHint")}
            />
          </div>

          {/* Money. A subset of the four above — only a completed order carries a
              commission record — so it is labelled with its own count. */}
          <Panel
            title={t("moneyTitle")}
            action={
              <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                {t("settledOf", {
                  settled: data.trade.settledCount,
                  total: data.trade.orderCount,
                })}
              </span>
            }
          >
            {data.trade.settledCount === 0 ? (
              <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
                {t("moneyEmpty")}
              </p>
            ) : (
              <>
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Figure label={t("kpiCompleted")} value={format.number(data.trade.completedCount)} />
                  <Figure label={t("kpiSettledGross")} value={money(data.money.gmv)} />
                  <Figure label={t("kpiCommission")} value={money(data.money.commissionAmount)} />
                  <Figure label={t("kpiVendorNet")} value={money(data.money.vendorNetAmount)} />
                  <Figure label={t("kpiDeliveryFees")} value={money(data.money.deliveryFees)} />
                  <Figure label={t("kpiTips")} value={money(data.money.tips)} />
                  <Figure label={t("kpiTax")} value={money(data.money.tax)} />
                  <Figure label={t("kpiPlatform")} value={money(data.money.platformAmount)} tone="primary" />
                </dl>
                <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                  <Percent className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("moneyHint")}
                </p>
              </>
            )}
          </Panel>

          {/* Refunds, beside the takings rather than netted off them. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("kpiRefunded")}
              value={format.number(data.money.refundedCount)}
              icon={RotateCcw}
              hint={t("kpiRefundedHint", { amount: money(data.money.refundedAmount) })}
            />
            <StatCard
              label={t("kpiRestaurants")}
              value={format.number(data.vendors.length)}
              icon={Store}
              hint={t("kpiRestaurantsHint")}
            />
            <StatCard
              label={t("kpiRiders")}
              value={format.number(data.riders.length)}
              icon={Bike}
              hint={t("kpiRidersHint")}
            />
            <StatCard
              label={t("kpiCustomers")}
              value={format.number(data.customers.active)}
              icon={Users}
              hint={t("kpiCustomersHint", { fresh: data.customers.newCustomers })}
            />
          </div>

          {empty ? (
            <p className="rounded-card border border-line bg-surface p-10 text-center text-sm text-muted">
              {tAnalytics("emptyRange")}
            </p>
          ) : (
            <>
              <Panel title={t("trendTitle")}>
                <RevenueChart data={data.trade.series} currency={currency} />
              </Panel>

              {/* Restaurants */}
              <Panel
                title={t("vendorsTitle")}
                action={
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                    <ChartColumn className="size-3.5" aria-hidden />
                    {t("vendorsHint")}
                  </span>
                }
              >
                <div className="overflow-x-auto rounded-field border border-line">
                  <table className="w-full min-w-[58rem] text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 text-start font-semibold">{t("colRestaurant")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("csv.orders")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("csv.revenue")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colAov")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colCancelRate")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colCommission")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colNet")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colRating")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.vendors.length === 0 ? (
                        <EmptyRow colSpan={8} text={t("vendorsEmpty")} />
                      ) : (
                        data.vendors.map((v) => (
                          <tr key={v.vendorId}>
                            {/* Not a link: `/admin/restaurants/[id]` is an
                                onboarding *application*, and a seeded restaurant
                                never had one. A row that led to "application not
                                found" would be worse than plain text. */}
                            <td className="px-4 py-3 font-semibold text-ink">{v.name}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{format.number(v.orders)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{money(v.revenue)}</td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">{money(v.avgOrderValue)}</td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">{pct(v.cancelRate)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">
                              {v.settled === 0 ? (
                                <span className="text-muted">{t("noData")}</span>
                              ) : (
                                money(v.commission)
                              )}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">
                              {v.settled === 0 ? t("noData") : money(v.net)}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">
                              {v.rating == null
                                ? t("noData")
                                : t("ratingOf", {
                                    rating: format.number(v.rating, { maximumFractionDigits: 1 }),
                                    count: v.ratedOrders,
                                  })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {/* Couriers */}
              <Panel
                title={t("ridersTitle")}
                action={
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                    <Bike className="size-3.5" aria-hidden />
                    {t("ridersHint")}
                  </span>
                }
              >
                <div className="overflow-x-auto rounded-field border border-line">
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 text-start font-semibold">{t("colRider")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colAssigned")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colDeliveries")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colEarned")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colCash")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colAvgMinutes")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("colOnTime")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.riders.length === 0 ? (
                        <EmptyRow colSpan={7} text={t("ridersEmpty")} />
                      ) : (
                        data.riders.map((r) => (
                          <tr key={r.riderId}>
                            {/* Same as the restaurant column above: the courier
                                section is an application queue, not a directory. */}
                            <td className="px-4 py-3 font-semibold text-ink">{r.name}</td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">{format.number(r.assigned)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{format.number(r.deliveries)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">
                              {r.settled === 0 ? (
                                <span className="text-muted">{t("noData")}</span>
                              ) : (
                                money(r.earned)
                              )}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">
                              {r.cashCollected > 0 ? money(r.cashCollected) : t("noData")}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">{mins(r.avgMinutes)}</td>
                            <td className="px-4 py-3 text-end tabular-nums text-muted">{pct(r.onTimeRate)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted">{t("ridersNote")}</p>
              </Panel>

              {/* Delivery performance */}
              <Panel
                title={t("deliveryTitle")}
                action={
                  <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                    {t("measuredOf", {
                      measured: data.delivery.measured,
                      total: data.delivery.deliveryOrders,
                    })}
                  </span>
                }
              >
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Figure label={t("deliveryOrders")} value={format.number(data.delivery.deliveryOrders)} />
                  <Figure label={t("deliveryDelivered")} value={format.number(data.delivery.delivered)} />
                  <Figure label={t("deliveryFailed")} value={format.number(data.delivery.failed)} />
                  <Figure label={t("deliveryAssigned")} value={format.number(data.delivery.assigned)} />
                  <Figure label={t("deliveryPrep")} value={mins(data.delivery.avgPrepMinutes)} />
                  <Figure label={t("deliveryDispatch")} value={mins(data.delivery.avgDispatchMinutes)} />
                  <Figure label={t("deliveryCourier")} value={mins(data.delivery.avgCourierMinutes)} />
                  <Figure
                    label={t("deliveryOnTime")}
                    value={pct(data.delivery.onTimeRate)}
                    tone="primary"
                  />
                </dl>
                <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                  <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("deliveryNote")}
                </p>
              </Panel>

              {/* Customers */}
              <Panel
                title={t("customersTitle")}
                action={
                  <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                    {t("customersOver", { orders: data.customers.orders })}
                  </span>
                }
              >
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Figure label={t("customersActive")} value={format.number(data.customers.active)} />
                  <Figure label={t("customersNew")} value={format.number(data.customers.newCustomers)} />
                  <Figure label={t("customersReturning")} value={format.number(data.customers.returning)} />
                  <Figure label={t("customersRepeat")} value={format.number(data.customers.repeat)} />
                  <Figure
                    label={t("customersPerHead")}
                    value={format.number(data.customers.ordersPerCustomer, {
                      maximumFractionDigits: 2,
                    })}
                  />
                </dl>

                <div className="mt-4 overflow-x-auto rounded-field border border-line">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 text-start font-semibold">{t("colCustomer")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("csv.orders")}</th>
                        <th className="px-4 py-3 text-end font-semibold">{t("csv.spend")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.customers.top.length === 0 ? (
                        <EmptyRow colSpan={3} text={t("customersEmpty")} />
                      ) : (
                        data.customers.top.map((c) => (
                          <tr key={c.id}>
                            <td className="px-4 py-3 font-semibold text-ink">
                              <Link
                                href={`/admin/customers/${c.id}`}
                                className="hover:text-primary hover:underline"
                              >
                                {c.name}
                              </Link>
                              <span className="ms-2 text-xs font-normal text-muted">{c.phone}</span>
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums">{format.number(c.orders)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{money(c.spend)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted">{t("customersNote")}</p>
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title={t("peakTitle")}>
                  <PeakHoursChart data={data.trade.peak} />
                </Panel>
                <Panel title={t("productsTitle")}>
                  <BestSellers items={data.trade.topProducts} currency={currency} />
                </Panel>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
