"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bike,
  ChefHat,
  MessageSquare,
  PackageX,
  PartyPopper,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Star,
  Timer,
  XCircle,
} from "lucide-react";
import type { CurrencyCode } from "@/frontend/config/regions";
import type { OrderCancelReason } from "@/frontend/types";
import { useOrders } from "@/frontend/stores/orders";
import { cancelOrder } from "@/frontend/services/orders";
import { remainingMinutes, trackingProgress, type TrackingProgress } from "@/frontend/lib/tracking";
import {
  canCustomerCancel,
  isOtpRevealed,
  isTerminal,
} from "@/frontend/lib/order-machine";
import { CUSTOMER_CANCEL_REASONS, toMinutes } from "@/frontend/lib/order-lifecycle";
import { cartCount } from "@/frontend/lib/cart";
import { formatPrice } from "@/frontend/lib/format";
import { Button } from "@/frontend/components/ui/button";
import { OrderTimeline } from "@/frontend/components/orders/order-timeline";
import { ReasonDialog } from "@/frontend/components/orders/reason-dialog";
import { STATUS_ICON } from "@/frontend/components/orders/order-status-meta";
import { TrackingMap } from "@/frontend/components/tracking/tracking-map";
import { cn } from "@/frontend/lib/utils";

/**
 * Re-render cadence. One second, not ten: the screen now shows a live
 * preparation countdown, and a countdown that jumps in ten-second steps looks
 * broken. Nothing is *computed* on this tick beyond time formatting.
 */
const TICK_MS = 1000;

/**
 * OrderTracking — the customer's live tracker (spec §1–§8).
 *
 * The rewrite here is not cosmetic. This screen used to derive an order's status
 * by interpolating the clock between `placedAt` and the ETA, so the food
 * "arrived" forty minutes after checkout whether or not a restaurant had ever
 * accepted it — and the OTP step the spec makes mandatory was decorative.
 *
 * It now reads the order out of the shared store, which is the same record the
 * restaurant board and the rider app write to. Every stage on screen is
 * something somebody actually did, in the tab next door or on the autopilot.
 * The clock is used for exactly two things: how long until the kitchen's
 * promised ready time, and how far along the route to draw the marker.
 *
 * The handoff code follows the spec strictly — it is issued at checkout but
 * revealed only once the rider is at the door (`isOtpRevealed`).
 */
export function OrderTracking({ orderId }: { orderId: string }) {
  const t = useTranslations("tracking");
  const to = useTranslations("order");
  const tc = useTranslations("checkout");
  const locale = useLocale();

  const hydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) => s.orders.find((o) => o.id === orderId));
  const advance = useOrders((s) => s.advance);
  const askRefund = useOrders((s) => s.askRefund);

  const [now, setNow] = useState(() => Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  // Live tick — drives countdowns and the map marker only.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (!hydrated) return <TrackingSkeleton />;

  if (!order) {
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

  const progress = trackingProgress(order, now);
  const currency = order.vendor.currency as CurrencyCode;
  const isDelivery = order.fulfillment === "delivery";
  const rider = order.lifecycle.rider;
  const showOtp = isOtpRevealed(order);

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  function handleCancel(reason: OrderCancelReason, note: string) {
    if (!order) return;
    setCancelling(true);
    cancelOrder(order.id, reason).then((res) => {
      setCancelling(false);
      setCancelOpen(false);
      if (res.error || !res.data) {
        toast.error(t("cancelError"));
        return;
      }
      const result = advance(order.id, "cancelled", "customer", {
        reason,
        note: note || null,
      });
      if (result.error) {
        toast.error(t("cancelError"));
        return;
      }
      toast.success(t("cancelSuccess"));
    });
  }

  return (
    <div className="container-site max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">
            {to("orderNumber", { number: order.orderNumber })}
          </p>
        </div>
        {!isTerminal(order.status) && order.status !== "delivered" && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-fresh/15 px-3 py-1 text-sm font-semibold text-fresh">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-fresh opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-fresh" />
            </span>
            {t("live")}
          </span>
        )}
      </div>

      <StatusHero
        order={order}
        progress={progress}
        now={now}
        isDelivery={isDelivery}
        etaTime={fmtTime(progress.etaMs)}
      />

      {/* Live map — only once a courier is actually carrying the food. */}
      {isDelivery &&
        (order.status === "picked-up" ||
          order.status === "on-the-way" ||
          order.status === "arrived" ||
          order.status === "delivery-failed") && (
          <div className="mt-4">
            <TrackingMap
              fraction={progress.fraction}
              vendorName={order.vendor.name}
              destinationLabel={order.address?.label ?? t("mapYou")}
              moving={order.status === "on-the-way"}
            />
          </div>
        )}

      {/* The rider, from the moment one is assigned — not from pickup. */}
      {rider && <RiderCard order={order} />}

      {/* Handoff code — revealed only at the door (spec §7). */}
      {showOtp && (
        <div className="animate-pop-in mt-4 flex items-center gap-4 rounded-panel border-2 border-primary/40 bg-primary/5 p-5">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">{t("handoffCodeTitle")}</p>
            <p className="text-3xl font-extrabold tracking-[0.3em] text-ink tabular-nums">
              {order.lifecycle.otp}
            </p>
          </div>
          <p className="max-w-40 text-xs text-muted">{t("handoffCodeHint")}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <h2 className="mb-4 text-h3 text-ink">{t("timelineTitle")}</h2>
        <OrderTimeline order={order} now={now} />
      </div>

      {/* Summary */}
      <div className="mt-4 rounded-panel border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 text-ink">{to("summary")}</h2>
          <span className="text-sm text-muted">{order.vendor.name}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {to("items", { count: cartCount(order.lines) })}
        </p>
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
          <span>{formatPrice(order.pricing.total, currency)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{to(`payment.${order.payment.method}`, { last4: order.payment.cardLast4 ?? "" })}</span>
          <span
            className={cn(
              "font-semibold",
              order.payment.status === "paid" && "text-fresh-600",
              order.payment.status === "refunded" && "text-primary",
            )}
          >
            {to(`paymentStatus.${order.payment.status}`)}
          </span>
        </div>
        <Button
          href={`/checkout/success?order=${order.id}`}
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
        >
          <ReceiptText className="size-4" aria-hidden />
          {progress.complete ? t("viewInvoice") : t("viewReceipt")}
        </Button>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {canCustomerCancel(order) && (
          <Button
            variant="outline"
            size="lg"
            className="flex-1 border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => setCancelOpen(true)}
          >
            {t("cancelOrder")}
          </Button>
        )}
        {progress.failed && order.lifecycle.refund === "none" && (
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => {
              askRefund(order.id);
              toast.success(t("refundRequested"));
            }}
          >
            {t("requestRefund")}
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
        <Button href="/account/orders" variant="ghost" size="lg" className="flex-1">
          {t("allOrders")}
        </Button>
      </div>

      {order.lifecycle.refund === "requested" && (
        <p className="mt-4 rounded-field bg-surface-muted p-3 text-center text-sm text-body">
          {t("refundPending", {
            amount: formatPrice(order.lifecycle.refundAmount, currency),
          })}
        </p>
      )}

      {/* A wallet refund is not pending anything — the money is already back
          (C19), so say so, and point at the ledger row that proves it. */}
      {order.lifecycle.refund === "approved" && order.payment.method === "wallet" && (
        <p className="mt-4 rounded-field bg-fresh/10 p-3 text-center text-sm text-body">
          {t("refundedToWallet", {
            amount: formatPrice(order.lifecycle.refundAmount, currency),
          })}{" "}
          <Link href="/account/wallet" className="font-semibold text-primary hover:underline">
            {t("viewWallet")}
          </Link>
        </p>
      )}

      <p className="mt-6 text-center text-xs text-muted">{t("simulatedNote")}</p>

      <ReasonDialog
        open={cancelOpen}
        title={t("cancelConfirmTitle")}
        body={t("cancelConfirmBody")}
        reasons={CUSTOMER_CANCEL_REASONS}
        confirmLabel={t("confirmCancel")}
        submitting={cancelling}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
      />
    </div>
  );
}

/**
 * The hero — the one sentence the customer opened the page for.
 *
 * Three shapes, because three situations genuinely differ: a finished order (a
 * result), an interrupted one (an explanation), and one in flight (a countdown).
 * The in-flight case shows the kitchen's promised time while the food is being
 * cooked and the delivery ETA once it has left, rather than one ETA that means
 * different things at different moments.
 */
function StatusHero({
  order,
  progress,
  now,
  isDelivery,
  etaTime,
}: {
  order: Parameters<typeof trackingProgress>[0];
  progress: TrackingProgress;
  now: number;
  isDelivery: boolean;
  etaTime: string;
}) {
  const t = useTranslations("tracking");
  const to = useTranslations("order");

  if (progress.failed) {
    const reason =
      order.lifecycle.rejectionReason ??
      order.lifecycle.cancelReason ??
      order.lifecycle.failureReason;
    return (
      <div className="flex items-start gap-4 rounded-panel border border-danger/30 bg-danger/5 p-6">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-danger/15 text-danger">
          <XCircle className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{to(`status.${order.status}`)}</h2>
          <p className="text-sm text-body">
            {t(`failed.${order.status}`, { vendor: order.vendor.name })}
          </p>
          {reason && (
            <p className="mt-2 inline-flex rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-body">
              {to(`reason.${reason}`)}
            </p>
          )}
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
            {isDelivery ? t("deliveredTitle") : t("collectedTitle")}
          </h2>
          <p className="text-sm text-body">{t("deliveredSub", { time: etaTime })}</p>
        </div>
      </div>
    );
  }

  const Icon = STATUS_ICON[order.status];
  // While the kitchen has the order, count down to the *promise*. Once it is on
  // the road, count down to the door.
  const inKitchen =
    order.status === "confirmed" ||
    order.status === "preparing" ||
    order.status === "packing";
  const readyMins = progress.readyMs == null ? null : toMinutes(progress.readyMs);
  const overdue = progress.readyMs != null && progress.readyMs < 0;

  return (
    <div className="rounded-panel border border-line bg-surface p-6">
      <div className="flex items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{to(`status.${order.status}`)}</h2>
          <p className="text-sm text-body">
            {t(`hint.${order.status}`, {
              vendor: order.vendor.name,
              rider: order.lifecycle.rider?.name ?? "",
            })}
          </p>
        </div>
      </div>

      {/* Kitchen progress — a real bar against a promised time. */}
      {inKitchen && order.lifecycle.prepMinutes != null && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <ChefHat className="size-4 text-accent-600" aria-hidden />
              {t("prepProgress")}
            </span>
            <span
              className={cn(
                "font-bold tabular-nums",
                overdue ? "text-danger" : "text-ink",
              )}
            >
              {overdue
                ? t("runningLate")
                : t("readyIn", { minutes: readyMins ?? 0 })}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.prepFraction * 100)}
          >
            <div
              className={cn(
                "h-full rounded-pill transition-[width] duration-1000 ease-linear",
                overdue ? "bg-danger" : "bg-accent",
              )}
              style={{ width: `${Math.round(progress.prepFraction * 100)}%` }}
            />
          </div>
          {order.lifecycle.delayMinutes > 0 && (
            <p className="mt-2 text-xs font-medium text-accent-600">
              {t("delayNotice", { minutes: order.lifecycle.delayMinutes })}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 rounded-field bg-surface-muted px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Timer className="size-4" aria-hidden />
          {isDelivery ? t("deliveryEta") : t("pickupEta")}
        </span>
        <span className="text-end">
          <span className="block text-h3 text-ink tabular-nums">
            {t("arrivingIn", { minutes: remainingMinutes(progress.remainingMs) })}
          </span>
          <span className="block text-xs text-muted">{t("byTime", { time: etaTime })}</span>
        </span>
      </div>
      {/* `now` participates so the countdown re-renders each tick. */}
      <span className="sr-only">{new Date(now).toISOString()}</span>
    </div>
  );
}

/** Who is bringing it — name, vehicle, rating, and the two contact affordances. */
function RiderCard({ order }: { order: Parameters<typeof trackingProgress>[0] }) {
  const t = useTranslations("tracking");
  const rider = order.lifecycle.rider!;
  const initials = rider.name
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
        <p className="truncate font-semibold text-ink">{rider.name}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <Star className="size-3.5 fill-accent text-accent" aria-hidden />
          {rider.rating.toFixed(1)}
          <span aria-hidden>·</span>
          <Bike className="size-3.5" aria-hidden />
          {t(`vehicle.${rider.vehicle}`)}
          {rider.plate && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono">{rider.plate}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("call")}
          onClick={() => toast.info(t("callToast", { name: rider.name }))}
        >
          <Phone className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("message")}
          onClick={() => toast.info(t("messageToast", { name: rider.name }))}
        >
          <MessageSquare className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/**
 * Loading state. A skeleton of the real layout rather than a spinner, so the
 * page does not reflow when the persisted store finishes rehydrating.
 */
function TrackingSkeleton() {
  return (
    <div className="container-site max-w-2xl py-8">
      <div className="mb-6 h-9 w-52 animate-pulse rounded-pill bg-surface-muted" />
      <div className="h-32 animate-pulse rounded-panel bg-surface-muted" />
      <div className="mt-4 h-56 animate-pulse rounded-panel bg-surface-muted" />
      <div className="mt-4 h-72 animate-pulse rounded-panel bg-surface-muted" />
    </div>
  );
}
