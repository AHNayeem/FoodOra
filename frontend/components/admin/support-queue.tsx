"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Inbox, LifeBuoy, Search } from "lucide-react";
import type { SupportCategory, SupportTicket, SupportTicketStatus } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders } from "@/stores/orders";
import { supportQueue, useSupport } from "@/stores/support";
import { SUPPORT_CATEGORIES, isTicketLive, lastTicketEvent } from "@/lib/support";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { TicketStatusChip } from "@/components/account/support-view";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";

/** The queue's quick filters. `live` is the desk's actual workload. */
const FILTERS = ["live", "all", "open", "in-review", "awaiting-customer", "decided"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(status: SupportTicketStatus, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "live":
      return isTicketLive(status);
    case "decided":
      return status === "resolved" || status === "rejected" || status === "closed";
    default:
      return status === filter;
  }
}

/**
 * AdminSupportQueue — the operations desk's disputes (Phase 5, G26).
 *
 * `customer-support` was already an admin role with nothing behind it: there was no
 * queue, so the role could sign in and find the same live board an operator sees.
 * This is the work that role exists to do.
 *
 * Ordering is `supportQueue`'s and the reason is worth keeping in mind while reading
 * the list: the live half is worked oldest-first, because the ticket that has waited
 * longest is the one that matters, and the decided half is read newest-first like any
 * other log.
 */
export function AdminSupportQueue() {
  const t = useTranslations("support");
  const ta = useTranslations("admin");
  const format = useFormatter();

  const hydrated = useSupport((s) => s.hydrated);
  const tickets = useSupport((s) => s.tickets);

  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("live");
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const queue = useMemo(() => supportQueue(tickets), [tickets]);

  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return queue.filter((ticket) => {
      if (!matchesFilter(ticket.status, filter)) return false;
      if (category && ticket.category !== category) return false;
      if (!q) return true;
      return [
        ticket.ticketNumber,
        ticket.orderNumber,
        ticket.customerName,
        ticket.customerPhone,
        ticket.vendorName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [queue, filter, category, text]);

  const stats = useMemo(() => {
    const live = queue.filter((x) => isTicketLive(x.status));
    const untouched = queue.filter((x) => x.status === "open");
    const refunded = queue.filter((x) => (x.resolution?.refundAmount ?? 0) > 0);
    return {
      live: live.length,
      untouched: untouched.length,
      refunded: refunded.length,
      refundedAmount: refunded.reduce((sum, x) => sum + (x.resolution?.refundAmount ?? 0), 0),
      currency: (queue[0]?.currency ?? "BDT") as CurrencyCode,
      // Longest wait on the desk, in minutes — the number that says whether the
      // queue is healthy, rather than how big it is.
      oldestMin: live.length
        ? Math.round((now - Date.parse(live[0].submittedAt)) / 60_000)
        : 0,
    };
  }, [queue, now]);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h2 text-ink">{t("queueTitle")}</h1>
        <p className="text-sm text-muted">{t("queueSubtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("statLive")}
          value={String(stats.live)}
          icon={LifeBuoy}
          hint={t("statLiveHint", { count: stats.untouched })}
        />
        <StatCard
          label={t("statOldest")}
          value={stats.live === 0 ? "—" : ta("minutesValue", { minutes: stats.oldestMin })}
          icon={Inbox}
          hint={t("statOldestHint")}
        />
        <StatCard
          label={t("statRefunded")}
          value={formatPrice(stats.refundedAmount, stats.currency)}
          icon={LifeBuoy}
          hint={t("statRefundedHint", { count: stats.refunded })}
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("queueSearchPlaceholder")}
          aria-label={t("queueSearchLabel")}
          className="ps-10"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
              filter === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-body hover:bg-surface-muted",
            )}
          >
            {t(`filter.${value}`)}
            <span className="text-xs font-bold tabular-nums opacity-70">
              {queue.filter((x) => matchesFilter(x.status, value)).length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryChip
          label={t("filterAnyCategory")}
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {SUPPORT_CATEGORIES.map((value) => (
          <CategoryChip
            key={value}
            label={t(`category.${value}`)}
            active={category === value}
            onClick={() => setCategory(category === value ? null : value)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("queueEmpty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("queueEmptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {visible.map((ticket) => (
            <QueueRow key={ticket.id} ticket={ticket} now={now} format={format} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({
  ticket,
  now,
  format,
}: {
  ticket: SupportTicket;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("support");
  const last = lastTicketEvent(ticket);
  const waiting = ticket.status === "open";

  return (
    <li>
      <Link
        href={`/admin/support/${ticket.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 transition-colors hover:bg-surface-muted",
          waiting && "bg-accent-50/40",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{ticket.ticketNumber}</span>
            <TicketStatusChip status={ticket.status} />
            <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-body">
              {t(`category.${ticket.category}`)}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {ticket.customerName}
            <span aria-hidden>·</span>
            {ticket.orderNumber}
            <span aria-hidden>·</span>
            {ticket.vendorName}
            <span aria-hidden>·</span>
            {t("submittedAgo", {
              ago: format.relativeTime(new Date(ticket.submittedAt), now),
            })}
          </span>
        </span>
        <span className="text-end">
          <span className="block text-sm font-bold text-ink tabular-nums">
            {formatPrice(ticket.orderTotal, ticket.currency as CurrencyCode)}
          </span>
          {last && (
            <span className="block text-[11px] text-muted">
              {t("lastUpdate", {
                ago: format.relativeTime(new Date(last.at), now),
              })}
            </span>
          )}
        </span>
      </Link>
    </li>
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line text-muted hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );
}
