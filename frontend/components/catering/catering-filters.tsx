"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { EventType } from "@/frontend/types";
import { EVENT_TYPES, EVENT_TYPE_EMOJI } from "@/frontend/lib/catering";
import { cn } from "@/frontend/lib/utils";

export type CateringSortKey = "recommended" | "rating" | "price-low" | "capacity";

const SORTS: CateringSortKey[] = ["recommended", "rating", "price-low", "capacity"];

interface Props {
  event: EventType | "";
  sort: CateringSortKey;
  search: string;
}

/**
 * CateringFilters — the catering directory filter bar (Phase C17). Mirrors the
 * restaurant directory: the URL query string is the source of truth, current
 * state arrives as props (parsed server-side), and every change rewrites the
 * query so results stay shareable and the page re-fetches through the services
 * seam.
 */
export function CateringFilters({ event, sort, search }: Props) {
  const t = useTranslations("catering");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(search);

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
    const merged: Props = { event, sort, search: q, ...next };
    const params = new URLSearchParams();
    if (merged.event) params.set("event", merged.event);
    if (merged.sort !== "recommended") params.set("sort", merged.sort);
    if (merged.search.trim()) params.set("q", merged.search.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasFilters = event !== "" || sort !== "recommended" || search !== "";

  return (
    <div className="flex flex-col gap-4">
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

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <FilterChip active={event === ""} onClick={() => push({ event: "" })}>
          {t("allEvents")}
        </FilterChip>
        {EVENT_TYPES.map((et) => (
          <FilterChip key={et} active={event === et} onClick={() => push({ event: et })}>
            <span aria-hidden>{EVENT_TYPE_EMOJI[et]}</span>
            {t(`event.${et}`)}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-body">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
          <select
            value={sort}
            onChange={(e) => push({ sort: e.target.value as CateringSortKey })}
            className="h-10 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
          >
            {SORTS.map((sk) => (
              <option key={sk} value={sk}>
                {t(`sort.${sk}`)}
              </option>
            ))}
          </select>
        </label>

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
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
