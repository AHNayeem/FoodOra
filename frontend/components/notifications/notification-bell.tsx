"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Bell, BellOff, CheckCheck } from "lucide-react";
import type { NotifyAudience } from "@/types";
import {
  useNotifications,
  selectFor,
  unreadCount,
} from "@/stores/notifications";
import { NotificationRow } from "./notification-row";
import { cn } from "@/lib/utils";

/** How many rows the glance shows before "see all" is the better answer. */
const PEEK = 8;

/**
 * Where each role's full inbox lives. Only two roles have one: the customer's
 * account centre and the operator's. A restaurant's and a rider's inbox *is*
 * their dashboard, so the popover links to nothing rather than to a page built
 * to justify the link.
 */
const CENTER_HREF: Partial<Record<NotifyAudience, string>> = {
  customer: "/account/notifications",
  admin: "/admin/notifications",
};

/**
 * NotificationBell — the in-app inbox at a glance (Phase C25).
 *
 * One bell, mounted in all four shells with a different `audience`. The feed is
 * written by the domain stores after a committed change and routed by
 * `stores/notifications.notify`, so what appears here is exactly what happened
 * and exactly what the customer's preferences allowed — there is no second code
 * path that can drift.
 *
 * Deliberately a peek, not a page: the most recent few, and a link to the whole
 * thing. A popover that scrolls forever is a page that has been put in the wrong
 * place.
 */
export function NotificationBell({
  audience,
  className,
}: {
  audience: NotifyAudience;
  className?: string;
}) {
  const t = useTranslations("notifications");

  const hydrated = useNotifications((s) => s.hydrated);
  const items = useNotifications((s) => s.items);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    useNotifications.persist.rehydrate();
  }, []);

  // Close on Escape — the panel is a popover, not a dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const feed = hydrated ? selectFor(items, audience) : [];
  const unread = hydrated ? unreadCount(items, audience) : 0;
  const centerHref = CENTER_HREF[audience];

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("title")}
        className="relative inline-flex size-11 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-muted lg:size-10"
      >
        <Bell className="size-4.5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-menu">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-ink">{t("title")}</h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead(audience)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <CheckCheck className="size-3.5" aria-hidden />
                  {t("markAllRead")}
                </button>
              )}
            </div>

            {feed.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="inline-flex size-11 items-center justify-center rounded-pill bg-surface-muted text-muted">
                  <BellOff className="size-5" aria-hidden />
                </span>
                <p className="text-sm text-muted">{t("empty")}</p>
              </div>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
                {feed.slice(0, PEEK).map((item) => (
                  <li key={item.id}>
                    <NotificationRow
                      item={item}
                      onOpen={(id) => {
                        markRead(id);
                        setOpen(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            {centerHref && (
              <Link
                href={centerHref}
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-xs font-bold text-primary transition-colors hover:bg-surface-muted"
              >
                {t("seeAll")}
                <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
