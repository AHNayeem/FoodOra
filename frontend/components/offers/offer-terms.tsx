"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OfferTerms — the small print, collapsed by default. Kept as a disclosure
 * rather than a modal so the terms stay in the card's reading order for screen
 * readers and are printable with the page.
 */
export function OfferTerms({ terms }: { terms: string[] }) {
  const t = useTranslations("offers");
  const [open, setOpen] = useState(false);

  if (terms.length === 0) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
      >
        {t("terms")}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[var(--duration-base)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ul className="overflow-hidden">
          {terms.map((term) => (
            <li key={term} className="mt-2 flex gap-2 text-xs leading-relaxed text-muted">
              <span aria-hidden>·</span>
              {term}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
