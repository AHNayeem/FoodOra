"use client";

import { useTranslations } from "next-intl";
import { Banknote, Layers, MapPin, Route, Store, Timer } from "lucide-react";
import type { DeliveryJob } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { isBatch, offerSecondsLeft } from "@/frontend/lib/delivery";
import { formatDistance, formatPrice } from "@/frontend/lib/format";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/frontend/lib/utils";

/**
 * OfferCard — one trip on offer (Phase C18).
 *
 * Written to answer the only four questions a rider has before their thumb moves:
 * what does it pay, how far is it, how many drops, and is there cash to carry.
 * The countdown is a bar rather than a spinner so it is readable at a glance in
 * sunlight, and it turns urgent in the last thirty seconds.
 */
export function OfferCard({
  job,
  now,
  busy,
  onAccept,
  onDecline,
}: {
  job: DeliveryJob;
  /** Ticking clock from the parent, so every card counts down in step. */
  now: number;
  /** An accept/decline is in flight for this card. */
  busy: boolean;
  onAccept: (job: DeliveryJob) => void;
  onDecline: (job: DeliveryJob) => void;
}) {
  const t = useTranslations("delivery");
  const currency = job.currency as CurrencyCode;

  const secondsLeft = offerSecondsLeft(job, now);
  const urgent = secondsLeft <= 30;
  // Read the offer's own window rather than repeating the seam's TTL here, so
  // the bar still empties exactly at expiry if that rule ever changes.
  const totalSeconds = Math.max(
    1,
    (Date.parse(job.expiresAt) - Date.parse(job.offeredAt)) / 1000,
  );
  const pickups = job.stops.filter((s) => s.kind === "pickup");
  const drops = job.stops.filter((s) => s.kind === "dropoff");

  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Countdown */}
      <div className="h-1 w-full bg-line">
        <div
          className={cn(
            "h-full transition-[width] duration-1000 ease-linear",
            urgent ? "bg-danger" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, (secondsLeft / totalSeconds) * 100)}%` }}
        />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-extrabold tracking-tight text-ink">
              {formatPrice(job.payout.total, currency)}
            </p>
            <p className="text-xs text-muted">
              {t("offerPayoutHint", {
                base: formatPrice(job.payout.baseFare + job.payout.distanceFee, currency),
                tip: formatPrice(job.payout.tip, currency),
              })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {isBatch(job) && (
              <Badge tone="primary">
                <Layers className="size-3" aria-hidden />
                {t("batchOf", { count: job.orders.length })}
              </Badge>
            )}
            {job.payout.peakBonus > 0 && <Badge tone="accent">{t("peakPay")}</Badge>}
            {job.cashToCollect > 0 && (
              <Badge tone="neutral">
                <Banknote className="size-3" aria-hidden />
                {formatPrice(job.cashToCollect, currency)}
              </Badge>
            )}
          </div>
        </div>

        {/* Route summary */}
        <div className="mt-3 space-y-2">
          {pickups.map((stop) => (
            <p key={stop.id} className="flex items-start gap-2 text-sm text-ink">
              <Store className="mt-0.5 size-4 shrink-0 text-fresh-600" aria-hidden />
              <span className="min-w-0">
                <span className="font-semibold">{stop.name}</span>
                <span className="text-muted"> · {stop.area}</span>
              </span>
            </p>
          ))}
          {drops.map((stop) => (
            <p key={stop.id} className="flex items-start gap-2 text-sm text-ink">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="font-semibold">{stop.area}</span>
                <span className="text-muted"> · {stop.address}</span>
              </span>
            </p>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Route className="size-3.5" aria-hidden />
            {formatDistance(job.distanceKm)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-3.5" aria-hidden />
            {t("minutes", { count: job.estimatedMinutes })}
          </span>
          <span className={cn("font-semibold", urgent ? "text-danger" : "text-muted")}>
            {t("expiresIn", { seconds: secondsLeft })}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onAccept(job)}
            disabled={busy}
            className="h-11 flex-1 rounded-pill bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {t("accept")}
          </button>
          <button
            type="button"
            onClick={() => onDecline(job)}
            disabled={busy}
            className="h-11 rounded-pill border border-line px-5 text-sm font-semibold text-body transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
          >
            {t("decline")}
          </button>
        </div>
      </div>
    </li>
  );
}
