"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import type { BookingPolicy } from "@/types";
import { useReservations } from "@/stores/reservations";
import { isUpcoming, sortPast, sortUpcoming } from "@/lib/reservations";
import { ReservationCard } from "./reservation-card";

/**
 * ReservationsView — `/account/reservations` (Phase C16).
 *
 * Splits the guest's bookings into what is still ahead and what is behind,
 * using the derived status rather than a stored one, so a table that has simply
 * been and gone moves itself into the past. `?new=` highlights the booking just
 * made, which is how the confirmation page hands off to this list.
 */
export function ReservationsView({
  policies,
}: {
  /** Cancel cutoffs per venue id, resolved server-side through the seam. */
  policies: Record<string, BookingPolicy>;
}) {
  const t = useTranslations("reservations");
  const params = useSearchParams();
  const highlightId = params.get("new");

  const reservations = useReservations((s) => s.reservations);
  const hydrated = useReservations((s) => s.hydrated);

  useEffect(() => {
    useReservations.persist.rehydrate();
  }, []);

  // One clock for the whole list, so two cards can never disagree about
  // whether the same evening has passed.
  const [now] = useState(() => new Date());

  const { upcoming, past } = useMemo(() => {
    const live = reservations.filter((r) => isUpcoming(r, now));
    const done = reservations.filter((r) => !isUpcoming(r, now));
    return { upcoming: sortUpcoming(live), past: sortPast(done) };
  }, [reservations, now]);

  if (!hydrated) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const cutoffFor = (venueId: string) => policies[venueId]?.cancelCutoffHours ?? 2;

  return (
    <div>
      <h1 className="text-h1 text-ink">{t("accountTitle")}</h1>
      <p className="mt-1 text-body">{t("accountSubtitle")}</p>

      {reservations.length === 0 ? (
        <div className="mt-8 rounded-panel border border-line bg-surface p-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <CalendarClock className="size-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-h3 text-ink">{t("emptyTitle")}</h2>
          <p className="mt-1 text-body">{t("emptyBody")}</p>
          <Link
            href="/reservations"
            className="mt-5 inline-flex h-12 items-center justify-center rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
          >
            {t("findTable")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-h3 text-ink">{t("upcoming")}</h2>
              <div className="mt-4 space-y-4">
                {upcoming.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    now={now}
                    cancelCutoffHours={cutoffFor(reservation.venue.id)}
                    highlighted={reservation.id === highlightId}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-h3 text-ink">{t("past")}</h2>
              <div className="mt-4 space-y-4">
                {past.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    now={now}
                    cancelCutoffHours={cutoffFor(reservation.venue.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
