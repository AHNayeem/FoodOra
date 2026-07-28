"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bike, ShoppingBag, Check, X, Inbox } from "lucide-react";
import type { Order, OrderStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { getVendorOrders } from "@/services/vendor";
import { stagesFor } from "@/lib/tracking";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";
import { OrderStatusBadge } from "./order-status-badge";

/** Board tabs → the order statuses each collects. Order defines tab order. */
const GROUPS: Record<string, OrderStatus[]> = {
  new: ["placed", "confirmed"],
  preparing: ["preparing"],
  ready: ["ready", "picked-up", "on-the-way"],
  completed: ["delivered"],
  cancelled: ["cancelled"],
};
const TABS = Object.keys(GROUPS);

/** The next lifecycle stage a merchant can advance an order to, or null. */
function nextStatus(order: Order): OrderStatus | null {
  if (order.status === "delivered" || order.status === "cancelled") return null;
  const stages = stagesFor(order.fulfillment);
  const idx = stages.indexOf(order.status);
  if (idx === -1) return null;
  if (idx < stages.length - 1) return stages[idx + 1];
  // Pickup ends at "ready"; completing it marks the order collected (delivered).
  if (order.fulfillment === "pickup" && order.status === "ready") return "delivered";
  return null;
}

/** i18n key for the advance button, given the target status + fulfillment. */
function advanceKey(target: OrderStatus, fulfillment: Order["fulfillment"]): string {
  if (target === "delivered" && fulfillment === "pickup") return "markCollected";
  const map: Partial<Record<OrderStatus, string>> = {
    confirmed: "accept",
    preparing: "startPreparing",
    ready: "markReady",
    "picked-up": "handToRider",
    "on-the-way": "markOnTheWay",
    delivered: "markDelivered",
  };
  return map[target] ?? "advance";
}

/** Cancellable only before the kitchen starts (placed/confirmed). */
function isCancellable(status: OrderStatus): boolean {
  return status === "placed" || status === "confirmed";
}

/**
 * OrdersBoard — the vendor order-management screen (Phase C10). Loads the
 * vendor's order feed, groups it into workflow tabs, and lets the merchant
 * advance an order along its lifecycle or reject a new one. All mutations are
 * simulated: they update local state (the feed is regenerated each visit) and
 * surface a toast, exactly as an optimistic write would before the Phase E API.
 */
export function OrdersBoard() {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tab, setTab] = useState<string>("new");

  useEffect(() => {
    let active = true;
    getVendorOrders(vendor.id).then((list) => {
      if (active) setOrders(list);
    });
    return () => {
      active = false;
    };
  }, [vendor.id]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const key of TABS) {
      map[key] = orders?.filter((o) => GROUPS[key].includes(o.status)).length ?? 0;
    }
    return map;
  }, [orders]);

  function updateStatus(id: string, status: OrderStatus) {
    setOrders((prev) =>
      prev
        ? prev.map((o) => (o.id === id ? { ...o, status } : o))
        : prev,
    );
  }

  function advance(order: Order) {
    const target = nextStatus(order);
    if (!target) return;
    updateStatus(order.id, target);
    toast.success(t("statusUpdated"));
  }

  function reject(order: Order) {
    updateStatus(order.id, "cancelled");
    toast(t("orderRejected"));
  }

  if (!orders) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const visible = orders.filter((o) => GROUPS[tab].includes(o.status));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h2 text-ink">{t("ordersTitle")}</h1>
        <p className="text-sm text-muted">{t("ordersSubtitle")}</p>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label={t("ordersTitle")}
        className="flex gap-1.5 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t(`tab.${key}`)}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
                  active ? "bg-primary/10 text-primary" : "bg-surface-muted text-muted",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm text-muted">{t("noOrdersInTab")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => {
            const target = nextStatus(order);
            const count = order.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <li
                key={order.id}
                className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      {order.fulfillment === "delivery" ? (
                        <Bike className="size-3.5" aria-hidden />
                      ) : (
                        <ShoppingBag className="size-3.5" aria-hidden />
                      )}
                      {order.contact.name} ·{" "}
                      {format.relativeTime(new Date(order.placedAt))} ·{" "}
                      {t("itemCount", { count })}
                    </p>
                  </div>
                  <span className="text-base font-extrabold text-ink tabular-nums">
                    {formatPrice(order.pricing.total, currency)}
                  </span>
                </div>

                {/* Items */}
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex justify-between gap-3 text-body">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-ink tabular-nums">
                          {line.quantity}×
                        </span>{" "}
                        {line.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatPrice(line.unitPrice * line.quantity, currency)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <span className="text-xs text-muted">
                    {t(`payment.${order.payment.method}`)} ·{" "}
                    {t(`paymentStatus.${order.payment.status}`)}
                  </span>
                  <div className="flex items-center gap-2">
                    {isCancellable(order.status) && (
                      <button
                        type="button"
                        onClick={() => reject(order)}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5"
                      >
                        <X className="size-4" aria-hidden />
                        {t("reject")}
                      </button>
                    )}
                    {target && (
                      <button
                        type="button"
                        onClick={() => advance(order)}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 active:scale-[0.98]"
                      >
                        <Check className="size-4" aria-hidden />
                        {t(advanceKey(target, order.fulfillment))}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
