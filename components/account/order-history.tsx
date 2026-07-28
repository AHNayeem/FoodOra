"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { Order, OrderStatus } from "@/types";
import { useOrders } from "@/stores/orders";
import { cartCount } from "@/lib/cart";
import { trackingProgress } from "@/lib/tracking";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Badge tint per live status — fresh/green for good news, muted for done/cancelled. */
const STATUS_TONE: Record<OrderStatus, string> = {
  placed: "bg-primary/10 text-primary",
  confirmed: "bg-primary/10 text-primary",
  preparing: "bg-accent/15 text-accent",
  ready: "bg-fresh/15 text-fresh",
  "picked-up": "bg-accent/15 text-accent",
  "on-the-way": "bg-accent/15 text-accent",
  delivered: "bg-fresh/15 text-fresh",
  cancelled: "bg-surface-muted text-muted",
};

/**
 * OrderHistory — the customer's past & active orders (Phase C3). Reads the
 * persisted orders store (same source as confirmation & tracking) and splits it
 * into active vs. completed using the C9 time-derived status, so a just-placed
 * order shows as live and links straight into the tracker. `now` is set on the
 * client after mount to avoid an SSR/hydration mismatch on the derived status.
 */
export function OrderHistory() {
  const t = useTranslations("account");
  const orders = useOrders((s) => s.orders);
  const hydrated = useOrders((s) => s.hydrated);
  // A single mount-time snapshot for deriving live status. Content only renders
  // after `hydrated` flips on the client, so this never causes an SSR mismatch.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-panel border border-line bg-surface p-8 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <ShoppingBag className="size-7" aria-hidden />
        </span>
        <h2 className="text-h3 text-ink">{t("ordersEmpty")}</h2>
        <p className="max-w-sm text-body">{t("ordersEmptyHint")}</p>
        <Button href="/restaurants" className="mt-2">
          {t("browseRestaurants")}
        </Button>
      </div>
    );
  }

  const withStatus = orders.map((order) => ({
    order,
    progress: trackingProgress(order, now),
  }));
  const active = withStatus.filter((o) => !o.progress.complete && !o.progress.cancelled);
  const past = withStatus.filter((o) => o.progress.complete || o.progress.cancelled);

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <Group title={t("activeOrders")}>
          {active.map(({ order, progress }) => (
            <OrderCard key={order.id} order={order} status={progress.currentStatus} live />
          ))}
        </Group>
      )}
      {past.length > 0 && (
        <Group title={t("pastOrders")}>
          {past.map(({ order, progress }) => (
            <OrderCard key={order.id} order={order} status={progress.currentStatus} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="space-y-4">{children}</ul>
    </section>
  );
}

function OrderCard({
  order,
  status,
  live = false,
}: {
  order: Order;
  status: OrderStatus;
  live?: boolean;
}) {
  const t = useTranslations("account");
  const ts = useTranslations("order.status");
  const locale = useLocale();
  const currency = order.vendor.currency as CurrencyCode;
  const count = cartCount(order.lines);
  const placed = new Date(order.placedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="rounded-panel border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/restaurants/${order.vendor.slug}`}
              className="truncate font-semibold text-ink hover:text-primary"
            >
              {order.vendor.name}
            </Link>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-semibold",
                STATUS_TONE[status],
              )}
            >
              {live && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
              {ts(status)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {t("orderRef", { number: order.orderNumber })} · {placed}
          </p>
        </div>
        <p className="text-right">
          <span className="block font-bold text-ink">
            {formatPrice(order.pricing.total, currency)}
          </span>
          <span className="text-xs text-muted">{t("orderItems", { count })}</span>
        </p>
      </div>

      {/* Line preview */}
      <p className="mt-3 truncate text-sm text-body">
        {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
      </p>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {live && (
          <Button href={`/orders/${order.id}`} size="sm">
            {t("track")}
          </Button>
        )}
        <Button href={`/checkout/success?order=${order.id}`} size="sm" variant="outline">
          {t("viewReceipt")}
        </Button>
        <Button href={`/restaurants/${order.vendor.slug}`} size="sm" variant="ghost">
          {t("reorder")}
        </Button>
      </div>
    </li>
  );
}
