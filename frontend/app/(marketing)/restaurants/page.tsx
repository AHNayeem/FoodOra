import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { getVendors } from "@/frontend/services/catalog";
import { VendorFilters, type SortKey } from "@/frontend/components/filters/vendor-filters";
import { VendorCard } from "@/frontend/components/cards/vendor-card";
import type { VendorType } from "@/frontend/types";

const VENDOR_TYPES = new Set<VendorType>([
  "restaurant",
  "cafe",
  "cloud-kitchen",
  "home-chef",
  "catering",
]);
const SORTS = new Set<SortKey>(["recommended", "rating", "delivery-time", "distance"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("directory");
  return { title: t("title"), description: t("subtitle") };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Restaurant Directory (Phase C4). The URL query string is the single source of
 * truth for filters — parsed here, validated, and passed to the catalog
 * service. `searchParams` opts the route into dynamic rendering, exactly as a
 * live search endpoint would behave.
 */
export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const t = await getTranslations("directory");

  const type =
    typeof raw.type === "string" && VENDOR_TYPES.has(raw.type as VendorType)
      ? (raw.type as VendorType)
      : "";
  const sort =
    typeof raw.sort === "string" && SORTS.has(raw.sort as SortKey)
      ? (raw.sort as SortKey)
      : "recommended";
  const openNow = raw.open === "1";
  const search = typeof raw.q === "string" ? raw.q : "";

  const { items, total } = await getVendors({
    type: type || undefined,
    openNow: openNow || undefined,
    search: search || undefined,
    sort,
    pageSize: 100,
  });

  return (
    <div className="container-site py-8 md:py-12">
      <header className="mb-6">
        <h1 className="text-h1 text-ink">{t("title")}</h1>
        <p className="mt-1 text-body">{t("subtitle")}</p>
      </header>

      <VendorFilters type={type} sort={sort} openNow={openNow} search={search} />

      <p className="mt-6 text-sm font-medium text-muted" aria-live="polite">
        {t("resultsCount", { count: total })}
      </p>

      {items.length > 0 ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
          <SearchX className="size-10 text-muted" aria-hidden />
          <p className="text-lg font-semibold text-ink">{t("noResults")}</p>
          <p className="text-body">{t("noResultsHint")}</p>
        </div>
      )}
    </div>
  );
}
