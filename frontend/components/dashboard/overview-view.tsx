"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Banknote, ShoppingBag, Receipt, Star, ArrowRight } from "lucide-react";
import type { VendorDashboard } from "@/frontend/services/vendor";
import { getVendorDashboard } from "@/frontend/services/vendor";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useOrders, ordersForVendor } from "@/frontend/stores/orders";
import { vendorStats } from "@/frontend/lib/analytics";
import { formatPrice, formatRating } from "@/frontend/lib/format";
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

  useEffect(() => {
    useOrders.persist.rehydrate();
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
