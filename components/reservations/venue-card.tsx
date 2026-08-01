"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCheck, Clock, Users } from "lucide-react";
import type { BookingPolicy, Vendor } from "@/types";
import { getNextAvailableTimes } from "@/services/reservations";
import { useReservations } from "@/stores/reservations";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { cn } from "@/lib/utils";
import { useDateLabel } from "./use-date-label";

/**
 * VenueCard — one bookable venue in the directory (Phase C16).
 *
 * The card leads with the thing a person is actually deciding on: *when can I
 * get in*. Those times are real — resolved through the availability engine
 * against the venue's book — so they are fetched on the client after mount
 * rather than server-rendered, because a time computed on the server would be
 * stale the moment it reached the page and would disagree with the grid the
 * booking form draws. Each one deep-links straight into the form with the party,
 * date and time already chosen.
 */
export function VenueCard({
  vendor,
  policy,
  partySize,
  now,
}: {
  vendor: Vendor;
  policy: BookingPolicy;
  partySize: number;
  /** The directory's clock, shared by every card so they agree. */
  now: Date;
}) {
  const t = useTranslations("reservations");
  const dateLabel = useDateLabel(now);
  const extra = useReservations((s) => s.reservations);
  const hydrated = useReservations((s) => s.hydrated);

  // Keyed by the party asked about, so the card is "loading" exactly while what
  // it holds no longer answers the question on screen — no flag to flip.
  const [result, setResult] = useState<{
    key: number;
    times: { date: string; times: string[] } | null;
  } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getNextAvailableTimes({ vendorId: vendor.id, partySize, now, ctx: { extra } }).then(
      (res) => {
        if (active) setResult({ key: partySize, times: res });
      },
    );
    return () => {
      active = false;
    };
  }, [vendor.id, partySize, now, extra, hydrated]);

  const loading = result?.key !== partySize;
  const times = loading ? null : result.times;

  const bookHref = `/restaurants/${vendor.slug}/book?party=${partySize}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-shadow hover:shadow-card-hover">
      <Link href={bookHref} className="group relative block aspect-[16/9] overflow-hidden">
        <Image
          src={vendor.cover}
          alt={vendor.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105"
        />
        <Badge
          tone={policy.autoConfirm ? "primary" : "neutral"}
          className="absolute start-3 top-3 bg-surface/95 shadow-sm backdrop-blur"
        >
          {policy.autoConfirm ? t("instantBooking") : t("reviewsRequests")}
        </Badge>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-extrabold text-ink">
            <Link href={bookHref} className="hover:text-primary">
              {vendor.name}
            </Link>
          </h3>
          <Rating value={vendor.rating} count={vendor.reviewCount} className="shrink-0" />
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-body">{vendor.tagline}</p>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          <li className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden />
            {t("upToParty", { count: policy.maxPartySize })}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden />
            {t("turnTime", { count: policy.turnMinutes })}
          </li>
          {policy.depositPerGuest > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <CheckCheck className="size-3.5" aria-hidden />
              {t("depositFrom", { count: policy.depositFrom })}
            </li>
          )}
        </ul>

        {/* Live availability — the reason to book here rather than walk in. */}
        <div className="mt-auto pt-4">
          {loading ? (
            <p className="text-xs text-muted">{t("checking")}</p>
          ) : times ? (
            <>
              <p className="text-xs font-semibold text-muted">
                {t("nextAvailable")} · {dateLabel(times.date)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {times.times.map((time) => (
                  <Link
                    key={time}
                    href={`${bookHref}&date=${times.date}&time=${time}`}
                    className="rounded-field border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    {time}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted">{t("noTimesSoon")}</p>
          )}

          <Link
            href={bookHref}
            className={cn(
              "mt-3 inline-flex h-11 w-full items-center justify-center rounded-pill border border-line px-4",
              "text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary",
            )}
          >
            {t("checkAvailability")}
          </Link>
        </div>
      </div>
    </article>
  );
}
