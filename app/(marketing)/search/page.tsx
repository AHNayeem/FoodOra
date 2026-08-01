import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { search, popularSearchTerms, type SearchSort } from "@/services/search";
import { getCategories, getCuisines } from "@/services/catalog";
import { SearchToolbar } from "@/components/search/search-toolbar";
import { SearchFilters, type SearchFacets } from "@/components/search/search-filters";
import { VendorCard } from "@/components/cards/vendor-card";
import { FoodResultCard } from "@/components/cards/food-result-card";
import { AiSearchNote } from "@/components/ai/ai-search-note";
import type { DietaryTag, VendorType } from "@/types";

const VENDOR_TYPES = new Set<VendorType>([
  "restaurant",
  "cafe",
  "cloud-kitchen",
  "home-chef",
  "catering",
]);
const DIETARY = new Set<DietaryTag>([
  "halal",
  "vegetarian",
  "vegan",
  "gluten-free",
  "keto",
  "healthy",
  "spicy",
]);
const SORTS = new Set<SearchSort>([
  "relevance",
  "rating",
  "delivery-time",
  "distance",
  "price-low",
  "price-high",
]);

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const t = await getTranslations("search");
  const q = typeof raw.q === "string" ? raw.q : "";
  return {
    title: q ? t("metaTitleQuery", { query: q }) : t("metaTitle"),
    description: t("metaDescription"),
    // Result pages are query-driven; keep them out of the index.
    robots: { index: false, follow: true },
  };
}

/** Read a single string param, ignoring array duplicates. */
function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Read a repeated param as an array (`?diet=vegan&diet=halal`). */
function many(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

/** Parse a bounded number param; 0 means "not set". */
function num(value: string | string[] | undefined, allowed: number[]): number {
  const parsed = Number(one(value));
  return allowed.includes(parsed) ? parsed : 0;
}

/**
 * Search results (spec: Smart Search). Every facet lives in the query string —
 * parsed and validated here, then handed to the search service, so results are
 * shareable, back-button-safe and rendered on the server. This is the landing
 * page's main funnel: the hero address form, the category rail and the cuisine
 * grid all arrive here.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const t = await getTranslations("search");

  const typeParam = one(raw.type);
  const sortParam = one(raw.sort);
  const facets: SearchFacets = {
    q: one(raw.q),
    category: one(raw.category),
    cuisine: one(raw.cuisine),
    near: one(raw.near),
    type: VENDOR_TYPES.has(typeParam as VendorType) ? (typeParam as VendorType) : "",
    dietary: many(raw.diet).filter((d): d is DietaryTag => DIETARY.has(d as DietaryTag)),
    maxPrice: num(raw.price, [1, 2, 3, 4]),
    minRating: num(raw.rating, [4, 4.5, 4.8]),
    maxEta: num(raw.eta, [30, 45, 60]),
    openNow: one(raw.open) === "1",
    freeDelivery: one(raw.free) === "1",
    offersOnly: one(raw.offers) === "1",
    sort: SORTS.has(sortParam as SearchSort) ? (sortParam as SearchSort) : "relevance",
  };

  const [results, cuisines, categories] = await Promise.all([
    search({
      q: facets.q || undefined,
      category: facets.category || undefined,
      cuisine: facets.cuisine || undefined,
      near: facets.near || undefined,
      type: facets.type || undefined,
      dietary: facets.dietary.length ? facets.dietary : undefined,
      maxPrice: facets.maxPrice || undefined,
      minRating: facets.minRating || undefined,
      maxEta: facets.maxEta || undefined,
      openNow: facets.openNow || undefined,
      freeDelivery: facets.freeDelivery || undefined,
      offersOnly: facets.offersOnly || undefined,
      sort: facets.sort,
    }),
    getCuisines(),
    getCategories(),
  ]);

  const total = results.totalVendors + results.totalFoods;

  // The heading names whatever the user actually asked for.
  const heading = facets.q
    ? t("headingQuery", { query: facets.q })
    : results.category
      ? t("headingCategory", { name: results.category.name })
      : results.cuisine
        ? t("headingCuisine", { name: results.cuisine.name })
        : t("heading");

  return (
    <div className="container-site py-8 md:py-12">
      <header className="mb-6">
        <h1 className="text-h1 text-ink">{heading}</h1>
        <p className="mt-1 text-body">{t("subtitle")}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <SearchFilters facets={facets} cuisines={cuisines} resultCount={total} />

        <div className="min-w-0">
          <SearchToolbar facets={facets} resultCount={total} />

          {/* What the assistant made of a sentence-shaped query (Phase C24) */}
          {facets.q && <AiSearchNote query={facets.q} />}

          {/* Category shortcuts — a second way into the same query space. */}
          <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {categories.map((c) => {
              const active = facets.category === c.slug;
              return (
                <Link
                  key={c.id}
                  href={active ? "/search" : `/search?category=${c.slug}`}
                  className={
                    active
                      ? "inline-flex h-9 shrink-0 items-center rounded-pill border border-primary bg-primary px-3.5 text-sm font-medium text-white"
                      : "inline-flex h-9 shrink-0 items-center rounded-pill border border-line bg-surface px-3.5 text-sm font-medium text-body hover:border-primary hover:text-ink"
                  }
                >
                  <span aria-hidden className="me-1.5">
                    {c.emoji}
                  </span>
                  {c.name}
                </Link>
              );
            })}
          </div>

          {total === 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
              <SearchX className="size-10 text-muted" aria-hidden />
              <p className="text-lg font-semibold text-ink">{t("noResults")}</p>
              <p className="max-w-sm text-body">{t("noResultsHint")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {(results.suggestions.length ? results.suggestions : popularSearchTerms()).map(
                  (term) => (
                    <Link
                      key={term}
                      href={`/search?q=${encodeURIComponent(term)}`}
                      className="inline-flex h-9 items-center rounded-pill border border-line bg-surface px-3.5 text-sm font-medium text-body hover:border-primary hover:text-ink"
                    >
                      {term}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ) : (
            <>
              {results.vendors.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-h3 text-ink">
                    {t("placesHeading", { count: results.totalVendors })}
                  </h2>
                  <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {results.vendors.map((v) => (
                      <VendorCard key={v.id} vendor={v} />
                    ))}
                  </div>
                </section>
              )}

              {results.foods.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-h3 text-ink">
                    {t("dishesHeading", { count: results.totalFoods })}
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {results.foods.map(({ food, vendor }) => (
                      <FoodResultCard key={food.id} item={food} vendor={vendor} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
