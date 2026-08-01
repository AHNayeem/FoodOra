"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { NotifyAudience, NotifyTone } from "@/types";
import {
  useNotifications,
  selectFor,
  unreadCount,
} from "@/stores/notifications";
import { STATUS_ICON } from "@/components/orders/order-status-meta";
import { cn } from "@/lib/utils";

/** Accent per tone — the left rail of a row, and the icon chip. */
const TONE_CLASS: Record<NotifyTone, string> = {
  info: "bg-primary/10 text-primary",
  success: "bg-fresh-50 text-fresh-600",
  warning: "bg-accent-50 text-accent-600",
  danger: "bg-danger/10 text-danger",
};

/**
 * NotificationBell — the in-app inbox (spec: Notifications).
 *
 * The prototype had no notifications at all: order updates surfaced as toasts on
 * the acting device and then vanished, so a restaurant could not see that an
 * order had arrived while they were on the menu screen, and a customer who
 * closed the tracker learned nothing.
 *
 * One bell, mounted in all four shells with a different `audience`. The feed
 * itself is written by the order store after every committed transition (see
 * `lib/notifications`), so what appears here is exactly what happened — there is
 * no second code path that can drift.
 */
export function NotificationBell({
  audience,
  className,
}: {
  audience: NotifyAudience;
  className?: string;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();

  const hydrated = useNotifications((s) => s.hydrated);
  const items = useNotifications((s) => s.items);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useNotifications.persist.rehydrate();
  }, []);

  // Close on Escape / outside click — the panel is a popover, not a dialog.
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
          <div
            ref={panelRef}
            className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-menu"
          >
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
                {feed.map((item) => {
                  const Icon = STATUS_ICON[item.status];
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          markRead(item.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex gap-3 px-4 py-3 transition-colors hover:bg-surface-muted",
                          !item.read && "bg-primary/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
                            TONE_CLASS[item.tone],
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 text-sm",
                                item.read ? "font-medium text-body" : "font-bold text-ink",
                              )}
                            >
                              {t(`${audience}.${item.key}.title`, item.params)}
                            </span>
                            {!item.read && (
                              <span
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                                aria-label={t("unread")}
                              />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {t(`${audience}.${item.key}.body`, item.params)}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted">
                            {format.relativeTime(new Date(item.at))}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
