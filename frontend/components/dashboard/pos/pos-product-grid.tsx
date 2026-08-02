"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Search, Plus } from "lucide-react";
import type { FoodItem } from "@/frontend/types";
import type { MenuSectionWithItems } from "@/frontend/services/catalog";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

/**
 * PosProductGrid — the sellable-menu pane of the terminal. A sticky search +
 * category bar over a tap-to-add product grid. Owns only its local browse state
 * (active category + query); adding an item is delegated up to the terminal.
 */
export function PosProductGrid({
  sections,
  currency,
  unavailableIds,
  onAdd,
}: {
  sections: MenuSectionWithItems[];
  currency: CurrencyCode;
  unavailableIds: Set<string>;
  onAdd: (item: FoodItem) => void;
}) {
  const t = useTranslations("pos");
  const [activeSection, setActiveSection] = useState<string>("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  // Searching flattens across every section; otherwise honour the category tab.
  const visible = useMemo(() => {
    const scoped = q
      ? sections
      : activeSection === "all"
        ? sections
        : sections.filter((s) => s.id === activeSection);

    return scoped
      .map((s) => ({
        ...s,
        items: q
          ? s.items.filter((i) => i.name.toLowerCase().includes(q))
          : s.items,
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, activeSection, q]);

  const hasResults = visible.length > 0;

  return (
    <div className="flex flex-col">
      {/* Search + category rail */}
      <div className="sticky top-16 z-10 -mx-1 bg-surface-muted/95 px-1 pb-3 pt-1 backdrop-blur">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-11 w-full rounded-pill border border-line bg-surface ps-11 pe-4 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
          />
        </div>

        {!q && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <CategoryChip
              label={t("allItems")}
              active={activeSection === "all"}
              onClick={() => setActiveSection("all")}
            />
            {sections.map((s) => (
              <CategoryChip
                key={s.id}
                label={s.name}
                active={activeSection === s.id}
                onClick={() => setActiveSection(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!hasResults ? (
        <p className="py-16 text-center text-sm text-muted">{t("noItems")}</p>
      ) : (
        <div className="space-y-6">
          {visible.map((section) => (
            <section key={section.id}>
              <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted">
                {section.name}
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {section.items.map((item) => (
                  <ProductButton
                    key={item.id}
                    item={item}
                    currency={currency}
                    soldOut={unavailableIds.has(item.id)}
                    onAdd={onAdd}
                    addLabel={t("addItem", { name: item.name })}
                    soldOutLabel={t("soldOut")}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-primary text-white"
          : "bg-surface text-body hover:bg-surface hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function ProductButton({
  item,
  currency,
  soldOut,
  onAdd,
  addLabel,
  soldOutLabel,
}: {
  item: FoodItem;
  currency: CurrencyCode;
  soldOut: boolean;
  onAdd: (item: FoodItem) => void;
  addLabel: string;
  soldOutLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      disabled={soldOut}
      aria-label={addLabel}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface text-start shadow-card transition-[transform,box-shadow] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        soldOut ? "cursor-not-allowed opacity-55" : "hover:shadow-menu",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
        <Image
          src={item.image}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, 200px"
          className="object-cover"
        />
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
            {soldOutLabel}
          </span>
        ) : (
          <span className="absolute end-2 top-2 inline-flex size-7 items-center justify-center rounded-pill bg-primary text-white shadow-sm transition-transform group-hover:scale-110">
            <Plus className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {item.name}
        </p>
        <p className="mt-auto pt-1 text-sm font-bold tabular-nums text-primary">
          {formatPrice(item.price, currency)}
        </p>
      </div>
    </button>
  );
}
