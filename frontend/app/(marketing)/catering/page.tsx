import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarX } from "lucide-react";
import { getCateringServices } from "@/frontend/services/catering";
import { isEventType } from "@/frontend/lib/catering";
import type { EventType } from "@/frontend/types";
import { CateringHero } from "@/frontend/components/catering/catering-hero";
import {
  CateringFilters,
  type CateringSortKey,
} from "@/frontend/components/catering/catering-filters";
import { CateringServiceCard } from "@/frontend/components/catering/catering-service-card";
import { HowCateringWorks } from "@/frontend/components/catering/how-catering-works";

const SORTS = new Set<CateringSortKey>(["recommended", "rating", "price-low", "capacity"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catering");
  return { title: t("metaTitle"), description: t("heroSubtitle") };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Catering directory (Phase C17). The URL query string is the source of truth
 * for the event-type / sort / search filters — parsed here, validated, and
 * passed to the catering service, exactly as the restaurant directory does.
 */
export default async function CateringPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const t = await getTranslations("catering");

  const event: EventType | "" =
    typeof raw.event === "string" && isEventType(raw.event) ? raw.event : "";
  const sort =
    typeof raw.sort === "string" && SORTS.has(raw.sort as CateringSortKey)
      ? (raw.sort as CateringSortKey)
      : "recommended";
  const search = typeof raw.q === "string" ? raw.q : "";

  const { items, total } = await getCateringServices({
    eventType: event || undefined,
    search: search || undefined,
    sort,
    pageSize: 100,
  });

  return (
    <div className="pb-16">
      <CateringHero />

      <div className="container-site mt-10 space-y-10">
        <div>
          <CateringFilters event={event} sort={sort} search={search} />

          <p className="mt-6 text-sm font-medium text-muted" aria-live="polite">
            {t("resultsCount", { count: total })}
          </p>

          {items.length > 0 ? (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <CateringServiceCard key={s.id} service={s} />
              ))}
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
              <CalendarX className="size-10 text-muted" aria-hidden />
              <p className="text-lg font-semibold text-ink">{t("noResults")}</p>
              <p className="text-body">{t("noResultsHint")}</p>
            </div>
          )}
        </div>

        <HowCateringWorks />
      </div>
    </div>
  );
}
