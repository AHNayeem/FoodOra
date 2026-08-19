"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  ChevronLeft,
  Layers,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  Route,
  ShieldCheck,
  Store,
  Timer,
} from "lucide-react";
import type { DeliveryJob, DeliveryStop } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useRider } from "@/stores/rider";
import { cancelJob, completeStop } from "@/services/delivery";
import { cashOutstanding, isBatch, jobProgress } from "@/lib/delivery";
import { formatDistance, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRiderApp } from "./rider-context";
import { PayoutBreakdown } from "./payout-breakdown";
import { RouteMap } from "./route-map";
import { HandoffDialog } from "./handoff-dialog";

/** ETAs are minute-grained, so a ten-second tick is plenty. */
const TICK_MS = 10_000;

/**
 * TripView — `/delivery/trip/[id]`, running the delivery (Phase C18).
 *
 * The screen is a checklist with a map on top, because that is what the job is:
 * one stop at a time, in the order the router chose. Only the next stop is
 * actionable — the seam refuses anything else — so there is exactly one button to
 * find while wearing a helmet.
 *
 * A pickup completes in one tap. A dropoff goes through the handoff sheet, where
 * the customer's code and any cash are checked. Completing the last stop settles
 * the trip into this device's history and the screen becomes its receipt.
 */
export function TripView({ jobId }: { jobId: string }) {
  const t = useTranslations("delivery");

  const activeJob = useRider((s) => s.activeJob);
  const completedJobs = useRider((s) => s.completed);
  const hydrated = useRider((s) => s.hydrated);

  useEffect(() => {
    useRider.persist.rehydrate();
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  if (activeJob?.id === jobId) return <ActiveTrip job={activeJob} />;

  const finished = completedJobs.find((j) => j.id === jobId);
  if (finished) return <TripReceipt job={finished} />;

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

/**
 * The live trip. Split from the resolver above so the trip's clock and its two
 * mutations live in a component that always has a job — the handlers are then
 * plain event callbacks rather than functions the renderer might run.
 */
function ActiveTrip({ job }: { job: DeliveryJob }) {
  const t = useTranslations("delivery");
  const router = useRouter();
  const { zone } = useRiderApp();

  const setActiveJob = useRider((s) => s.setActiveJob);
  const finishJob = useRider((s) => s.finishJob);
  const clearActiveJob = useRider((s) => s.clearActiveJob);

  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [handoffStop, setHandoffStop] = useState<DeliveryStop | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const currency = job.currency as CurrencyCode;
  const progress = jobProgress(job, now);
  const next = progress.nextStop;

  const advance = useCallback(
    (stop: DeliveryStop, otp?: string, cashCollected?: boolean) => {
      setSubmitting(true);
      setHandoffError(null);
      completeStop({ job, stopId: stop.id, now: Date.now(), otp, cashCollected }).then(
        (res) => {
          setSubmitting(false);
          if (res.error || !res.data) {
            const message = t(res.error ?? "errors.generic");
            if (stop.kind === "dropoff") setHandoffError(message);
            else toast.error(message);
            return;
          }
          setHandoffStop(null);
          if (res.data.status === "delivered") {
            finishJob(res.data);
            toast.success(t("tripComplete"));
            return;
          }
          setActiveJob(res.data);
          toast.success(
            stop.kind === "pickup"
              ? t("collectedFrom", { name: stop.name })
              : t("deliveredTo", { name: stop.name }),
          );
        },
      );
    },
    [job, finishJob, setActiveJob, t],
  );

  const giveBack = useCallback(() => {
    setSubmitting(true);
    cancelJob({ job, now: Date.now() }).then((res) => {
      setSubmitting(false);
      if (res.error) {
        toast.error(t(res.error));
        return;
      }
      clearActiveJob();
      toast.success(t("tripReturned"));
      router.push("/delivery");
    });
  }, [job, clearActiveJob, router, t]);

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
          <h1 className="truncate text-h2 text-ink">{job.jobNumber}</h1>
          <p className="text-xs text-muted">
            {t("stopsProgress", { done: progress.completed, total: progress.total })} ·{" "}
            {t(`status.${job.status}`)}
          </p>
        </div>
        <span className="text-end">
          <span className="block text-lg font-extrabold text-ink">
            {formatPrice(job.payout.total, currency)}
          </span>
          <span className="block text-xs text-muted">{t("payoutLabel")}</span>
        </span>
      </div>

      <RouteMap
        stops={job.stops}
        origin={{ lat: zone.lat, lng: zone.lng }}
        completedStopIds={job.completedStopIds}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Route className="size-3.5" aria-hidden />
          {formatDistance(job.distanceKm)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden />
          {t("remainingMinutes", { count: progress.remainingMinutes })}
        </span>
        {isBatch(job) && (
          <Badge tone="primary">
            <Layers className="size-3" aria-hidden />
            {t("batchOf", { count: job.orders.length })}
          </Badge>
        )}
        {cashOutstanding(job) > 0 && (
          <Badge tone="accent">
            <Banknote className="size-3" aria-hidden />
            {t("cashToCollect", {
              amount: formatPrice(cashOutstanding(job), currency),
            })}
          </Badge>
        )}
      </div>

      {/* The stop the rider is riding to */}
      {next && (
        <CurrentStop
          stop={next}
          job={job}
          currency={currency}
          submitting={submitting}
          onPickup={() => advance(next)}
          onDeliver={() => {
            setHandoffError(null);
            setHandoffStop(next);
          }}
        />
      )}

      {/* The rest of the route */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">{t("routeTitle")}</h2>
        <ol className="mt-3 space-y-3">
          {progress.steps.map(({ stop, done, current, etaMs }) => (
            <li key={stop.id} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill text-xs font-bold",
                  done
                    ? "bg-fresh/15 text-fresh-600"
                    : current
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : stop.sequence + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      done ? "text-muted line-through" : "text-ink",
                    )}
                  >
                    {stop.name}
                  </span>
                  <Badge tone={stop.kind === "pickup" ? "fresh" : "primary"}>
                    {t(`stopKind.${stop.kind}`)}
                  </Badge>
                </span>
                <span className="block truncate text-xs text-muted">{stop.address}</span>
              </span>
              <span className="shrink-0 text-end text-xs text-muted">
                {done
                  ? t("stopDone")
                  : new Date(etaMs).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Orders on the trip */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">{t("ordersTitle")}</h2>
        <ul className="mt-3 divide-y divide-line">
          {job.orders.map((order) => (
            <li key={order.orderId} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {order.orderNumber} · {order.vendorName}
                </span>
                <span className="block text-xs text-muted">
                  {t("itemsCount", { count: order.itemCount })} · {order.customerName} ·{" "}
                  {t(`payment.${order.paymentMethod}`)}
                </span>
              </span>
              <span className="shrink-0 text-end text-sm font-bold text-ink">
                {order.cashDue > 0
                  ? formatPrice(order.cashDue, currency)
                  : t("prepaid")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {progress.completed === 0 && (
        <button
          type="button"
          onClick={giveBack}
          disabled={submitting}
          className="w-full rounded-pill border border-line py-3 text-sm font-semibold text-body transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
        >
          {t("giveTripBack")}
        </button>
      )}
      {progress.completed > 0 && next && (
        <p className="text-center text-xs text-muted">{t("noReturnAfterPickup")}</p>
      )}

      {handoffStop && (
        <HandoffDialog
          stop={handoffStop}
          currency={job.currency}
          open
          submitting={submitting}
          error={handoffError}
          onClose={() => {
            setHandoffStop(null);
            setHandoffError(null);
          }}
          onConfirm={({ otp, cashCollected }) =>
            advance(handoffStop, otp, cashCollected)
          }
        />
      )}
    </div>
  );
}

/** The one actionable stop: where to go, who to ask for, and the single button. */
function CurrentStop({
  stop,
  job,
  currency,
  submitting,
  onPickup,
  onDeliver,
}: {
  stop: DeliveryStop;
  job: DeliveryJob;
  currency: CurrencyCode;
  submitting: boolean;
  onPickup: () => void;
  onDeliver: () => void;
}) {
  const t = useTranslations("delivery");
  const isPickup = stop.kind === "pickup";
  const order = job.orders.find((o) => o.orderId === stop.orderId);

  return (
    <section className="rounded-card border border-primary/40 bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-pill text-white",
            isPickup ? "bg-fresh" : "bg-primary",
          )}
        >
          {isPickup ? (
            <Store className="size-4.5" aria-hidden />
          ) : (
            <MapPin className="size-4.5" aria-hidden />
          )}
        </span>
        <span className="text-xs font-bold tracking-wide text-primary uppercase">
          {t(isPickup ? "nowCollect" : "nowDeliver")}
        </span>
        <span className="ms-auto text-xs font-semibold text-muted">
          {t("stopOf", { index: stop.sequence + 1, total: job.stops.length })}
        </span>
      </div>

      <h2 className="mt-3 text-h3 text-ink">{stop.name}</h2>
      <p className="text-sm text-body">{stop.address}</p>
      {order && (
        <p className="mt-1 text-xs text-muted">
          {stop.orderNumber} · {t("itemsCount", { count: order.itemCount })}
        </p>
      )}

      {stop.instructions && (
        <p className="mt-3 rounded-field bg-surface-alt p-3 text-sm text-body">
          <span className="font-semibold">{t("noteLabel")}:</span> {stop.instructions}
        </p>
      )}

      {stop.cashDue > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-field bg-accent-50 p-3 text-sm font-semibold text-accent-600">
          <Banknote className="size-4" aria-hidden />
          {t("collectCash", { amount: formatPrice(stop.cashDue, currency) })}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StopAction icon={Navigation} label={t("navigate")} toastKey="navigateStub" />
        <StopAction icon={Phone} label={t("call")} toastKey="callStub" />
        <StopAction icon={MessageSquare} label={t("message")} toastKey="messageStub" />
      </div>

      <button
        type="button"
        onClick={isPickup ? onPickup : onDeliver}
        disabled={submitting}
        className="mt-4 h-13 w-full rounded-pill bg-primary text-base font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
      >
        {isPickup ? (
          t("markCollected")
        ) : (
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4.5" aria-hidden />
            {t("startHandoff")}
          </span>
        )}
      </button>
    </section>
  );
}

/**
 * Navigate / call / message. Stubs, and honest about it: there is no telephony or
 * maps provider wired into the prototype, so each says so rather than opening a
 * dead `tel:` link.
 */
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

/** What the trip earned, once it is done. */
function TripReceipt({ job }: { job: DeliveryJob }) {
  const t = useTranslations("delivery");
  const currency = job.currency as CurrencyCode;

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-fresh/40 bg-fresh/5 p-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-fresh text-white">
          <Check className="size-7" aria-hidden />
        </span>
        <h1 className="mt-3 text-h2 text-ink">{t("tripDoneTitle")}</h1>
        <p className="mt-1 text-sm text-body">
          {t("tripDoneBody", {
            count: job.orders.length,
            distance: formatDistance(job.distanceKm),
          })}
        </p>
        <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
          {formatPrice(job.payout.total, currency)}
        </p>
      </div>

      <PayoutBreakdown
        payout={job.payout}
        cashCollected={job.cashToCollect}
        className="rounded-card border border-line bg-surface p-5"
      />

      <div className="flex flex-wrap gap-3">
        <Button href="/delivery" className="flex-1">
          {t("backToOffers")}
        </Button>
        <Button href="/delivery/wallet" variant="outline" className="flex-1">
          {t("openWallet")}
        </Button>
      </div>
    </div>
  );
}
