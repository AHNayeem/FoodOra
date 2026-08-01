"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import type { Cuisine, DietaryTag, VendorType } from "@/types";
import type { SearchSort } from "@/services/search";
import { cn } from "@/lib/utils";

/** The facet state the results page keeps in the URL. */
export interface SearchFacets {
  q: string;
  category: string;
  cuisine: string;
  near: string;
  type: VendorType | "";
  dietary: DietaryTag[];
  maxPrice: number;
  minRating: number;
  maxEta: number;
  openNow: boolean;
  freeDelivery: boolean;
  offersOnly: boolean;
  sort: SearchSort;
}

export const SEARCH_SORTS: SearchSort[] = [
  "relevance",
  "rating",
  "delivery-time",
  "distance",
  "price-low",
  "price-high",
];

const VENDOR_TYPES: VendorType[] = [
  "restaurant",
  "cafe",
  "cloud-kitchen",
  "home-chef",
  "catering",
];

const DIETARY: DietaryTag[] = [
  "halal",
  "vegetarian",
  "vegan",
  "gluten-free",
  "keto",
  "healthy",
  "spicy",
];

const RATINGS = [4.8, 4.5, 4.0];
const ETAS = [30, 45, 60];

/**
 * Build the query string for a set of facets. Defaults are omitted so shared
 * URLs stay short and the canonical `/search` has no noise.
 */
export function facetsToQuery(f: SearchFacets): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.category) p.set("category", f.category);
  if (f.cuisine) p.set("cuisine", f.cuisine);
  if (f.near.trim()) p.set("near", f.near.trim());
  if (f.type) p.set("type", f.type);
  for (const d of f.dietary) p.append("diet", d);
  if (f.maxPrice) p.set("price", String(f.maxPrice));
  if (f.minRating) p.set("rating", String(f.minRating));
  if (f.maxEta) p.set("eta", String(f.maxEta));
  if (f.openNow) p.set("open", "1");
  if (f.freeDelivery) p.set("free", "1");
  if (f.offersOnly) p.set("offers", "1");
  if (f.sort !== "relevance") p.set("sort", f.sort);
  return p.toString();
}

/**
 * SearchFilters — the facet panel (spec: Smart Search). The URL is the single
 * source of truth: current values arrive as props read server-side from
 * `searchParams`, and every change pushes a new query string so results stay
 * shareable and re-run through the service seam.
 *
 * Renders as a sticky sidebar from `lg` up and a collapsible panel below it.
 */
export function SearchFilters({
  facets,
  cuisines,
  resultCount,
}: {
  facets: SearchFacets;
  cuisines: Cuisine[];
  resultCount: number;
}) {
  const t = useTranslations("search");
  const tType = useTranslations("vendorType");
  const tDiet = useTranslations("dietary");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function push(next: Partial<SearchFacets>) {
    const merged = { ...facets, ...next };
    const qs = facetsToQuery(merged);
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggleDiet(tag: DietaryTag) {
    const has = facets.dietary.includes(tag);
    push({
      dietary: has ? facets.dietary.filter((d) => d !== tag) : [...facets.dietary, tag],
    });
  }

  const activeCount =
    (facets.type ? 1 : 0) +
    facets.dietary.length +
    (facets.maxPrice ? 1 : 0) +
    (facets.minRating ? 1 : 0) +
    (facets.maxEta ? 1 : 0) +
    (facets.openNow ? 1 : 0) +
    (facets.freeDelivery ? 1 : 0) +
    (facets.offersOnly ? 1 : 0) +
    (facets.cuisine ? 1 : 0) +
    (facets.category ? 1 : 0);

  function clearAll() {
    push({
      category: "",
      cuisine: "",
      type: "",
      dietary: [],
      maxPrice: 0,
      minRating: 0,
      maxEta: 0,
      openNow: false,
      freeDelivery: false,
      offersOnly: false,
    });
  }

  return (
    <div className="lg:sticky lg:top-20 lg:h-fit">
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-panel border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />
          {t("filters")}
          {activeCount > 0 && (
            <span className="inline-flex size-5 items-center justify-center rounded-pill bg-primary text-xs text-white">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-xs font-medium text-muted">
          {t("resultsCount", { count: resultCount })}
        </span>
      </button>

      <div
        className={cn(
          "mt-3 flex-col gap-6 rounded-panel border border-line bg-surface p-5 lg:mt-0 lg:flex",
          open ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("filters")}
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <X className="size-3.5" aria-hidden />
              {t("clearAll")}
            </button>
          )}
        </div>

        {/* Quick toggles */}
        <FilterGroup label={t("quickFilters")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={facets.openNow} onClick={() => push({ openNow: !facets.openNow })}>
              {t("openNow")}
            </Chip>
            <Chip
              active={facets.freeDelivery}
              onClick={() => push({ freeDelivery: !facets.freeDelivery })}
            >
              {t("freeDelivery")}
            </Chip>
            <Chip
              active={facets.offersOnly}
              onClick={() => push({ offersOnly: !facets.offersOnly })}
            >
              {t("hasOffers")}
            </Chip>
          </div>
        </FilterGroup>

        {/* Vendor type */}
        <FilterGroup label={t("vendorTypeLabel")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={facets.type === ""} onClick={() => push({ type: "" })}>
              {t("anyType")}
            </Chip>
            {VENDOR_TYPES.map((vt) => (
              <Chip key={vt} active={facets.type === vt} onClick={() => push({ type: vt })}>
                {tType(vt)}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {/* Cuisine */}
        <FilterGroup label={t("cuisineLabel")}>
          <select
            value={facets.cuisine}
            onChange={(e) => push({ cuisine: e.target.value })}
            aria-label={t("cuisineLabel")}
            className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
          >
            <option value="">{t("anyCuisine")}</option>
            {cuisines.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </FilterGroup>

        {/* Dietary */}
        <FilterGroup label={t("dietaryLabel")}>
          <div className="flex flex-wrap gap-2">
            {DIETARY.map((tag) => (
              <Chip
                key={tag}
                active={facets.dietary.includes(tag)}
                onClick={() => toggleDiet(tag)}
              >
                {tDiet(tag)}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {/* Price level */}
        <FilterGroup label={t("priceLabel")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={facets.maxPrice === 0} onClick={() => push({ maxPrice: 0 })}>
              {t("anyPrice")}
            </Chip>
            {[1, 2, 3, 4].map((level) => (
              <Chip
                key={level}
                active={facets.maxPrice === level}
                onClick={() => push({ maxPrice: level })}
              >
                {"$".repeat(level)}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {/* Rating */}
        <FilterGroup label={t("ratingLabel")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={facets.minRating === 0} onClick={() => push({ minRating: 0 })}>
              {t("anyRating")}
            </Chip>
            {RATINGS.map((r) => (
              <Chip
                key={r}
                active={facets.minRating === r}
                onClick={() => push({ minRating: r })}
              >
                {t("ratingPlus", { rating: r })}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {/* Delivery time */}
        <FilterGroup label={t("etaLabel")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={facets.maxEta === 0} onClick={() => push({ maxEta: 0 })}>
              {t("anyEta")}
            </Chip>
            {ETAS.map((m) => (
              <Chip key={m} active={facets.maxEta === m} onClick={() => push({ maxEta: m })}>
                {t("underMinutes", { minutes: m })}
              </Chip>
            ))}
          </div>
        </FilterGroup>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold text-ink">{label}</legend>
      {children}
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center rounded-pill border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
