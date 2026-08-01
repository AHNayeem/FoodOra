"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import { getSearchSuggestions } from "@/services/search";
import { cn } from "@/lib/utils";

/**
 * SearchBox — the results-page search field with type-ahead. Suggestions are
 * fetched through the search service (debounced, with a request-id guard so a
 * slow response can never overwrite a newer one). Submitting or picking a
 * suggestion rewrites the `q` query param, which re-runs the server search.
 */
export function SearchBox({
  value,
  onSubmitQuery,
  className,
}: {
  value: string;
  /** Called with the chosen term; the parent owns the URL write. */
  onSubmitQuery: (q: string) => void;
  className?: string;
}) {
  const t = useTranslations("search");
  const [q, setQ] = useState(value);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  // Keep the field in step when the URL changes from elsewhere (chip, back nav).
  // Adjusting state during render on a prop change is the documented React
  // pattern — cheaper and flicker-free compared with syncing in an effect.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setQ(value);
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Only cleanup lives in an effect — the fetch is scheduled in the change
  // handler, so this component never sets state from an effect body.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function scheduleSuggest(next: string) {
    if (timer.current) clearTimeout(timer.current);
    const id = ++requestId.current;
    setLoading(true);
    timer.current = setTimeout(async () => {
      const results = await getSearchSuggestions(next);
      if (id !== requestId.current) return; // a newer keystroke won
      setItems(results);
      setActive(-1);
      setLoading(false);
      setOpen(true);
    }, 200);
  }

  function handleChange(next: string) {
    setQ(next);
    scheduleSuggest(next);
  }

  function commit(term: string) {
    setOpen(false);
    requestId.current += 1; // invalidate any in-flight suggestion
    onSubmitQuery(term.trim());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setOpen(false);
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      commit(items[active]);
    }
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit(q);
        }}
        role="search"
      >
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          aria-autocomplete="list"
          aria-expanded={open}
          role="combobox"
          aria-controls="search-suggestions"
          className="h-13 w-full rounded-pill border border-line bg-surface ps-12 pe-24 text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
        />
        <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setItems([]);
                commit("");
              }}
              aria-label={t("clear")}
              className="inline-flex size-8 items-center justify-center rounded-pill text-muted hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-pill bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600"
          >
            {t("go")}
          </button>
        </div>
      </form>

      {open && items.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-panel border border-line bg-surface py-1.5 shadow-card"
        >
          {items.map((item, i) => (
            <li key={item} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(item)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-body",
                  i === active ? "bg-surface-muted text-ink" : "hover:bg-surface-muted",
                )}
              >
                <Search className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="truncate">{item}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
