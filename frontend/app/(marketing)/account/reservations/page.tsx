import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBookingPolicies } from "@/frontend/services/reservations";
import { ReservationsView } from "@/frontend/components/reservations/reservations-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("nav.reservations"), robots: { index: false } };
}

/**
 * Table bookings (Phase C16). Reads the persisted reservations store and lets
 * the guest cancel within the venue's window. Suspense wraps the view because
 * it reads `?new=` from the URL to highlight a booking just made.
 */
export default async function AccountReservationsPage() {
  const policies = await getBookingPolicies();
  return (
    <Suspense fallback={null}>
      <ReservationsView policies={policies} />
    </Suspense>
  );
}
