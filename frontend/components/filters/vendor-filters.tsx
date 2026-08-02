"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { VendorType } from "@/frontend/types";
import { cn } from "@/frontend/lib/utils";

export type SortKey = "recommended" | "rating" | "delivery-time" | "distance";

const VENDOR_TYPES: VendorType[] = [
  "restaurant",
  "cafe",
  "cloud-kitchen",
  "home-chef",
  "catering",
];

const SORTS: SortKey[] = ["recommended", "rating", "delivery-time", "distance"];

const SORT_KEY: Record<SortKey, string> = {
  recommended: "sortRecommended",
  rating: "sortRating",
  "delivery-time": "sortDeliveryTime",
  distance: "sortDistance",
};

interface Props {
  type: VendorType | "";
  sort: SortKey;
  openNow: boolean;
  search: string;
}

interface VendorFiltersProps extends Props {
  /**
   * Hide the vendor-type chips. Used by the single-vertical directories
   * (`/cafes`, `/home-chefs`, `/cloud-kitchens`) where the type comes from the
   * route, so it must not also appear as a removable filter.
   */
  hideTypeFilter?: boolean;
}

/**
 * VendorFilters — the directory filter bar (Phase C4). URL is the source of
 * truth: current state arrives as props (read server-side from searchParams),
 * and every change rewrites the query string so results stay shareable and the
 * page re-fetches through the services seam.
 */
export function VendorFilters({
  type,
  sort,
  openNow,
  search,
  hideTypeFilter = false,
}: VendorFiltersProps) {
  const t = useTranslations("directory");
  const tType = useTranslations("vendorType");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(search);

  // Push a debounced URL update when the search text changes (skip first run).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = setTimeout(() => push({ search: q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function push(next: Partial<Props>) {
    const merged: Props = { type, sort, openNow, search: q, ...next };
    const params = new URLSearchParams();
    if (merged.type) params.set("type", merged.type);
    if (merged.sort !== "recommended") params.set("sort", merged.sort);
    if (merged.openNow) params.set("open", "1");
    if (merged.search.trim()) params.set("q", merged.search.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasFilters = type !== "" || sort !== "recommended" || openNow || search !== "";

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-12 w-full rounded-pill border border-line bg-surface ps-12 pe-4 text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
        />
      </div>

      {/* Type chips — omitted when the route already pins the vendor type. */}
      {!hideTypeFilter && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <FilterChip active={type === ""} onClick={() => push({ type: "" })}>
            {t("allTypes")}
          </FilterChip>
          {VENDOR_TYPES.map((vt) => (
            <FilterChip key={vt} active={type === vt} onClick={() => push({ type: vt })}>
              {tType(vt)}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Sort + toggles */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-body">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
          <select
            value={sort}
            onChange={(e) => push({ sort: e.target.value as SortKey })}
            className="h-10 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
          >
            {SORTS.map((sk) => (
              <option key={sk} value={sk}>
                {t(SORT_KEY[sk])}
              </option>
            ))}
          </select>
        </label>

        <FilterChip active={openNow} onClick={() => push({ openNow: !openNow })}>
          {t("openNow")}
        </FilterChip>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(pathname, { scroll: false });
            }}
            className="ms-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <X className="size-4" aria-hidden />
            {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({
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
        "inline-flex h-10 shrink-0 items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
