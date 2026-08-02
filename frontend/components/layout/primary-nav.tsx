"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { CmsMenuItem } from "@/frontend/types";
import { useCmsMenu } from "@/frontend/components/cms/use-cms-content";
import { DashIcon } from "@/frontend/components/directory/dash-icon";
import { cn } from "@/frontend/lib/utils";

/** True when `href` is the current route or one of its children. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One link's chrome. Shared by the visible row, the hidden measuring row and
 * the More trigger, so what we measure is exactly what we render — and
 * `whitespace-nowrap` guarantees a label can never break onto a second line.
 */
const linkClass =
  "inline-flex h-10 items-center whitespace-nowrap rounded-pill px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)]";
const restClass = "text-body hover:bg-surface-muted hover:text-ink";
const activeClass = "bg-primary/10 text-primary";

/**
 * PrimaryNav — the desktop bar, using a priority-plus pattern.
 *
 * The eight categories are wider than the space between the logo and the
 * actions on a small laptop, which is what made the old bar wrap. Instead of
 * letting the browser reflow, we measure the row against the space it actually
 * has and move whatever does not fit into a "More" menu — so the header stays
 * exactly one line tall at every width, in every language.
 *
 * Measurement runs off a hidden copy of the full row: once items move into the
 * menu their widths are no longer in the DOM, and a copy keeps the numbers
 * correct across locale switches and late font loads (both resize the copy,
 * which the observer picks up).
 *
 * The links themselves are content (the CMS `header` menu, C26): reordering one,
 * hiding one or renaming it is an edit in `/admin/cms`, and the measurement above
 * re-runs because the labels changed width — the same path a locale switch takes.
 */
export function PrimaryNav({ menu, className }: { menu: CmsMenuItem[]; className?: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const items = useCmsMenu("header", menu);

  const rowRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);

  // Start with everything visible: that is the correct no-JS/pre-hydration
  // render, and `measured` keeps the row clipped until the real count lands.
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [measured, setMeasured] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const measure = useCallback(() => {
    const row = rowRef.current;
    const ghost = ghostRef.current;
    if (!row || !ghost) return;

    const nodes = Array.from(ghost.children) as HTMLElement[];
    if (nodes.length !== items.length + 1) return; // items + More trigger

    const gap = Number.parseFloat(getComputedStyle(ghost).columnGap) || 0;
    const widths = nodes.map((node) => node.getBoundingClientRect().width);
    const moreWidth = widths.pop() ?? 0;
    const available = row.clientWidth;

    let count = widths.length;
    while (count > 0) {
      const used = widths.slice(0, count).reduce((sum, w) => sum + w, 0) + gap * (count - 1);
      const trigger = count < widths.length ? gap + moreWidth : 0;
      if (used + trigger <= available) break;
      count--;
    }

    setVisibleCount(count);
    setMeasured(true);
  }, [items.length]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    // The row gives us the space available; the ghost re-fires when the labels
    // themselves change width (locale switch, webfont swap).
    if (rowRef.current) observer.observe(rowRef.current);
    if (ghostRef.current) observer.observe(ghostRef.current);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!moreOpen) return;
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const shown = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);
  const overflowActive = overflow.some((item) => isNavActive(pathname, item.href));

  const moreTrigger = (
    <span className={cn(linkClass, "gap-1", overflowActive ? activeClass : restClass)}>
      {t("nav.more")}
      <ChevronDown className="size-4" aria-hidden />
    </span>
  );

  return (
    <nav
      ref={rowRef}
      aria-label={t("nav.primary")}
      className={cn("relative min-w-0 items-center", className)}
    >
      <ul
        className={cn(
          "flex items-center gap-1",
          // Only until the first measurement: afterwards the row fits by
          // construction, and clipping would eat the More dropdown.
          !measured && "overflow-hidden",
        )}
      >
        {shown.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(linkClass, active ? activeClass : restClass)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}

        {overflow.length > 0 && (
          <li ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className="inline-flex rounded-pill"
            >
              {moreTrigger}
            </button>

            {moreOpen && (
              <div
                role="menu"
                className="animate-pop-in absolute end-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-card border border-line bg-surface p-1.5 shadow-menu"
              >
                {overflow.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-body hover:bg-surface-muted hover:text-ink",
                      )}
                    >
                      <DashIcon
                        name={item.icon}
                        className={cn("size-4", !active && "text-muted")}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </li>
        )}
      </ul>

      {/* Measuring copy: laid out (so it has real widths) but never painted,
          never focusable, never announced. */}
      <ul
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none invisible absolute start-0 top-0 flex w-max items-center gap-1"
      >
        {items.map((item) => (
          <li key={item.id}>
            <span className={cn(linkClass, restClass)}>{item.label}</span>
          </li>
        ))}
        <li>{moreTrigger}</li>
      </ul>
    </nav>
  );
}
