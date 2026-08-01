"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Minus, Plus, Search, SlidersHorizontal, Users, X } from "lucide-react";
import type { BookingPolicy, Vendor } from "@/types";
import { useReservations } from "@/stores/reservations";
import { cn } from "@/lib/utils";
import { VenueCard } from "./venue-card";

export type VenueSortKey = "recommended" | "rating" | "price-low" | "party-large";

const SORTS: VenueSortKey[] = ["recommended", "rating", "price-low", "party-large"];

/** Party sizes the directory offers as quick picks. */
const QUICK_PARTIES = [2, 3, 4, 5, 6, 8];

interface Props {
  venues: Vendor[];
  /** Policy per venue id, resolved server-side through the seam. */
  policies: Record<string, BookingPolicy>;
  partySize: number;
  sort: VenueSortKey;
  search: string;
}

/**
 * VenueDirectory — the `/reservations` listing (Phase C16).
 *
 * Same contract as the other directories: the URL query string is the source of
 * truth and current state arrives parsed server-side, so a filtered view stays
 * shareable. The one addition is *party size*, which is not a cosmetic filter —
 * it is an input to the availability engine, so changing it re-asks every card
 * "when can you seat this many?" rather than merely hiding rows.
 *
 * The whole list is a client component because of that: availability has to be
 * computed against a clock, and one clock shared by every card is the only way
 * the cards can agree with each other and with the booking form.
 */
export function VenueDirectory({ venues, policies, partySize, sort, search }: Props) {
  const t = useTranslations("reservations");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(search);

  // Read once: every card derives availability against this same instant.
  const [now] = useState(() => new Date());

  useEffect(() => {
    useReservations.persist.rehydrate();
  }, []);

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

  function push(next: Partial<Omit<Props, "venues" | "policies">>) {
    const merged = { partySize, sort, search: q, ...next };
    const params = new URLSearchParams();
    if (merged.partySize !== 2) params.set("party", String(merged.partySize));
    if (merged.sort !== "recommended") params.set("sort", merged.sort);
    if (merged.search.trim()) params.set("q", merged.search.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const largest = useMemo(
    () => Math.max(...Object.values(policies).map((p) => p.maxPartySize), 2),
    [policies],
  );
  const hasFilters = partySize !== 2 || sort !== "recommended" || search !== "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="h-12 w-full rounded-pill border border-line bg-surface ps-12 pe-4 text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Party size — an input to availability, not a display filter. */}
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted" aria-hidden />
            <span className="text-sm font-medium text-body">{t("partyLabel")}</span>
            <div className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1">
              <StepButton
                label="−"
                icon={Minus}
                disabled={partySize <= 1}
                onClick={() => push({ partySize: partySize - 1 })}
              />
              <span className="min-w-10 text-center text-sm font-bold text-ink">
                {t("guests", { count: partySize })}
              </span>
              <StepButton
                label="+"
                icon={Plus}
                disabled={partySize >= largest}
                onClick={() => push({ partySize: partySize + 1 })}
              />
            </div>
          </div>

          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {QUICK_PARTIES.filter((n) => n <= largest).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => push({ partySize: n })}
                aria-pressed={partySize === n}
                className={cn(
                  "size-9 shrink-0 rounded-pill border text-sm font-semibold transition-colors",
                  partySize === n
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-body hover:border-primary hover:text-primary",
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-body">
            <SlidersHorizontal className="size-4 text-muted" aria-hidden />
            <span className="sr-only sm:not-sr-only">{t("sortLabel")}</span>
            <select
              value={sort}
              onChange={(e) => push({ sort: e.target.value as VenueSortKey })}
              className="h-10 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-primary"
            >
              {SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort.${key}`)}
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
              {t("clearFilters")}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted">{t("resultCount", { count: venues.length })}</p>

      {venues.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface p-10 text-center">
          <h2 className="text-h3 text-ink">{t("noResults")}</h2>
          <p className="mt-1 text-body">{t("noResultsBody")}</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => (
            <VenueCard
              key={venue.id}
              vendor={venue}
              policy={policies[venue.id]}
              partySize={partySize}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StepButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Plus;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-pill text-ink transition-colors hover:bg-surface-muted disabled:opacity-40"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
