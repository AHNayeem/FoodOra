"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  ChevronLeft,
  MapPin,
  Navigation,
  Package,
  Phone,
  ShieldCheck,
  Store,
  StickyNote,
} from "lucide-react";
import type { Order, OrderCancelReason, OrderStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders } from "@/stores/orders";
import { verifyOtp } from "@/services/orders";
import { jobForOrder } from "@/services/delivery";
import {
  cashDueOn,
  isTerminal,
  riderActions,
  type OrderAction,
} from "@/lib/order-machine";
import { DELIVERY_FAIL_REASONS } from "@/lib/order-lifecycle";
import { noteDetail } from "@/lib/order-events";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { HandoverDialog } from "@/components/orders/handover-dialog";
import { OtpDialog } from "@/components/orders/otp-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { ContactButton } from "@/components/orders/contact-dialog";
import { cn } from "@/lib/utils";
import { useRiderApp } from "./rider-context";
import { PayoutBreakdown } from "./payout-breakdown";

const TICK_MS = 1000;

/**
 * LiveTripView — running a real customer's delivery (spec §5–§8).
 *
 * The existing trip screen (`trip-view.tsx`) drives a synthesised multi-stop
 * job and stays as it was — it is what demonstrates batching, routing and
 * payouts. This one drives a single *real* order through the spec's delivery
 * half, and it is the screen the end-to-end demo runs on: collect from the
 * restaurant, ride, arrive, verify the customer's code, done.
 *
 * The OTP step is the point of the screen. The code is checked in the seam
 * against the order's own OTP (`services/orders.verifyOtp`), attempts are
 * counted on the order, and three wrong codes lock the handoff — at which point
 * the rider's only remaining moves are to report a failed delivery and either
 * retry or take the food back. That is the spec's "OTP Incorrect" and "Delivery
 * Failed" scenarios, as a branch of the state machine rather than a toast.
 */
export function LiveTripView({ orderId }: { orderId: string }) {
  const t = useTranslations("delivery");
  const router = useRouter();
  const { rider } = useRiderApp();

  const hydrated = useOrders((s) => s.hydrated);
  const order = useOrders((s) => s.orders.find((o) => o.id === orderId));
  const advance = useOrders((s) => s.advance);
  const failOtp = useOrders((s) => s.failOtp);
  const failHandover = useOrders((s) => s.failHandover);
  const notifyNearby = useOrders((s) => s.notifyNearby);

  const [now, setNow] = useState(() => Date.now());
  const [otpOpen, setOtpOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [handoverError, setHandoverError] = useState<string | null>(null);

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <Package className="size-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-h2 text-ink">{t("tripNotFoundTitle")}</h1>
        <p className="mt-1 text-sm text-body">{t("tripNotFoundBody")}</p>
        <Button href="/delivery" variant="outline" className="mt-4">
          {t("backToToday")}
        </Button>
      </div>
    );
  }

  const currency = order.pricing.currency as CurrencyCode;
  const actions = riderActions(order);
  const cashDue = cashDueOn(order);

  /** Apply a plain transition and report it. */
  function run(to: OrderStatus, patch = {}) {
    if (!order) return;
    const result = advance(order.id, to, "rider", patch);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    // Leaving the restaurant is when the customer should hear "on its way".
    if (to === "on-the-way") notifyNearby(order.id);
    if (to === "ready") {
      toast.success(t("handedBack"));
      router.push("/delivery");
      return;
    }
    toast.success(t(`advanced.${to}`));
  }

  function onAction(action: OrderAction) {
    if (action.prompts === "otp") {
      setOtpError(null);
      setOtpOpen(true);
      return;
    }
    if (action.prompts === "fail-reason") {
      setFailOpen(true);
      return;
    }
    if (action.prompts === "handover") {
      setHandoverError(null);
      setHandoverOpen(true);
      return;
    }
    run(action.to as OrderStatus);
  }

  /**
   * The handoff: verified in the seam, counted on the order — and the cash
   * carried through.
   *
   * `cashCollected` used to stop here: the dialog asked the rider to confirm the
   * money, and the answer was dropped on the floor (G05). It now goes into the
   * transition, which refuses to close a cash delivery without it — so from this
   * commit on, the platform's books say the order is paid and the rider's wallet
   * says they are carrying the note, and both statements come from one place.
   */
  function submitOtp({ otp, cashCollected }: { otp: string; cashCollected: boolean }) {
    if (!order) return;
    setSubmitting(true);
    verifyOtp(order, otp).then((res) => {
      setSubmitting(false);
      if (res.error) {
        failOtp(order.id);
        setOtpError(t("errors.otpMismatch"));
        return;
      }
      const result = advance(order.id, "delivered", "rider", { cashCollected });
      if (result.error) {
        setOtpError(t(result.error));
        return;
      }
      setOtpOpen(false);
      toast.success(
        cashDueOn(order) > 0
          ? t("deliveredWithCash", {
              name: order.contact.name,
              amount: formatPrice(cashDueOn(order), currency),
            })
          : t("deliveredTo", { name: order.contact.name }),
      );
    });
  }

  const done = order.status === "delivered" || order.status === "completed";
  /**
   * What this delivery paid (G04). Derived from the order rather than looked up,
   * and only once it is over — the payout is anchored to the handoff, so this is
   * the same figure the completed order carries in its financials and the same
   * one the rider's wallet counts.
   */
  const trip = done ? jobForOrder(order) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/delivery"
          aria-label={t("backToToday")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-h2 text-ink">{order.orderNumber}</h1>
          <div className="mt-0.5">
            <OrderStatusChip status={order.status} size="sm" live={!isTerminal(order.status)} />
          </div>
        </div>
        <span className="text-end">
          <span className="block text-lg font-extrabold text-ink tabular-nums">
            {formatPrice(order.pricing.total, currency)}
          </span>
          <span className="block text-xs text-muted">{t("orderValue")}</span>
        </span>
      </div>

      {done ? (
        <>
          <section className="rounded-card border border-fresh/40 bg-fresh/5 p-6 text-center">
            <span className="animate-pop-in inline-flex size-14 items-center justify-center rounded-pill bg-fresh text-white">
              <Check className="size-7" aria-hidden />
            </span>
            <h2 className="mt-3 text-h2 text-ink">{t("handoffDoneTitle")}</h2>
            <p className="mt-1 text-sm text-body">
              {t("handoffDoneBody", { name: order.contact.name })}
            </p>
            {cashDue === 0 && order.payment.status === "paid" && (
              <p className="mt-3 inline-flex rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-fresh-600">
                {t("paymentSettled")}
              </p>
            )}
            {trip && (
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
                {formatPrice(trip.payout.total, currency)}
              </p>
            )}
            <Button href="/delivery" className="mt-4">
              {t("backToToday")}
            </Button>
          </section>

          {/* The same receipt a synthesised trip gets — one earnings display. */}
          {trip && (
            <PayoutBreakdown
              payout={trip.payout}
              cashCollected={trip.cashToCollect}
              className="rounded-card border border-line bg-surface p-5"
            />
          )}
        </>
      ) : (
        <StopCard order={order} cashDue={cashDue} currency={currency} />
      )}

      {/* Actions — derived from the machine, never hardcoded per screen. */}
      {actions.length > 0 && (
        <div className="space-y-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => onAction(action)}
              disabled={submitting}
              className={cn(
                "h-13 w-full rounded-pill text-base font-bold transition-colors disabled:opacity-60",
                action.tone === "primary"
                  ? "bg-primary text-white hover:bg-primary-600"
                  : "border border-line text-danger hover:bg-danger/5",
              )}
            >
              {action.key === "verifyOtp" ? (
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4.5" aria-hidden />
                  {t(action.key)}
                </span>
              ) : (
                t(action.key)
              )}
            </button>
          ))}
        </div>
      )}

      {/* History */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">{t("historyTitle")}</h2>
        <OrderTimeline order={order} now={now} compact />
      </section>

      <OtpDialog
        open={otpOpen}
        order={order}
        submitting={submitting}
        error={otpError}
        onClose={() => setOtpOpen(false)}
        onConfirm={submitOtp}
      />

      {/* Collecting the food from the counter (Phase 10, G22). The code is
          *revealed* here: it is the courier's, derived from the order and their own
          assignment, and this is the screen they read it out from. The checklist is
          the same four items the counter confirms, because both parties are
          confirming the same bag. */}
      <HandoverDialog
        open={handoverOpen}
        order={order}
        revealCode
        submitting={submitting}
        error={handoverError}
        onClose={() => setHandoverOpen(false)}
        onConfirm={(handover) => {
          const result = advance(order.id, "picked-up", "rider", { handover });
          if (result.error) {
            // Counted in the store, because a refused transition is pure — the
            // same split as the doorstep OTP a few lines above.
            if (result.error === "errors.handoverCodeInvalid") failHandover(order.id);
            setHandoverError(t(result.error));
            return;
          }
          setHandoverError(null);
          setHandoverOpen(false);
          toast.success(t("advanced.picked-up"));
        }}
      />

      <ReasonDialog
        open={failOpen}
        title={t("failTitle")}
        body={t("failBody")}
        reasons={DELIVERY_FAIL_REASONS}
        confirmLabel={t("confirmFail")}
        submitting={submitting}
        onClose={() => setFailOpen(false)}
        onConfirm={(reason: OrderCancelReason, note) => {
          run("delivery-failed", { reason, detail: noteDetail(note) });
          setFailOpen(false);
        }}
      />

      {/* Kept out of the render path above so the rider id is visibly used —
          the order carries the assignment, this screen only displays it. */}
      <p className="text-center text-xs text-muted">
        {t("assignedTo", { name: order.lifecycle.rider?.name ?? rider.name })}
      </p>
    </div>
  );
}

/**
 * Where the rider has to be right now. Before pickup that is the restaurant;
 * after it, the customer's door. One card, one address, one set of contact
 * buttons — a rider reads this at a traffic light.
 */
function StopCard({
  order,
  cashDue,
  currency,
}: {
  order: Order;
  cashDue: number;
  currency: CurrencyCode;
}) {
  const t = useTranslations("delivery");
  const atRestaurant = order.status === "rider-assigned";

  return (
    <section className="rounded-card border-2 border-primary/40 bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-pill text-white",
            atRestaurant ? "bg-fresh" : "bg-primary",
          )}
        >
          {atRestaurant ? (
            <Store className="size-4.5" aria-hidden />
          ) : (
            <MapPin className="size-4.5" aria-hidden />
          )}
        </span>
        <span className="text-xs font-bold tracking-wide text-primary uppercase">
          {t(atRestaurant ? "nowCollect" : "nowDeliver")}
        </span>
      </div>

      <h2 className="mt-3 text-h3 text-ink">
        {atRestaurant ? order.vendor.name : order.contact.name}
      </h2>
      <p className="text-sm text-body">
        {atRestaurant
          ? t("collectFromCounter")
          : [order.address?.line1, order.address?.line2, order.address?.area]
              .filter(Boolean)
              .join(", ")}
      </p>

      {!atRestaurant && order.address?.instructions && (
        <p className="mt-3 flex items-start gap-2 rounded-field bg-surface-alt p-3 text-sm text-body">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {order.address.instructions}
        </p>
      )}

      {atRestaurant && (
        <ul className="mt-3 space-y-1 rounded-field bg-surface-alt p-3 text-sm text-body">
          {order.lines.map((line) => (
            <li key={line.id} className="truncate">
              <span className="font-bold text-ink tabular-nums">{line.quantity}×</span>{" "}
              {line.name}
            </li>
          ))}
        </ul>
      )}

      {cashDue > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-field bg-accent-50 p-3 text-sm font-semibold text-accent-600">
          <Banknote className="size-4" aria-hidden />
          {t("collectCash", { amount: formatPrice(cashDue, currency) })}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StopAction icon={Navigation} label={t("navigate")} toastKey="navigateStub" />
        {/* The courier's end of the customer's thread (Phase 17, G27). The same
            rows the tracker reads, so an answer typed here lands there — and the
            call button logs the attempt rather than claiming a call happened. */}
        <ContactButton
          order={order}
          party="rider"
          viewer="rider"
          viewerName={order.lifecycle.rider?.name ?? ""}
          label={t("message")}
          className="w-full"
        />
      </div>
    </section>
  );
}

/** Navigation is still an honest stub — there is no mapping provider. */
function StopAction({
  icon: Icon,
  label,
  toastKey,
}: {
  icon: typeof Phone;
  label: string;
  toastKey: string;
}) {
  const t = useTranslations("delivery");
  return (
    <button
      type="button"
      onClick={() => toast.info(t(toastKey))}
      className="flex flex-col items-center gap-1 rounded-field border border-line py-2.5 text-xs font-semibold text-body transition-colors hover:bg-surface-muted"
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}
