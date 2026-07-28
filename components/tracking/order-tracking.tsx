"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BadgeCheck,
  Bike,
  CookingPot,
  Loader2,
  MessageSquare,
  Navigation,
  PackageCheck,
  PackageX,
  PartyPopper,
  Phone,
  ReceiptText,
  ShoppingBag,
  Star,
  XCircle,
} from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { Courier, OrderStatus } from "@/types";
import { useOrders } from "@/stores/orders";
import { cancelOrder, getCourier } from "@/services/orders";
import {
  canCancel,
  hasCourier,
  remainingMinutes,
  trackingProgress,
  type TrackingProgress,
} from "@/lib/tracking";
import { cartCount } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TrackingMap } from "@/components/tracking/tracking-map";
import { cn } from "@/lib/utils";

/** Re-derive the simulated status on this cadence so the UI stays live. */
const TICK_MS = 10_000;

/** Icon per lifecycle stage, shared by the hero and the timeline. */
const STEP_ICON: Record<OrderStatus, typeof Bike> = {
  placed: ReceiptText,
  confirmed: BadgeCheck,
  preparing: CookingPot,
  ready: ShoppingBag,
  "picked-up": PackageCheck,
  "on-the-way": Navigation,
  delivered: PartyPopper,
  cancelled: XCircle,
};

/**
 * OrderTracking — the simulated live tracker (Phase C9). Resolves the order
 * from the persisted orders store, derives its live status from elapsed time
 * (see `lib/tracking`), and re-renders on a timer so the timeline, ETA and map
 * marker advance on their own. The customer can cancel while the kitchen hasn't
 * started. Frontend-only: no sockets, no real courier, no map tiles.
 */
export function OrderTracking({ orderId }: { orderId: string }) {
  const t = useTranslations("tracking");
  const to = useTranslations("order");
  const tc = useTranslations("checkout");
  const locale = useLocale();

  const hydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) => s.orders.find((o) => o.id === orderId));
  const updateStatus = useOrders((s) => s.updateStatus);

  const [now, setNow] = useState(() => Date.now());
  const [courier, setCourier] = useState<Courier | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Rehydrate the persisted store on the client (it skips auto-hydration).
  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  // Live tick — advances the simulated progression.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const progress = order ? trackingProgress(order, now) : null;
  const showCourier = !!(order && progress && hasCourier(order, progress));

  // Assign the courier once the order is out for delivery.
  useEffect(() => {
    if (showCourier && order && !courier) getCourier(order.id).then(setCourier);
  }, [showCourier, order, courier]);

  // ---- Loading / not-found (all hooks above run unconditionally) ----
  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!order || !progress) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <PackageX className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{to("notFound")}</h1>
        <p className="text-body">{to("notFoundHint")}</p>
        <Button href="/restaurants" className="mt-2">
          {to("backToHome")}
        </Button>
      </div>
    );
  }

  const currency = order.vendor.currency as CurrencyCode;
  const isDelivery = order.fulfillment === "delivery";
  const { pricing } = order;
  const mins = remainingMinutes(progress.remainingMs);
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const etaTime = fmtTime(progress.etaMs);
  const destinationLabel = isDelivery ? order.address?.label ?? t("mapYou") : order.vendor.name;

  function handleCancel() {
    if (!order) return;
    setCancelling(true);
    cancelOrder(order.id).then((res) => {
      setCancelling(false);
      setConfirmOpen(false);
      if (res.error || !res.data) {
        toast.error(t("cancelError"));
        return;
      }
      updateStatus(order.id, "cancelled");
      toast.success(t("cancelSuccess"));
    });
  }

  return (
    <div className="container-site max-w-2xl py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{to("orderNumber", { number: order.orderNumber })}</p>
        </div>
        {!progress.complete && !progress.cancelled && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-fresh/15 px-3 py-1 text-sm font-semibold text-fresh">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-fresh opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-fresh" />
            </span>
            {t("live")}
          </span>
        )}
      </div>

      {/* Status hero */}
      <StatusHero
        progress={progress}
        isDelivery={isDelivery}
        vendorName={order.vendor.name}
        mins={mins}
        etaTime={etaTime}
        t={t}
        to={to}
      />

      {/* Live map (delivery, while active) */}
      {isDelivery && !progress.cancelled && (
        <div className="mt-4">
          <TrackingMap
            fraction={progress.fraction}
            vendorName={order.vendor.name}
            destinationLabel={destinationLabel}
            moving={progress.currentStatus === "on-the-way"}
          />
        </div>
      )}

      {/* Courier */}
      {showCourier && courier && (
        <CourierCard courier={courier} t={t} />
      )}

      {/* Timeline */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <h2 className="mb-4 text-h3 text-ink">{t("timelineTitle")}</h2>
        <ol className="relative">
          {progress.steps.map((step, i) => {
            const Icon = STEP_ICON[step.status];
            const isLast = i === progress.steps.length - 1;
            return (
              <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-9 left-[17px] h-[calc(100%-1.75rem)] w-0.5",
                      step.done ? "bg-primary" : "bg-line",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-pill border-2 transition-colors",
                    step.done
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-surface text-muted",
                    step.active && "ring-4 ring-primary/20",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      step.done ? "text-ink" : "text-muted",
                    )}
                  >
                    {to(`status.${step.status}`)}
                    {step.active && (
                      <span className="ml-2 rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("now")}
                      </span>
                    )}
                  </span>
                  <time className="shrink-0 text-xs text-muted">{fmtTime(step.at)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Summary */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 text-ink">{to("summary")}</h2>
          <span className="text-sm text-muted">{order.vendor.name}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">{to("items", { count: cartCount(order.lines) })}</p>
        <ul className="mt-4 space-y-2 border-b border-line pb-4">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-body">
                <span className="font-semibold text-ink">{line.quantity}×</span> {line.name}
              </span>
              <span className="shrink-0 font-medium text-ink">
                {formatPrice(line.unitPrice * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between pt-4 text-base font-bold text-ink">
          <span>{tc("total")}</span>
          <span>{formatPrice(pricing.total, currency)}</span>
        </div>
        <Button
          href={`/checkout/success?order=${order.id}`}
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
        >
          {t("viewReceipt")}
        </Button>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {canCancel(order, progress) && (
          <Button
            variant="outline"
            size="lg"
            className="flex-1 border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => setConfirmOpen(true)}
          >
            {t("cancelOrder")}
          </Button>
        )}
        <Button
          href={`/restaurants/${order.vendor.slug}`}
          variant="outline"
          size="lg"
          className="flex-1"
        >
          {to("orderAgain")}
        </Button>
        <Button href="/" variant="ghost" size="lg" className="flex-1">
          {to("backToHome")}
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted">{t("simulatedNote")}</p>

      {/* Cancel confirmation */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} labelledBy="cancel-title">
        <div className="p-6">
          <h2 id="cancel-title" className="text-h3 text-ink">
            {t("cancelConfirmTitle")}
          </h2>
          <p className="mt-2 text-sm text-body">{t("cancelConfirmBody")}</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              onClick={() => setConfirmOpen(false)}
            >
              {t("keepOrder")}
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("confirmCancel")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatusHero({
  progress,
  isDelivery,
  vendorName,
  mins,
  etaTime,
  t,
  to,
}: {
  progress: TrackingProgress;
  isDelivery: boolean;
  vendorName: string;
  mins: number;
  etaTime: string;
  t: ReturnType<typeof useTranslations>;
  to: ReturnType<typeof useTranslations>;
}) {
  if (progress.cancelled) {
    return (
      <div className="flex items-center gap-4 rounded-panel border border-danger/30 bg-danger/5 p-6">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-danger/15 text-danger">
          <XCircle className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="text-h2 text-ink">{t("cancelledTitle")}</h2>
          <p className="text-sm text-body">{t("cancelledSub")}</p>
        </div>
      </div>
    );
  }

  if (progress.complete) {
    const Icon = isDelivery ? PartyPopper : ShoppingBag;
    return (
      <div className="flex items-center gap-4 rounded-panel border border-fresh/30 bg-fresh/5 p-6">
        <span className="animate-pop-in inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-fresh/15 text-fresh">
          <Icon className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="text-h2 text-ink">
            {isDelivery ? t("deliveredTitle") : t("readyTitle")}
          </h2>
          <p className="text-sm text-body">
            {isDelivery
              ? t("deliveredSub", { time: etaTime })
              : t("readySub", { vendor: vendorName })}
          </p>
        </div>
      </div>
    );
  }

  const Icon = STEP_ICON[progress.currentStatus];
  return (
    <div className="rounded-panel border border-line bg-surface p-6">
      <div className="flex items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{to(`status.${progress.currentStatus}`)}</h2>
          <p className="text-sm text-body">
            {t(`hint.${progress.currentStatus}`, { vendor: vendorName })}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-field bg-surface-muted px-4 py-3">
        <span className="text-sm text-muted">
          {isDelivery ? t("deliveryEta") : t("pickupEta")}
        </span>
        <span className="text-end">
          <span className="block text-h3 text-ink">
            {isDelivery ? t("arrivingIn", { minutes: mins }) : t("readyIn", { minutes: mins })}
          </span>
          <span className="block text-xs text-muted">{t("byTime", { time: etaTime })}</span>
        </span>
      </div>
    </div>
  );
}

function CourierCard({
  courier,
  t,
}: {
  courier: Courier;
  t: ReturnType<typeof useTranslations>;
}) {
  const initials = courier.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mt-4 flex items-center gap-4 rounded-panel border border-line bg-surface p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-base font-bold text-primary">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{t("courierTitle")}</p>
        <p className="truncate font-semibold text-ink">{courier.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Star className="size-3.5 fill-accent text-accent" aria-hidden />
          {courier.rating.toFixed(1)}
          <span aria-hidden>·</span>
          {t(`vehicle.${courier.vehicle}`)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("call")}
          onClick={() => toast.info(t("callToast", { name: courier.name }))}
        >
          <Phone className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("message")}
          onClick={() => toast.info(t("messageToast", { name: courier.name }))}
        >
          <MessageSquare className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
