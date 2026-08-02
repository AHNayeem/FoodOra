import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBookingPolicies } from "@/frontend/services/reservations";
import { BookingConfirmation } from "@/frontend/components/reservations/booking-confirmation";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reservations");
  // A booking exists only in the guest's own browser — never indexable.
  return { title: t("confirmedTitle"), robots: { index: false } };
}

/**
 * Booking confirmation / status (Phase C16). The booking itself lives in the
 * persisted store on the guest's device, so the page resolves it client-side;
 * all the server contributes are the venue policies needed to state the
 * cancellation window.
 */
export default async function ReservationPage({ params }: { params: Params }) {
  const [{ id }, policies] = await Promise.all([params, getBookingPolicies()]);
  return <BookingConfirmation id={id} policies={policies} />;
}
