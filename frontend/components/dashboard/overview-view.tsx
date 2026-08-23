"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Banknote, ShoppingBag, Receipt, Star, ArrowRight } from "lucide-react";
import type { VendorDashboard } from "@/services/vendor";
import { getVendorDashboard } from "@/services/vendor";
import type { CurrencyCode } from "@/config/regions";
import { useOrders, ordersForVendor } from "@/stores/orders";
import { adjustmentsForVendor, usePayouts } from "@/stores/payouts";
import { vendorStats } from "@/lib/analytics";
import type { VendorEarnings } from "@/services/finance";
import { getVendorEarnings } from "@/services/finance";
import { formatPrice, formatRating } from "@/lib/format";
import { useDashboard } from "./dashboard-context";
import { StatCard } from "./stat-card";
import { RevenueChart } from "./revenue-chart";
import { PeakHoursChart } from "./peak-hours-chart";
import { BestSellers } from "./best-sellers";
import { OrderStatusBadge } from "./order-status-badge";

/** Format a signed fraction as "+12%" / "−4%" (locale-neutral minus glyph). */
function pct(delta: number): string {
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(delta * 100))}%`;
}

/**
 * One figure in the earnings statement. Grouped as a `<dl>` because gross,
 * commission and net are one sentence read left to right, not three KPIs.
 */
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

/** A titled card section used across the overview. */
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * OverviewView — the dashboard home (Phase C10).
 *
 * Two sources, deliberately: the synthesised week behind the charts (a
 * prototype cannot have a real trailing week) and the **live** order store for
 * anything about right now. Before this, "3 orders pending" came from the
 * synthesiser too, so it counted invented orders and ignored the real one the
 * restaurant had just been sent — the number on the busiest card was the one
 * least connected to reality.
 */
export function OverviewView() {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const { vendor } = useDashboard();

  const [data, setData] = useState<VendorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  // The KPI window is time-bounded ("today"), so the clock is state rather than
  // something read during render — a render must not depend on `Date.now()`.
  const [now, setNow] = useState(() => Date.now());

  const liveAll = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);

  // Phase 8: the money on this page is the money on `/dashboard/earnings`,
  // resolved by the same service call — see the earnings panel below.
  const [earnings, setEarnings] = useState<VendorEarnings | null>(null);
  const payouts = usePayouts((s) => s.payouts);
  const adjustments = usePayouts((s) => s.adjustments);
  const payoutsHydrated = usePayouts((s) => s.hydrated);

  useEffect(() => {
    useOrders.persist.rehydrate();
    usePayouts.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    getVendorDashboard(vendor.id)
      .then((d) => {
        if (active) setData(d);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vendor.id]);

  const live = useMemo(
    () => (ordersHydrated ? ordersForVendor(liveAll, vendor.id) : []),
    [liveAll, vendor.id, ordersHydrated],
  );

  const myAdjustments = useMemo(
    () => adjustmentsForVendor(adjustments, vendor.id),
    [adjustments, vendor.id],
  );

  useEffect(() => {
    if (!ordersHydrated || !payoutsHydrated) return;
    let active = true;
    getVendorEarnings({
      vendorId: vendor.id,
      live: liveAll,
      payouts,
      adjustments: myAdjustments,
      now,
    }).then((result) => {
      if (active) setEarnings(result);
    });
    return () => {
      active = false;
    };
  }, [ordersHydrated, payoutsHydrated, vendor.id, liveAll, payouts, myAdjustments, now]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-card bg-surface" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-card bg-surface" />
          <div className="h-64 animate-pulse rounded-card bg-surface" />
        </div>
      </div>
    );
  }

  // Charts stay on the synthesised week; the headline numbers are recomputed
  // over the week *plus* everything live, so today's card counts real orders.
  const merged = [...live, ...data.recentOrders.filter((o) => !live.some((l) => l.id === o.id))];
  const stats = vendorStats(
    [...data.allOrders.filter((o) => !live.some((l) => l.id === o.id)), ...live],
    vendor,
    now,
  );
  const currency = stats.currency as CurrencyCode;

  /**
   * The vendor's money, from the commission records their completed orders carry
   * (G01/G02, spec §5.4).
   *
   * Phase 8 moved this behind `services/finance.getVendorEarnings` rather than
   * building the settlements here. It used to merge its own order set and call
   * `lib/settlement` directly, which was fine until `/dashboard/earnings` needed
   * the same answer: two callers each resolving their own book would have anchored
   * the synthesised week to two different instants, and the summary here would have
   * disagreed with the statement there by a few orders. One resolver, one answer.
   */
  const balance = earnings?.balance ?? null;
  const rate = earnings?.rate ?? 0;

  const recent = merged
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("overviewTitle")}</h1>
          <p className="text-sm text-muted">{t("overviewSubtitle")}</p>
        </div>
        {stats.pendingOrders > 0 && (
          <Link
            href="/dashboard/orders"
            className="inline-flex items-center gap-2 rounded-pill bg-accent-50 px-3.5 py-2 text-sm font-semibold text-accent-600 transition-colors hover:brightness-95"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-pill bg-accent-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-pill bg-accent-500" />
            </span>
            {t("pendingOrders", { count: stats.pendingOrders })}
          </Link>
        )}
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("kpiRevenue")}
          value={formatPrice(stats.revenueToday, currency)}
          icon={Banknote}
          delta={stats.revenueDelta}
          deltaLabel={`${pct(stats.revenueDelta)} ${t("vsYesterday")}`}
        />
        <StatCard
          label={t("kpiOrders")}
          value={String(stats.ordersToday)}
          icon={ShoppingBag}
          delta={stats.ordersDelta}
          deltaLabel={`${pct(stats.ordersDelta)} ${t("vsYesterday")}`}
        />
        <StatCard
          label={t("kpiAov")}
          value={formatPrice(stats.avgOrderValue, currency)}
          icon={Receipt}
          hint={t("perOrderToday")}
        />
        <StatCard
          label={t("kpiRating")}
          value={formatRating(stats.rating)}
          icon={Star}
          hint={t("reviewsCount", { count: stats.reviewCount })}
        />
      </div>

      {/* Earnings — gross, what the platform took, what is left. The prototype
          used to show revenue and stop, which meant the commission the marketing
          page promised to publish was nowhere in the product (G01/G02). */}
      <Panel
        title={t("earningsTitle")}
        action={
          <span className="flex items-center gap-2">
            <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
              {t("earningsRate", { rate: Math.round(rate * 100) })}
            </span>
            {/* The statements, the payout history and the two balances live on
                their own page (Phase 8); this panel is the headline. */}
            <Link
              href="/dashboard/earnings"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {t("viewAll")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </span>
        }
      >
        {!balance || balance.orderCount === 0 ? (
          <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("earningsEmpty")}
          </p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Figure
                label={t("earningsGross")}
                value={formatPrice(balance.grossAmount, currency)}
              />
              <Figure
                label={t("earningsCommission")}
                value={`− ${formatPrice(balance.commissionAmount, currency)}`}
              />
              <Figure
                label={t("earningsNet")}
                value={formatPrice(balance.netAmount, currency)}
                tone="primary"
              />
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>
                {t("earningsPending")}{" "}
                <b className="font-bold text-ink tabular-nums">
                  {formatPrice(balance.pending, currency)}
                </b>
              </span>
              <span>
                {t("earningsAvailable")}{" "}
                <b className="font-bold text-ink tabular-nums">
                  {formatPrice(balance.available, currency)}
                </b>
              </span>
              <span>{t("earningsPeriods", { count: earnings?.statements.length ?? 0 })}</span>
            </div>
          </>
        )}
      </Panel>

      {/* Revenue trend */}
      <Panel title={t("revenueTrend")}>
        <RevenueChart data={data.revenue} currency={currency} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("peakHours")}>
          <PeakHoursChart data={data.peak} />
        </Panel>
        <Panel title={t("bestSellers")}>
          <BestSellers items={data.bestSellers} currency={currency} />
        </Panel>
      </div>

      {/* Recent orders */}
      <Panel
        title={t("recentOrders")}
        action={
          <Link
            href="/dashboard/orders"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("viewAll")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        }
      >
        <ul className="divide-y divide-line">
          {recent.map((order) => {
            const count = order.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <li key={order.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {order.contact.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {order.orderNumber} · {t("itemCount", { count })} ·{" "}
                    {format.relativeTime(new Date(order.placedAt))}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-ink tabular-nums">
                  {formatPrice(order.pricing.total, order.pricing.currency as CurrencyCode)}
                </span>
                <OrderStatusBadge status={order.status} className="shrink-0" />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
