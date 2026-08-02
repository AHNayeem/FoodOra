import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { BookingPolicy } from "@/frontend/types";
import { getBookableVenues, getBookingPolicy } from "@/frontend/services/reservations";
import {
  HowBookingWorks,
  ReservationsHero,
} from "@/frontend/components/reservations/reservations-hero";
import {
  VenueDirectory,
  type VenueSortKey,
} from "@/frontend/components/reservations/venue-directory";

const SORTS = new Set<VenueSortKey>(["recommended", "rating", "price-low", "party-large"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reservations");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Table-booking directory (Phase C16). The URL query string is the source of
 * truth for party / sort / search, parsed and validated here. Party size is
 * more than a filter — it is fed to each card so the availability it shows is
 * for the party you actually asked about.
 */
export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;

  const parsedParty = Number(typeof raw.party === "string" ? raw.party : "2");
  const partySize =
    Number.isFinite(parsedParty) && parsedParty >= 1 && parsedParty <= 20
      ? Math.floor(parsedParty)
      : 2;
  const sort =
    typeof raw.sort === "string" && SORTS.has(raw.sort as VenueSortKey)
      ? (raw.sort as VenueSortKey)
      : "recommended";
  const search = typeof raw.q === "string" ? raw.q : "";

  const { items } = await getBookableVenues({
    partySize,
    search: search || undefined,
    sort,
    pageSize: 50,
  });

  // Policies drive every card's facts, so resolve them once here rather than
  // having each card ask the seam again on the client.
  const resolved = await Promise.all(items.map((v) => getBookingPolicy(v.id)));
  const policies: Record<string, BookingPolicy> = {};
  items.forEach((venue, index) => {
    const policy = resolved[index];
    if (policy) policies[venue.id] = policy;
  });

  return (
    <div className="pb-16">
      <ReservationsHero />

      <div className="container-site mt-10 space-y-12">
        <VenueDirectory
          venues={items}
          policies={policies}
          partySize={partySize}
          sort={sort}
          search={search}
        />
        <HowBookingWorks />
      </div>
    </div>
  );
}
