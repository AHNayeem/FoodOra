"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Bike,
  ChevronRight,
  Navigation,
  RefreshCw,
  Route,
  Star,
  Wallet,
  Zap,
} from "lucide-react";
import type { DeliveryJob } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useAuth } from "@/stores/auth";
import { useRider } from "@/stores/rider";
import {
  acceptJob,
  declineJob,
  getJobOffers,
  getRiderDay,
  OFFER_REFRESH_MS,
  type RiderDay,
} from "@/services/delivery";
import { formatDistance, formatPrice, formatRating } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { useRiderApp } from "./rider-context";
import { useRiderRecords } from "./use-rider-records";
import { OfferCard } from "./offer-card";
import { LiveDeliveries } from "./live-deliveries";

/** Countdown tick for the offer cards. */
const TICK_MS = 1000;

/**
 * TodayView — `/delivery`, the screen a rider lives on (Phase C18).
 *
 * One question at the top ("am I on shift?"), then what today has paid, then the
 * trips on offer. A trip in progress takes over the screen, because a rider with
 * food in their bag has exactly one job and the app should not pretend otherwise.
 *
 * Offers only exist while the rider is on shift and not already on a trip — that
 * is enforced in the seam, so this screen states the reason rather than hiding an
 * empty list.
 */
export function TodayView() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const { rider, zone } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const user = useAuth((s) => s.user);
  const shiftStartedAt = useRider((s) => s.shiftStartedAt);
  const setOnline = useRider((s) => s.setOnline);
  const setActiveJob = useRider((s) => s.setActiveJob);
  const decline = useRider((s) => s.decline);

  // One reading of this rider's reality — real orders included — shared with
  // every other screen (see `use-rider-records`).
  const { ctx, hydrated, online, activeJob, activeOrder, busy } = useRiderRecords();

  const [tick, setTick] = useState(() => Date.now());
  const [day, setDay] = useState<RiderDay | null>(null);
  const [offers, setOffers] = useState<DeliveryJob[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // One clock for the whole screen, so every countdown moves together.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Today's figures: re-read whenever this device's own records change.
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getRiderDay({ riderId: rider.id, now: Date.now(), ctx }).then((data) => {
      if (active) setDay(data);
    });
    return () => {
      active = false;
    };
  }, [rider.id, ctx, hydrated]);

  // The offer pool, on the cadence the seam publishes (plus manual refresh).
  const pool = Math.floor(tick / OFFER_REFRESH_MS);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getJobOffers({
      riderId: rider.id,
      now: Date.now(),
      online,
      // Either kind of work in hand pauses the pool. Before this, a rider
      // carrying a real customer's order was still offered synthesised trips.
      busy,
      ctx,
    }).then((list) => {
      if (active) setOffers(list);
    });
    return () => {
      active = false;
    };
  }, [rider.id, online, busy, ctx, hydrated, pool, nonce]);

  const handleAccept = useCallback(
    (job: DeliveryJob) => {
      setBusyId(job.id);
      acceptJob({
        job,
        riderId: rider.id,
        now: Date.now(),
        online,
        busy,
      }).then((res) => {
        setBusyId(null);
        if (res.error || !res.data) {
          toast.error(t(res.error ?? "errors.generic"));
          setNonce((n) => n + 1);
          return;
        }
        setActiveJob(res.data);
        toast.success(t("tripAccepted", { number: res.data.jobNumber }));
        router.push(`/delivery/trip/${res.data.id}`);
      });
    },
    [rider.id, online, busy, setActiveJob, router, t],
  );

  const handleDecline = useCallback(
    (job: DeliveryJob) => {
      setBusyId(job.id);
      declineJob(job).then(() => {
        setBusyId(null);
        decline(job.id);
        toast.success(t("offerDeclined"));
      });
    },
    [decline, t],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const cash = day?.cash;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-ink">
          {t("greeting", { name: (user?.name ?? rider.name).split(" ")[0] })}
        </h1>
        <p className="text-sm text-muted">
          {online && shiftStartedAt
            ? t("onlineSince", {
                time: new Date(shiftStartedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t("offShiftHint")}
        </p>
      </div>

      {/* Off shift: nothing else on this screen matters yet. */}
      {!online && !busy && (
        <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-primary/10 text-primary">
            <Zap className="size-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-h3 text-ink">{t("goOnlineTitle")}</h2>
          <p className="mt-1 text-sm text-body">{t("goOnlineBody", { zone: zone.name })}</p>
          <Button
            className="mt-4"
            onClick={() => {
              setOnline(true, new Date().toISOString());
              toast.success(t("nowOnline"));
            }}
          >
            {t("goOnline")}
          </Button>
        </section>
      )}

      {/* A trip in progress owns the screen. */}
      {activeJob && <ActiveTripCard job={activeJob} />}

      {/* Real customer orders waiting on a courier. These sit above the
          synthesised offer pool because they are the live flow: taking one
          names this rider on the customer's tracker. */}
      <LiveDeliveries />

      {/* Cash the rider is carrying, once it matters. */}
      {cash && cash.overLimit && (
        <Link
          href="/delivery/wallet"
          className="flex items-center gap-3 rounded-card border border-danger/40 bg-danger/5 p-4 text-start"
        >
          <Banknote className="size-5 shrink-0 text-danger" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-danger">
              {t("cashLimitTitle")}
            </span>
            <span className="block text-xs text-body">
              {t("cashLimitBody", {
                amount: formatPrice(cash.inHand, currency),
                limit: formatPrice(cash.limit, currency),
              })}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-danger rtl:rotate-180" aria-hidden />
        </Link>
      )}

      {/* Today */}
      <section>
        <h2 className="mb-3 text-h3 text-ink">{t("todayTitle")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t("statEarnings")}
            value={formatPrice(day?.today.earnings ?? 0, currency)}
            icon={Wallet}
            hint={t("tripsCount", { count: day?.today.trips ?? 0 })}
          />
          <StatCard
            label={t("statDeliveries")}
            value={String(day?.today.deliveries ?? 0)}
            icon={Bike}
            hint={t("statDeliveriesHint")}
          />
          <StatCard
            label={t("statDistance")}
            value={formatDistance(day?.today.distanceKm ?? 0)}
            icon={Route}
            hint={t("statDistanceHint")}
          />
          <StatCard
            label={t("statCash")}
            value={formatPrice(cash?.inHand ?? 0, currency)}
            icon={Banknote}
            hint={t("statCashHint", {
              limit: formatPrice(cash?.limit ?? zone.cashLimit, currency),
            })}
          />
        </div>
        <div className="mt-3 flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <Star className="size-3.5 text-accent-500" aria-hidden />
            {formatRating(day?.rating ?? rider.rating)}
          </span>
          <span>{t("lifetimeTrips", { count: day?.lifetimeTrips ?? rider.trips })}</span>
          <span>
            {t("acceptanceRate", {
              percent: Math.round((day?.acceptance ?? rider.acceptanceRate) * 100),
            })}
          </span>
        </div>
      </section>

      {/* Offers */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-h3 text-ink">{t("offersTitle")}</h2>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <RefreshCw className="size-4" aria-hidden />
            {t("refresh")}
          </button>
        </div>

        {busy ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-body">
            {t(activeOrder && !activeJob ? "offersPausedOrder" : "offersPausedTrip")}
          </p>
        ) : !online ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-body">
            {t("offersPausedOffline")}
          </p>
        ) : offers === null ? (
          <div className="flex min-h-32 items-center justify-center">
            <div className="size-7 animate-spin rounded-full border-2 border-line border-t-primary" />
          </div>
        ) : offers.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-body">
            {t("offersEmpty", { zone: zone.name })}
          </p>
        ) : (
          <ul className="space-y-3">
            {offers.map((job) => (
              <OfferCard
                key={job.id}
                job={job}
                now={tick}
                busy={busyId === job.id}
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Today's completed trips */}
      {day && day.trips.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-h3 text-ink">{t("doneTodayTitle")}</h2>
            <Link
              href="/delivery/history"
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t("viewAll")}
            </Link>
          </div>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {day.trips.slice(0, 4).map((job) => (
              <li key={job.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-fresh/10 text-fresh-600">
                  <Bike className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {job.orders.map((o) => o.vendorName).join(" + ")}
                  </span>
                  <span className="block text-xs text-muted">
                    {job.jobNumber} · {formatDistance(job.distanceKm)}
                  </span>
                </span>
                <span className="text-sm font-bold text-ink">
                  {formatPrice(job.payout.total, currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The live trip, promoted to the top of the home screen. */
function ActiveTripCard({ job }: { job: DeliveryJob }) {
  const t = useTranslations("delivery");
  const currency = job.currency as CurrencyCode;
  const done = job.completedStopIds.length;

  return (
    <Link
      href={`/delivery/trip/${job.id}`}
      className="block rounded-card border border-primary/40 bg-primary/5 p-4 shadow-card"
    >
      <div className="flex items-center gap-2">
        <span className="relative inline-flex size-2.5">
          <span className="absolute inset-0 rounded-pill bg-primary motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-pill bg-primary" />
        </span>
        <span className="text-xs font-bold tracking-wide text-primary uppercase">
          {t("tripLive")}
        </span>
        <span className="ms-auto text-xs font-semibold text-muted">{job.jobNumber}</span>
      </div>
      <p className="mt-2 font-bold text-ink">
        {job.orders.map((o) => o.vendorName).join(" + ")}
      </p>
      <p className="text-sm text-body">
        {t("stopsProgress", { done, total: job.stops.length })} ·{" "}
        {formatPrice(job.payout.total, currency)}
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
        <Navigation className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("continueTrip")}
      </span>
    </Link>
  );
}
