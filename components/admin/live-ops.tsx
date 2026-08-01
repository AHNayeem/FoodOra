"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  Banknote,
  Bike,
  ChefHat,
  CircleDot,
  Package,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Order, Rider, Vendor } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders, liveOrders } from "@/stores/orders";
import { getFleet } from "@/services/delivery";
import { getVendors } from "@/services/catalog";
import { isFailure, isWithRider, isInKitchen } from "@/lib/order-machine";
import { readyInMs, toMinutes } from "@/lib/order-lifecycle";
import { formatPrice } from "@/lib/format";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";

const TICK_MS = 2000;

/**
 * LiveOps — the platform's operations view (spec: Admin Dashboard).
 *
 * Deliberately answers four questions and no more: what is in flight, is
 * anything stuck, who is working, and what has today taken. Everything on this
 * page is computed from the same order store the other three surfaces write to,
 * so it is genuinely live — accepting an order two tabs away moves a number
 * here on the next tick.
 *
 * "Stuck" is the column that earns the page: an order whose promised ready time
 * has passed, or that has been sitting on a pass with no courier, is the thing
 * an operations desk exists to notice. It is derived, not flagged, so it cannot
 * go stale.
 */
export function LiveOps() {
  const t = useTranslations("admin");
  const format = useFormatter();

  const hydrated = useOrders((s) => s.hydrated);
  const orders = useOrders((s) => s.orders);

  const [now, setNow] = useState(() => Date.now());
  const [fleet, setFleet] = useState<Rider[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    useOrders.persist.rehydrate();
    getFleet().then(setFleet);
    getVendors().then((res) => setVendors(res.items ?? []));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const live = useMemo(() => liveOrders(orders), [orders]);

  const stats = useMemo(() => {
    const today = startOfDay(now);
    const todays = orders.filter((o) => Date.parse(o.placedAt) >= today);
    const settled = todays.filter(
      (o) => o.status === "delivered" || o.status === "completed",
    );
    const failed = todays.filter((o) => isFailure(o.status));
    const revenue = settled.reduce((sum, o) => sum + o.pricing.total, 0);
    const currency = (orders[0]?.pricing.currency ?? "BDT") as CurrencyCode;
    return {
      currency,
      liveCount: live.length,
      inKitchen: live.filter((o) => isInKitchen(o.status)).length,
      onRoad: live.filter((o) => isWithRider(o.status)).length,
      revenue,
      settled: settled.length,
      failed: failed.length,
      // Share of today's finished orders that ended badly.
      failureRate:
        settled.length + failed.length === 0
          ? 0
          : failed.length / (settled.length + failed.length),
    };
  }, [orders, live, now]);

  /** Orders an operator should look at: overdue, or ready with nobody coming. */
  const stuck = useMemo(
    () =>
      live.filter((order) => {
        const remaining = readyInMs(order, now);
        if (remaining != null && remaining < 0 && order.status !== "ready") return true;
        if (order.status === "ready" && order.fulfillment === "delivery") {
          const readyAt = order.lifecycle.events.find((e) => e.status === "ready");
          return readyAt ? now - Date.parse(readyAt.at) > 5 * 60_000 : false;
        }
        if (order.status === "placed") {
          return now - Date.parse(order.placedAt) > 4 * 60_000;
        }
        return order.status === "delivery-failed";
      }),
    [live, now],
  );

  /** Which riders are carrying something right now. */
  const busyRiderIds = useMemo(
    () => new Set(live.map((o) => o.lifecycle.rider?.id).filter(Boolean) as string[]),
    [live],
  );

  /** Restaurants with live orders, and how many each has. */
  const vendorLoad = useMemo(() => {
    const map = new Map<string, { name: string; count: number; overdue: number }>();
    for (const order of live) {
      const entry = map.get(order.vendor.id) ?? {
        name: order.vendor.name,
        count: 0,
        overdue: 0,
      };
      entry.count += 1;
      const remaining = readyInMs(order, now);
      if (remaining != null && remaining < 0) entry.overdue += 1;
      map.set(order.vendor.id, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [live, now]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("liveTitle")}</h1>
          <p className="text-sm text-muted">{t("liveSubtitle")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-fresh/15 px-3 py-1 text-sm font-semibold text-fresh">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-fresh opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-fresh" />
          </span>
          {t("liveBadge")}
        </span>
      </header>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statLive")}
          value={String(stats.liveCount)}
          icon={Package}
          hint={t("statLiveHint", { kitchen: stats.inKitchen, road: stats.onRoad })}
        />
        <StatCard
          label={t("statRevenue")}
          value={formatPrice(stats.revenue, stats.currency)}
          icon={TrendingUp}
          hint={t("statRevenueHint", { count: stats.settled })}
        />
        <StatCard
          label={t("statRiders")}
          value={`${busyRiderIds.size}/${fleet.length}`}
          icon={Bike}
          hint={t("statRidersHint")}
        />
        <StatCard
          label={t("statFailures")}
          value={String(stats.failed)}
          icon={AlertTriangle}
          hint={t("statFailuresHint", {
            percent: Math.round(stats.failureRate * 100),
          })}
        />
      </div>

      {/* Needs attention */}
      {stuck.length > 0 && (
        <section className="rounded-card border border-danger/40 bg-danger/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-danger">
            <AlertTriangle className="size-4" aria-hidden />
            {t("attentionTitle", { count: stuck.length })}
          </h2>
          <ul className="mt-3 space-y-2">
            {stuck.slice(0, 5).map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field bg-surface px-3 py-2 text-sm"
              >
                <span className="font-mono font-bold text-ink">{order.orderNumber}</span>
                <OrderStatusChip status={order.status} size="sm" />
                <span className="text-xs text-muted">{order.vendor.name}</span>
                <span className="ms-auto text-xs font-semibold text-danger">
                  {reasonStuck(order, now, t)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live order feed */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-h3 text-ink">
            <CircleDot className="size-4 text-primary" aria-hidden />
            {t("feedTitle")}
          </h2>
          {live.length === 0 ? (
            <p className="rounded-card border border-dashed border-line py-12 text-center text-sm text-muted">
              {t("feedEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {live.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-3 p-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">
                        {order.orderNumber}
                      </span>
                      <OrderStatusChip status={order.status} size="sm" />
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                      <Store className="size-3" aria-hidden />
                      {order.vendor.name}
                      <span aria-hidden>→</span>
                      {order.address?.area ?? order.contact.name}
                      <span aria-hidden>·</span>
                      {format.relativeTime(new Date(order.placedAt), now)}
                    </span>
                  </span>

                  {order.lifecycle.rider && (
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-body">
                      <Bike className="size-3" aria-hidden />
                      {order.lifecycle.rider.name}
                    </span>
                  )}

                  <span className="text-end">
                    <span className="block text-sm font-bold text-ink tabular-nums">
                      {formatPrice(order.pricing.total, order.pricing.currency as CurrencyCode)}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] font-semibold",
                        order.payment.status === "paid" ? "text-fresh-600" : "text-muted",
                      )}
                    >
                      {order.payment.method === "cash" ? (
                        <Banknote className="inline size-3" aria-hidden />
                      ) : null}{" "}
                      {order.payment.status}
                    </span>
                  </span>

                  <Link
                    href={`/orders/${order.id}`}
                    className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-muted"
                  >
                    {t("view")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          {/* Restaurant load */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ChefHat className="size-4 text-muted" aria-hidden />
              {t("kitchensTitle")}
            </h2>
            {vendorLoad.length === 0 ? (
              <p className="mt-3 text-xs text-muted">{t("kitchensEmpty")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {vendorLoad.map(([id, entry]) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-body">{entry.name}</span>
                    {entry.overdue > 0 && (
                      <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                        {t("overdueCount", { count: entry.overdue })}
                      </span>
                    )}
                    <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-xs font-bold tabular-nums text-ink">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted">
              {t("vendorsOnPlatform", { count: vendors.length })}
            </p>
          </section>

          {/* Fleet */}
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Users className="size-4 text-muted" aria-hidden />
              {t("fleetTitle")}
            </h2>
            <ul className="mt-3 space-y-2">
              {fleet.map((rider) => {
                const busy = busyRiderIds.has(rider.id);
                return (
                  <li key={rider.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        busy ? "bg-accent" : "bg-fresh",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-body">{rider.name}</span>
                    <span className="text-[11px] font-semibold text-muted">
                      {busy ? t("riderBusy") : t("riderFree")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Local midnight for "today" aggregates. */
function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Why an order is flagged — the operator needs the reason, not just the row. */
function reasonStuck(
  order: Order,
  now: number,
  t: ReturnType<typeof useTranslations>,
): string {
  if (order.status === "delivery-failed") return t("stuckFailed");
  if (order.status === "placed") {
    return t("stuckUnanswered", { minutes: toMinutes(now - Date.parse(order.placedAt)) });
  }
  if (order.status === "ready") {
    const readyAt = order.lifecycle.events.find((e) => e.status === "ready");
    return t("stuckNoRider", {
      minutes: readyAt ? toMinutes(now - Date.parse(readyAt.at)) : 0,
    });
  }
  const remaining = readyInMs(order, now);
  return t("stuckOverdue", { minutes: remaining == null ? 0 : toMinutes(-remaining) });
}
