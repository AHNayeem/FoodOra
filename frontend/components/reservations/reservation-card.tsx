"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Clock, MapPin, Table2, Users } from "lucide-react";
import type { Reservation, ReservationStatus } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useReservations } from "@/frontend/stores/reservations";
import { cancelReservation } from "@/frontend/services/reservations";
import {
  canCancelReservation,
  effectiveReservationStatus,
  reservationTimeRange,
} from "@/frontend/lib/reservations";
import { formatPrice } from "@/frontend/lib/format";
import { Badge } from "@/frontend/components/ui/badge";
import { Modal } from "@/frontend/components/ui/modal";
import { cn } from "@/frontend/lib/utils";
import { useDateLabel } from "./use-date-label";

/** Badge tone per derived status. */
const TONE: Record<ReservationStatus, "primary" | "accent" | "fresh" | "neutral" | "danger"> = {
  pending: "accent",
  confirmed: "fresh",
  seated: "primary",
  completed: "neutral",
  cancelled: "neutral",
  "no-show": "danger",
};

/**
 * ReservationCard — one booking on the account page (Phase C16).
 *
 * The status shown is the *derived* one: a table whose sitting has finished
 * reads as completed and one that was never seated reads as missed, without
 * anything having swept the book. Cancelling goes through the seam, which
 * refuses it past the venue's cutoff regardless of whether the button was
 * rendered — the card only decides whether to *offer* it.
 */
export function ReservationCard({
  reservation,
  now,
  cancelCutoffHours,
  highlighted = false,
}: {
  reservation: Reservation;
  /** The list's clock, shared by every card so their statuses agree. */
  now: Date;
  /** The venue's free-cancellation window, from its policy. */
  cancelCutoffHours: number;
  highlighted?: boolean;
}) {
  const t = useTranslations("reservations");
  const dateLabel = useDateLabel(now);
  const replace = useReservations((s) => s.replace);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const status = effectiveReservationStatus(reservation, now);
  const canCancel = canCancelReservation(reservation, now, cancelCutoffHours);
  const isLive = status === "pending" || status === "confirmed" || status === "seated";
  const currency = reservation.currency as CurrencyCode;

  function handleCancel() {
    setBusy(true);
    cancelReservation(reservation, new Date()).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "errors.generic"));
        return;
      }
      replace(res.data);
      setConfirming(false);
      toast.success(t("cancelledToast"));
    });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-panel border bg-surface transition-colors",
        highlighted ? "border-primary shadow-card" : "border-line",
        !isLive && "opacity-90",
      )}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative hidden size-24 shrink-0 overflow-hidden rounded-field sm:block">
          <Image
            src={reservation.venue.image}
            alt={reservation.venue.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-extrabold text-ink">
                <Link
                  href={`/restaurants/${reservation.venue.slug}`}
                  className="hover:text-primary"
                >
                  {reservation.venue.name}
                </Link>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {t("referenceLabel")} · {reservation.reference}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {highlighted && <Badge tone="primary">{t("newBadge")}</Badge>}
              <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Fact icon={CalendarDays} label={t("summaryDate")}>
              {dateLabel(reservation.date)}
            </Fact>
            <Fact icon={Clock} label={t("summaryTime")}>
              {reservationTimeRange(reservation)}
            </Fact>
            <Fact icon={Users} label={t("summaryParty")}>
              {t("guests", { count: reservation.partySize })}
            </Fact>
            <Fact icon={Table2} label={t("summaryZone")}>
              {t(`zone.${reservation.zone}`)}
              <span className="ms-1 text-muted">
                (
                {reservation.tableLabels.length > 1
                  ? t("tablesLabel", { labels: reservation.tableLabels.join(" + ") })
                  : t("tableLabel", { labels: reservation.tableLabels.join("") })}
                )
              </span>
            </Fact>
          </dl>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {reservation.venue.address}
          </p>

          {reservation.occasion !== "none" && (
            <p className="mt-2 text-xs text-body">
              {t("occasionTitle")} {t(`occasion.${reservation.occasion}`)}
            </p>
          )}
          {reservation.notes && (
            <p className="mt-1 text-xs text-body">
              <span className="font-semibold">{t("book.noteLabel")}:</span> {reservation.notes}
            </p>
          )}
          {reservation.depositAmount > 0 && (
            <p className="mt-1 text-xs text-body">
              {t("book.depositHeld", {
                amount: formatPrice(reservation.depositAmount, currency),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-alt px-4 py-3 sm:px-5">
        {isLive ? (
          canCancel ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-danger hover:text-danger"
              >
                {t("cancelBooking")}
              </button>
              <p className="text-xs text-muted">
                {t("cutoffNote", { count: cancelCutoffHours })}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">{t("cutoffPassed")}</p>
          )
        ) : (
          <Link
            href={`/restaurants/${reservation.venue.slug}/book?party=${reservation.partySize}`}
            className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
          >
            {t("bookAgain")}
          </Link>
        )}
        <Link
          href={`/restaurants/${reservation.venue.slug}`}
          className="ms-auto text-sm font-semibold text-primary hover:underline"
        >
          {t("viewVenue")}
        </Link>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        labelledBy={`cancel-${reservation.id}`}
        className="w-full max-w-md p-6"
      >
        <h2 id={`cancel-${reservation.id}`} className="text-h3 text-ink">
          {t("cancelTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("cancelBody", {
            name: reservation.venue.name,
            date: dateLabel(reservation.date),
            time: reservation.time,
          })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            {t("keepIt")}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="rounded-pill bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t("cancelling") : t("cancelBooking")}
          </button>
        </div>
      </Modal>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-ink">{children}</dd>
    </div>
  );
}
