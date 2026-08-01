"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, X } from "lucide-react";
import { SearchBox } from "./search-box";
import { facetsToQuery, SEARCH_SORTS, type SearchFacets } from "./search-filters";
import type { SearchSort } from "@/services/search";

/**
 * SearchToolbar — the search field, the "delivering to" chip and the sort
 * select. Owns the URL writes for those three controls; the facet sidebar owns
 * its own. Kept separate from the results so the results themselves stay a
 * server render.
 */
export function SearchToolbar({
  facets,
  resultCount,
}: {
  facets: SearchFacets;
  resultCount: number;
}) {
  const t = useTranslations("search");
  const router = useRouter();
  const pathname = usePathname();

  function push(next: Partial<SearchFacets>) {
    const qs = facetsToQuery({ ...facets, ...next });
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={facets.q} onSubmitQuery={(q) => push({ q })} />

      <div className="flex flex-wrap items-center gap-3">
        {facets.near && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-3 py-1.5 text-sm text-body">
            <MapPin className="size-4 text-primary" aria-hidden />
            {t("deliveringTo", { address: facets.near })}
            <button
              type="button"
              onClick={() => push({ near: "" })}
              aria-label={t("clearAddress")}
              className="text-muted hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        )}

        <p className="text-sm font-medium text-muted" aria-live="polite">
          {t("resultsCount", { count: resultCount })}
        </p>

        <label className="ms-auto inline-flex items-center gap-2 text-sm text-body">
          <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
          <select
            value={facets.sort}
            onChange={(e) => push({ sort: e.target.value as SearchSort })}
            className="h-10 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
          >
            {SEARCH_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
