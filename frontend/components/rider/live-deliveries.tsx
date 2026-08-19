"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Bike,
  ChevronRight,
  MapPin,
  Package,
  Store,
  Timer,
} from "lucide-react";
import type { Order } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders, dispatchableOrders } from "@/stores/orders";
import { toMinutes } from "@/lib/order-lifecycle";
import { cashDueOn } from "@/lib/order-machine";
import { formatPrice } from "@/lib/format";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { cn } from "@/lib/utils";
import { useRiderApp } from "./rider-context";
import { useRiderRecords } from "./use-rider-records";

/**
 * LiveDeliveries — the real orders a rider can take (spec §4, §5).
 *
 * The rider app already had an offer pool, but it ran on *synthesised* trips:
 * plausible-looking jobs built from invented order ids, which meant a rider
 * completing one could not possibly mark a customer's order delivered. That pool
 * still exists (it is what makes earnings and the wallet demonstrable over a
 * week), and this sits above it: the jobs here are orders somebody actually
 * placed, sitting on a real restaurant's pass.
 *
 * Taking one assigns the rider on the order itself, which is the moment the
 * customer's tracker names them and the restaurant's board shows who is coming.
 */
export function LiveDeliveries() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const { rider, zone } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const orders = useOrders((s) => s.orders);
  const assignRider = useOrders((s) => s.assignRider);

  // Availability comes from the one place that knows about both kinds of work.
  const { hydrated, online, activeJob, activeOrder: mine } = useRiderRecords();

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const available = useMemo(
    () =>
      dispatchableOrders(orders).filter(
        (o) => !o.lifecycle.rejectedRiderIds.includes(rider.id),
      ),
    [orders, rider.id],
  );

  if (!hydrated) return null;

  // A rider carrying food has one job; the pool is not their problem right now.
  if (mine) {
    return (
      <section>
        <h2 className="mb-3 text-h3 text-ink">{t("liveActiveTitle")}</h2>
        <Link
          href={`/delivery/order/${mine.id}`}
          className="block rounded-card border-2 border-primary bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
              <Package className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-ink">
                  {mine.orderNumber}
                </span>
                <OrderStatusChip status={mine.status} size="sm" live />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {mine.vendor.name} → {mine.address?.area ?? mine.contact.name}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-semibold text-primary">
            {t("continueDelivery")} →
          </p>
        </Link>
      </section>
    );
  }

  if (!online) return null;

  /**
   * On a synthesised trip. The two delivery systems used not to know about each
   * other, so a rider could take a real customer's order while already carrying
   * an invented one — and then be unable to be in both places. Stating it beats
   * silently hiding the list.
   */
  if (activeJob) {
    return (
      <section>
        <h2 className="mb-3 text-h3 text-ink">{t("liveOffersTitle")}</h2>
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-body">
          {t("liveOffersPausedTrip")}
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-h3 text-ink">{t("liveOffersTitle")}</h2>
        <span className="rounded-pill bg-surface-muted px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted">
          {available.length}
        </span>
      </div>

      {available.length === 0 ? (
        <p className="rounded-card border border-dashed border-line py-8 text-center text-sm text-muted">
          {t("liveOffersEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {available.map((order) => (
            <li key={order.id}>
              <LiveOfferCard
                order={order}
                now={now}
                currency={currency}
                onAccept={() => {
                  const result = assignRider(order.id, rider, "manual");
                  if (result.error) {
                    // Say which rule refused it — "already carrying an order" is
                    // actionable, "something went wrong" is not.
                    toast.error(t(result.error));
                    return;
                  }
                  toast.success(t("deliveryAccepted", { number: order.orderNumber }));
                  router.push(`/delivery/order/${order.id}`);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One live job. Shows what a rider decides on: where from, where to, what it is
 * worth, whether there is cash to collect, and how long the food has been
 * sitting — a tray that has been on the pass for eight minutes is the one to
 * take next.
 */
function LiveOfferCard({
  order,
  now,
  currency,
  onAccept,
}: {
  order: Order;
  now: number;
  currency: CurrencyCode;
  onAccept: () => void;
}) {
  const t = useTranslations("delivery");
  const readyAt = order.lifecycle.events.find((e) => e.status === "ready");
  const waiting = readyAt ? toMinutes(now - Date.parse(readyAt.at)) : 0;
  const cashDue = cashDueOn(order);

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-sm font-bold text-ink">{order.orderNumber}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
            waiting >= 8 ? "text-danger" : "text-muted",
          )}
        >
          <Timer className="size-3.5" aria-hidden />
          {t("waitingMinutes", { count: waiting })}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <p className="flex items-start gap-2 text-sm">
          <Store className="mt-0.5 size-4 shrink-0 text-fresh-600" aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{order.vendor.name}</span>
            <span className="block text-xs text-muted">{t("collectFromCounter")}</span>
          </span>
        </p>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold text-ink">
              {order.address?.area ?? order.contact.name}
            </span>
            <span className="block truncate text-xs text-muted">
              {order.address?.line1 ?? ""}
            </span>
          </span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Bike className="size-3.5" aria-hidden />
          {t("itemsCount", { count: order.lines.reduce((n, l) => n + l.quantity, 0) })}
        </span>
        {cashDue > 0 && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-accent-600">
            <Banknote className="size-3.5" aria-hidden />
            {t("cashToCollect", { amount: formatPrice(cashDue, currency) })}
          </span>
        )}
        {order.pricing.tip > 0 && (
          <span className="font-semibold text-fresh-600">
            {t("tipIncluded", { amount: formatPrice(order.pricing.tip, currency) })}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onAccept}
        className="mt-3 h-12 w-full rounded-pill bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 active:scale-[0.99]"
      >
        {t("acceptDelivery")}
      </button>
    </div>
  );
}
