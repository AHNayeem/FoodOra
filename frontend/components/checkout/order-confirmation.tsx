"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Clock, CreditCard, MapPin, PackageX, Store } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { Order } from "@/types";
import { useOrders } from "@/stores/orders";
import { cartCount } from "@/lib/cart";
import { isActive } from "@/lib/order-lifecycle";
import { isFailure } from "@/lib/order-machine";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { cn } from "@/lib/utils";

/**
 * OrderConfirmation — the receipt, and later the invoice (Phase C8; spec §8).
 *
 * One document serving two moments, because it is the same document: straight
 * after checkout it is a confirmation ("thanks, here is what happens next"), and
 * once the order has settled it is the invoice the spec asks for on completion —
 * same reference, same itemisation, with the payment now closed and the ETA
 * replaced by when it actually arrived. Splitting them into two screens would
 * duplicate the whole summary to change three lines.
 */
export function OrderConfirmation({ orderId }: { orderId: string }) {
  const t = useTranslations("order");
  const hydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) => s.orders.find((o) => o.id === orderId));

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <PackageX className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("notFound")}</h1>
        <p className="text-body">{t("notFoundHint")}</p>
        <Button href="/restaurants" className="mt-2">
          {t("backToHome")}
        </Button>
      </div>
    );
  }

  return <Receipt order={order} />;
}

function Receipt({ order }: { order: Order }) {
  const t = useTranslations("order");
  const tc = useTranslations("checkout");
  const locale = useLocale();
  const currency = order.vendor.currency as CurrencyCode;
  const { pricing } = order;
  const count = cartCount(order.lines);
  const isDelivery = order.fulfillment === "delivery";

  const settled = !isActive(order);
  const failed = isFailure(order.status);

  const etaTime = new Date(order.estimatedDeliveryAt).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const paymentLabel =
    order.payment.method === "card"
      ? t("payment.card", { last4: order.payment.cardLast4 ?? "" })
      : order.payment.method === "wallet"
        ? t("payment.wallet")
        : t("payment.cash");

  return (
    <div className="container-site max-w-2xl py-10">
      {/* Banner — a confirmation while it is in flight, an invoice once settled. */}
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "animate-pop-in inline-flex size-16 items-center justify-center rounded-pill",
            failed ? "bg-danger/10 text-danger" : "bg-fresh/15 text-fresh",
          )}
        >
          <CheckCircle2 className="size-9" aria-hidden />
        </span>
        <h1 className="mt-4 text-h1 text-ink">
          {settled ? t("invoiceTitle") : t("confirmedTitle")}
        </h1>
        <p className="mt-1 text-body">
          {settled
            ? t("invoiceSub", { number: order.orderNumber })
            : t("confirmedSub", { name: order.contact.name })}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-pill bg-surface-muted px-4 py-1.5 text-sm font-semibold text-ink">
            {t("orderNumber", { number: order.orderNumber })}
          </span>
          <OrderStatusChip status={order.status} live={isActive(order)} />
        </div>
      </div>

      {/* When it is coming — or when it came. */}
      <div className="mt-8 flex items-center gap-3 rounded-panel border border-line bg-surface p-5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary">
          <Clock className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm text-muted">
            {settled
              ? t("deliveredAt")
              : isDelivery
                ? t("estimatedDelivery")
                : t("estimatedPickup")}
          </p>
          <p className="text-h3 text-ink">
            {order.scheduledFor && !settled ? t("scheduledFor", { time: etaTime }) : etaTime}
          </p>
        </div>
      </div>

      {/* Destination + payment */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InfoCard icon={isDelivery ? MapPin : Store} label={isDelivery ? t("deliveringTo") : t("pickupFrom")}>
          {isDelivery && order.address ? (
            <>
              <span className="block font-semibold text-ink">{order.address.label}</span>
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.area}, {order.address.city}
            </>
          ) : (
            <span className="font-semibold text-ink">{order.vendor.name}</span>
          )}
        </InfoCard>
        <InfoCard icon={CreditCard} label={t("paidWith")}>
          <span className="font-semibold text-ink">{paymentLabel}</span>
          {/* Payment status is part of the invoice the spec asks for — and it
              genuinely moves now: a cash order settles when the rider collects. */}
          <span
            className={cn(
              "mt-0.5 block font-semibold",
              order.payment.status === "paid" && "text-fresh-600",
              order.payment.status === "refunded" && "text-primary",
              order.payment.status === "failed" && "text-danger",
            )}
          >
            {t(`paymentStatus.${order.payment.status}`)}
          </span>
          <span className="block text-muted">{order.contact.name} · {order.contact.phone}</span>
        </InfoCard>
      </div>

      {order.notes && (
        <div className="mt-4 rounded-panel border border-line bg-surface p-5">
          <p className="text-sm text-muted">{t("notes")}</p>
          <p className="mt-1 text-sm text-body">{order.notes}</p>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-h3 text-ink">{t("summary")}</h2>
        <p className="mt-0.5 text-sm text-muted">{t("items", { count })}</p>
        <ul className="mt-4 space-y-2.5 border-b border-line pb-4">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-body">
                <span className="font-semibold text-ink">{line.quantity}×</span> {line.name}
                {line.options.length > 0 && (
                  <span className="block truncate text-xs text-muted">
                    {line.options.map((o) => o.name).join(", ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-medium text-ink">
                {formatPrice(line.unitPrice * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 pt-4 text-sm">
          <Row label={tc("subtotal")} value={formatPrice(pricing.subtotal, currency)} />
          <Row
            label={tc("deliveryFee")}
            value={pricing.deliveryFee === 0 ? tc("free") : formatPrice(pricing.deliveryFee, currency)}
          />
          {pricing.discount > 0 && (
            <Row
              label={
                pricing.couponCode
                  ? tc("discountWithCode", { code: pricing.couponCode })
                  : tc("discount")
              }
              value={`− ${formatPrice(pricing.discount, currency)}`}
            />
          )}
          <Row label={tc("tax", { label: pricing.taxLabel })} value={formatPrice(pricing.tax, currency)} />
          {pricing.tip > 0 && <Row label={tc("tip")} value={formatPrice(pricing.tip, currency)} />}
        </dl>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-base font-bold text-ink">
          <span>{tc("total")}</span>
          <span>{formatPrice(pricing.total, currency)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button href={`/orders/${order.id}`} size="lg" className="flex-1">
          {isActive(order) ? t("trackOrder") : t("viewTimeline")}
        </Button>
        <Button href={`/restaurants/${order.vendor.slug}`} variant="outline" size="lg" className="flex-1">
          {t("orderAgain")}
        </Button>
        <Button href="/" variant="ghost" size="lg" className="flex-1">
          {t("backToHome")}
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Icon className="size-4" aria-hidden />
        {label}
      </p>
      <p className="mt-1.5 text-sm text-body">{children}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-body">
      <dt>{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
