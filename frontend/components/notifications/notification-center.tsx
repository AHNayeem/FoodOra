"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { BellOff, CheckCheck, Inbox, Send, Settings, Trash2 } from "lucide-react";
import type {
  AppNotification,
  NotificationDispatch,
  NotifyCategory,
} from "@/frontend/types";
import { getFeed, getOutbox, type CategoryFacet } from "@/frontend/services/notifications";
import { useNotifications } from "@/frontend/stores/notifications";
import { NotificationRow } from "./notification-row";
import {
  CATEGORY_ICON,
  CATEGORY_ORDER,
  CHANNEL_ICON,
  DISPATCH_CLASS,
} from "./notification-meta";
import { dispatchRenderable, useNotificationCopy } from "./notification-text";
import { PushCard } from "./push-card";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

type Tab = "inbox" | "log";

/** How many rows a page of either tab shows before "load more". */
const PAGE_SIZE = 20;

/**
 * NotificationCenter — the customer's whole inbox (`/account/notifications`,
 * Phase C25).
 *
 * The bell is a glance; this is the record, and it answers a question the bell
 * cannot: *where did this go*. Two tabs, because there are two things worth
 * looking at — the notifications themselves, and the delivery log underneath
 * them. The log is the honest half of the preference matrix: a promotion the
 * customer opted out of shows up there as a suppressed row rather than as
 * nothing at all, so the switch on the settings page is visibly doing
 * something.
 *
 * Filtering and paging go through `services/notifications` rather than being
 * done inline, so the day the feed is server-owned this component does not
 * change — it is already asking a seam a query.
 */
export function NotificationCenter() {
  const t = useTranslations("notifications");

  const hydrated = useNotifications((s) => s.hydrated);
  const items = useNotifications((s) => s.items);
  const outboxItems = useNotifications((s) => s.outbox);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const clear = useNotifications((s) => s.clear);

  const [tab, setTab] = useState<Tab>("inbox");
  const [category, setCategory] = useState<NotifyCategory | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [feed, setFeed] = useState<AppNotification[]>([]);
  const [facets, setFacets] = useState<CategoryFacet[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [log, setLog] = useState<NotificationDispatch[]>([]);

  useEffect(() => {
    useNotifications.persist.rehydrate();
  }, []);

  // A filter change is a new query, not a longer one — so every control that
  // narrows the list resets the paging with it, in the handler rather than in
  // an effect reacting to itself.
  function filterBy(next: NotifyCategory | null) {
    setCategory(next);
    setPage(1);
  }
  function showUnreadOnly(next: boolean) {
    setUnreadOnly(next);
    setPage(1);
  }
  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
  }

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    getFeed(items, {
      audience: "customer",
      category,
      unreadOnly,
      page: 1,
      pageSize: page * PAGE_SIZE,
    }).then((res) => {
      if (!live) return;
      setFeed(res.page.items);
      setFacets(res.facets);
      setUnread(res.unread);
      setHasMore(res.page.hasMore);
    });
    return () => {
      live = false;
    };
  }, [hydrated, items, category, unreadOnly, page]);

  useEffect(() => {
    if (!hydrated || tab !== "log") return;
    let live = true;
    getOutbox(outboxItems, { audience: "customer", page: 1, pageSize: page * PAGE_SIZE }).then(
      (res) => {
        if (!live) return;
        setLog(res.items);
        setHasMore(res.hasMore);
      },
    );
    return () => {
      live = false;
    };
  }, [hydrated, outboxItems, tab, page]);

  /** Only categories that actually have something get a tab. */
  const tabs = useMemo(() => {
    const present = new Set(facets.map((f) => f.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [facets]);

  const countFor = (c: NotifyCategory | null) =>
    facets.find((f) => f.category === c)?.total ?? 0;

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2 text-ink">{t("centerTitle")}</h2>
          <p className="text-sm text-muted">
            {unread > 0 ? t("unreadCount", { count: unread }) : t("allCaughtUp")}
          </p>
        </div>
        <Link
          href="/account/settings"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Settings className="size-4" aria-hidden />
          {t("managePreferences")}
        </Link>
      </header>

      <PushCard />

      {/* Inbox vs delivery log */}
      <div role="tablist" aria-label={t("centerTitle")} className="flex gap-1.5">
        {(["inbox", "log"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => switchTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-primary/10 text-primary"
                : "text-body hover:bg-surface-muted hover:text-ink",
            )}
          >
            {value === "inbox" ? (
              <Inbox className="size-4" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {t(value === "inbox" ? "tabInbox" : "tabLog")}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <section className="rounded-panel border border-line bg-surface">
          {/* Category filter + bulk actions */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <FilterChip
              label={t("filterAll")}
              count={countFor(null)}
              active={category === null}
              onClick={() => filterBy(null)}
            />
            {tabs.map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <FilterChip
                  key={c}
                  label={t(`category.${c}`)}
                  count={countFor(c)}
                  active={category === c}
                  onClick={() => filterBy(c)}
                  icon={<Icon className="size-3.5" aria-hidden />}
                />
              );
            })}

            <label className="ms-auto inline-flex items-center gap-2 text-sm font-medium text-body">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => showUnreadOnly(e.target.checked)}
                className="size-4 rounded border-line text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              {t("unreadOnly")}
            </label>
          </div>

          {feed.length === 0 ? (
            <EmptyState
              text={unreadOnly || category ? t("noneMatch") : t("empty")}
            />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {feed.map((item) => (
                  <li key={item.id}>
                    <NotificationRow item={item} onOpen={markRead} showChannels />
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
                {hasMore && (
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)}>
                    {t("loadMore")}
                  </Button>
                )}
                <div className="ms-auto flex items-center gap-3">
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRead("customer")}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      <CheckCheck className="size-4" aria-hidden />
                      {t("markAllRead")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => clear("customer")}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger hover:underline"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t("clearAll")}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <DeliveryLog
          rows={log}
          hasMore={hasMore}
          onMore={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line text-body hover:bg-surface-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-pill bg-surface-muted text-muted">
        <BellOff className="size-5" aria-hidden />
      </span>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

/**
 * The delivery log. Deliberately plain: it is a table of what happened, and the
 * one column that earns its place is `reason` — a suppressed row without a
 * reason is just an absence, which is what the log exists to replace.
 */
function DeliveryLog({
  rows,
  hasMore,
  onMore,
}: {
  rows: NotificationDispatch[];
  hasMore: boolean;
  onMore: () => void;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const copy = useNotificationCopy();

  return (
    <section className="rounded-panel border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h3 className="text-sm font-bold text-ink">{t("logTitle")}</h3>
        <p className="mt-0.5 text-xs text-muted">{t("logHint")}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState text={t("logEmpty")} />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const Icon = CHANNEL_ICON[row.channel];
              const { title } = copy(dispatchRenderable(row));
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-body">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t(`channel.${row.channel}`)} · {row.to} ·{" "}
                      {format.relativeTime(new Date(row.at))}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-bold",
                        DISPATCH_CLASS[row.status],
                      )}
                    >
                      {t(`dispatch.${row.status}`)}
                    </span>
                    {row.reason && (
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {t(`reason.${row.reason}`)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="border-t border-line p-4">
              <Button size="sm" variant="outline" onClick={onMore}>
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
