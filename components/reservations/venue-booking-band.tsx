import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarCheck, Clock, Users } from "lucide-react";
import { getBookingPolicy } from "@/services/reservations";

/**
 * VenueBookingBand — the "reserve a table" band on a vendor page (Phase C16).
 *
 * Renders nothing for venues that don't take bookings (cloud kitchens and home
 * chefs have no floor), which is why the policy lookup is the gate. Deliberately
 * static: the *facts* about how this venue books are stable, while live times
 * belong on the booking form where they can be asked for a real party size.
 */
export async function VenueBookingBand({
  vendorId,
  vendorName,
  vendorSlug,
}: {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
}) {
  const [policy, t] = await Promise.all([
    getBookingPolicy(vendorId),
    getTranslations("reservations"),
  ]);
  if (!policy) return null;

  return (
    <section className="mt-10 rounded-panel border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-h2 text-ink">
            <CalendarCheck className="size-5 text-primary" aria-hidden />
            {t("bandTitle")}
          </h2>
          <p className="mt-1 text-body">{t("bandBody", { name: vendorName })}</p>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <li className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              {t("upToParty", { count: policy.maxPartySize })}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {t("turnTime", { count: policy.turnMinutes })}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CalendarCheck className="size-4" aria-hidden />
              {policy.autoConfirm ? t("instantBooking") : t("reviewsRequests")}
            </li>
          </ul>
        </div>

        <Link
          href={`/restaurants/${vendorSlug}/book`}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-pill bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-600"
        >
          {t("bookTable")}
        </Link>
      </div>

      {policy.note && <p className="mt-4 text-xs text-muted">{policy.note}</p>}
    </section>
  );
}
