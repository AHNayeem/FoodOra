import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getBookableVenueSlugs, getVenueBooking } from "@/frontend/services/reservations";
import { BookingForm } from "@/frontend/components/reservations/booking-form";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** Prerender the booking page for every venue that takes bookings. */
export function generateStaticParams() {
  return getBookableVenueSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [booking, t] = await Promise.all([
    getVenueBooking(slug),
    getTranslations("reservations"),
  ]);
  if (!booking) return {};
  return {
    title: t("bookTitle", { name: booking.vendor.name }),
    // The form is per-guest and query-driven — nothing to index.
    robots: { index: false },
  };
}

/**
 * Table booking for one venue (Phase C16). Resolves the venue and its booking
 * policy server-side, 404s for venues that take no bookings, and hands the form
 * the party/date/time the directory's quick-book links may have chosen. The
 * grid itself is client-side: availability has to be derived against a clock,
 * and only the client has one that won't be stale by the time it is seen.
 */
export default async function BookTablePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const booking = await getVenueBooking(slug);
  if (!booking) notFound();

  const parsedParty = Number(typeof raw.party === "string" ? raw.party : "2");
  const initialParty = Number.isFinite(parsedParty) && parsedParty >= 1 ? Math.floor(parsedParty) : 2;
  const initialDate =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  const initialTime =
    typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : null;

  return (
    <BookingForm
      vendor={booking.vendor}
      policy={booking.policy}
      initialParty={initialParty}
      initialDate={initialDate}
      initialTime={initialTime}
    />
  );
}
