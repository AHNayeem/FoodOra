"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Clock3, MapPin, Table2, Users } from "lucide-react";
import type { BookingPolicy } from "@/frontend/types";
import { useReservations } from "@/frontend/stores/reservations";
import { effectiveReservationStatus, reservationTimeRange } from "@/frontend/lib/reservations";
import { Badge } from "@/frontend/components/ui/badge";
import { useDateLabel } from "./use-date-label";

/**
 * BookingConfirmation — `/reservations/[id]` (Phase C16).
 *
 * Reads the booking back out of the store the form committed it to, and says
 * plainly which of the two things happened: the table is confirmed, or the
 * request is with the venue. A booking made in another browser genuinely does
 * not exist here, and the page says so rather than pretending to look it up.
 */
export function BookingConfirmation({
  id,
  policies,
}: {
  id: string;
  /** Cancel cutoffs per venue id, resolved server-side through the seam. */
  policies: Record<string, BookingPolicy>;
}) {
  const t = useTranslations("reservations");
  const reservations = useReservations((s) => s.reservations);
  const hydrated = useReservations((s) => s.hydrated);

  useEffect(() => {
    useReservations.persist.rehydrate();
  }, []);

  const [now] = useState(() => new Date());
  const dateLabel = useDateLabel(now);

  if (!hydrated) {
    return (
      <div className="container-site flex min-h-[50vh] items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const reservation = reservations.find((r) => r.id === id);
  if (!reservation) {
    return (
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
          <CalendarClock className="size-7" aria-hidden />
        </span>
        <h1 className="text-h2 text-ink">{t("notFoundTitle")}</h1>
        <p className="max-w-md text-body">{t("notFoundBody")}</p>
        <Link
          href="/reservations"
          className="mt-2 inline-flex h-12 items-center justify-center rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
        >
          {t("findTable")}
        </Link>
      </div>
    );
  }

  const status = effectiveReservationStatus(reservation, now);
  const pending = status === "pending";
  const cutoff = policies[reservation.venue.id]?.cancelCutoffHours ?? 2;

  return (
    <div className="container-site max-w-3xl py-10">
      <div className="text-center">
        <span
          className={`inline-flex size-16 items-center justify-center rounded-pill ${
            pending ? "bg-accent-50 text-accent-600" : "bg-fresh-50 text-fresh-600"
          }`}
        >
          {pending ? (
            <Clock3 className="size-8" aria-hidden />
          ) : (
            <CheckCircle2 className="size-8" aria-hidden />
          )}
        </span>
        <h1 className="mt-4 text-h1 text-ink">
          {t(pending ? "pendingTitle" : "confirmedTitle")}
        </h1>
        <p className="mt-1 text-body">
          {t(pending ? "pendingBody" : "confirmedBody", { name: reservation.venue.name })}
        </p>
        <p className="mt-3 text-sm text-muted">
          {t("referenceLabel")}{" "}
          <span className="font-bold text-ink">{reservation.reference}</span>
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-panel border border-line bg-surface">
        <div className="relative h-40">
          <Image
            src={reservation.venue.image}
            alt={reservation.venue.name}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
          <Badge tone={pending ? "accent" : "fresh"} className="absolute end-4 top-4 shadow-sm">
            {t(`status.${status}`)}
          </Badge>
        </div>

        <div className="p-6">
          <h2 className="text-h3 text-ink">{reservation.venue.name}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {reservation.venue.address}
          </p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Fact icon={CalendarClock} label={t("summaryDate")}>
              {dateLabel(reservation.date, { relative: false })}
            </Fact>
            <Fact icon={Clock3} label={t("summaryTime")}>
              {reservationTimeRange(reservation)}
            </Fact>
            <Fact icon={Users} label={t("summaryParty")}>
              {t("guests", { count: reservation.partySize })}
            </Fact>
            <Fact icon={Table2} label={t("summaryZone")}>
              {t(`zone.${reservation.zone}`)} ·{" "}
              {reservation.tableLabels.length > 1
                ? t("tablesLabel", { labels: reservation.tableLabels.join(" + ") })
                : t("tableLabel", { labels: reservation.tableLabels.join("") })}
            </Fact>
          </dl>

          {reservation.notes && (
            <p className="mt-5 rounded-field bg-surface-muted p-3 text-sm text-body">
              <span className="font-semibold">{t("book.noteLabel")}:</span> {reservation.notes}
            </p>
          )}

          <p className="mt-5 text-xs text-muted">{t("cutoffNote", { count: cutoff })}</p>
          <p className="mt-1 text-xs text-muted">{t("noChargeNote")}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/account/reservations"
              className="inline-flex h-12 items-center justify-center rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
            >
              {t("viewAllBookings")}
            </Link>
            <Link
              href={`/restaurants/${reservation.venue.slug}`}
              className="inline-flex h-12 items-center justify-center rounded-pill border border-line px-6 font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
            >
              {t("viewVenue")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock3;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-field border border-line p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 font-bold text-ink">{children}</dd>
    </div>
  );
}
