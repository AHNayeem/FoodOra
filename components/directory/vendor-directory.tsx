import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { getVendors } from "@/services/catalog";
import { VendorFilters, type SortKey } from "@/components/filters/vendor-filters";
import { VendorCard } from "@/components/cards/vendor-card";
import { DashIcon } from "@/components/directory/dash-icon";
import type { VendorType } from "@/types";

/** A single "why this vertical" bullet shown under the directory hero. */
export interface DirectoryFeature {
  /** Lucide icon name, resolved by {@link DashIcon}. */
  icon: string;
  title: string;
  description: string;
}

/**
 * VendorDirectory — the shared body of every single-vertical directory
 * (`/cafes`, `/home-chefs`, `/cloud-kitchens`). The type is pinned by the route,
 * so the type chips are hidden and only the remaining facets live in the URL.
 *
 * Copy arrives as resolved strings from the page, which owns the namespace, so
 * this component stays translation-agnostic and each vertical reads as its own
 * product rather than a filtered list.
 */
export async function VendorDirectory({
  type,
  title,
  subtitle,
  features,
  sort,
  openNow,
  search,
}: {
  type: VendorType;
  title: string;
  subtitle: string;
  features: DirectoryFeature[];
  sort: SortKey;
  openNow: boolean;
  search: string;
}) {
  const t = await getTranslations("directory");
  const { items, total } = await getVendors({
    type,
    openNow: openNow || undefined,
    search: search || undefined,
    sort,
    pageSize: 100,
  });

  return (
    <div className="container-site py-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-h1 text-ink">{title}</h1>
        <p className="mt-2 max-w-2xl text-body">{subtitle}</p>
      </header>

      {features.length > 0 && (
        <ul className="mb-8 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <li
              key={f.title}
              className="rounded-panel border border-line bg-surface-muted p-5"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-pill bg-primary/10 text-primary">
                <DashIcon name={f.icon} className="size-5" />
              </span>
              <h2 className="mt-3 font-bold text-ink">{f.title}</h2>
              <p className="mt-1 text-sm text-body">{f.description}</p>
            </li>
          ))}
        </ul>
      )}

      <VendorFilters
        type=""
        sort={sort}
        openNow={openNow}
        search={search}
        hideTypeFilter
      />

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
