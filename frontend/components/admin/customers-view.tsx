"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Ban, BadgeCheck, Banknote, Inbox, LifeBuoy, Search, Users, X } from "lucide-react";
import type { CustomerRecord } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useCustomers } from "@/stores/customers";
import { useOrders } from "@/stores/orders";
import { useSupport } from "@/stores/support";
import { buildDirectory, customerInitials } from "@/lib/customers";
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SORTS,
  EMPTY_CUSTOMER_QUERY,
  countBySegment,
  filterCustomers,
  isEmptyCustomerQuery,
  type CustomerQuery,
  type CustomerSort,
} from "@/lib/customer-search";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";

/** Rows rendered before "show more". A customer directory is long by nature. */
const PAGE = 25;

/** The window the headline "recently active" number is counted over. */
const ACTIVE_DAYS = 30;

/**
 * AdminCustomers — everyone who has ordered, and what the desk decided about them
 * (Phase 11, G15).
 *
 * The prototype could already find an *order* (`/admin/orders`, Phase 4) and a
 * *dispute* (`/admin/support`, Phase 5), but not a **person**: a support call that
 * opens "this is the fourth time this has happened to me" had no surface that could
 * answer it, and there was nowhere at all to record that somebody had been stopped
 * from ordering.
 *
 * The list is *derived*, not stored. `buildDirectory` folds the shared order and
 * ticket stores into one row per phone number and hangs the managed account record
 * off it where there is one — so a reviewer who checks out with a new number appears
 * here on the next render, and every figure on the screen is the same money the
 * books are settled from (§5.4). All of the filtering lives in `lib/customer-search`
 * as one pure predicate; this component holds a query object and renders rows.
 */
export function AdminCustomers() {
  const t = useTranslations("customers");
  const format = useFormatter();

  const hydrated = useCustomers((s) => s.hydrated);
  const accounts = useCustomers((s) => s.accounts);
  const ordersHydrated = useOrders((s) => s.hydrated);
  const orders = useOrders((s) => s.orders);
  const tickets = useSupport((s) => s.tickets);

  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState<CustomerQuery>(EMPTY_CUSTOMER_QUERY);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    useOrders.persist.rehydrate();
    useSupport.persist.rehydrate();
    useCustomers.persist.rehydrate();
  }, []);

  // A minute is plenty: nothing on this screen is a countdown — only "lapsed" and
  // the relative dates move with the clock at all.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const records = useMemo(
    () => buildDirectory(accounts, orders, tickets),
    [accounts, orders, tickets],
  );
  const matched = useMemo(
    () => filterCustomers(records, query, now),
    [records, query, now],
  );
  const counts = useMemo(
    () => countBySegment(records, query, now),
    [records, query, now],
  );

  const stats = useMemo(() => {
    const since = now - ACTIVE_DAYS * 24 * 60 * 60_000;
    const withDisputes = records.filter((r) => r.stats.tickets > 0);
    return {
      people: records.length,
      recentlyActive: records.filter(
        (r) => r.stats.lastOrderAt != null && Date.parse(r.stats.lastOrderAt) >= since,
      ).length,
      blocked: records.filter((r) => r.customer.status === "blocked").length,
      netSpend: records.reduce((sum, r) => sum + r.stats.netSpend, 0),
      currency: (records.find((r) => r.stats.orders > 0)?.stats.currency ??
        "BDT") as CurrencyCode,
      disputes: withDisputes.length,
      openDisputes: withDisputes.reduce((sum, r) => sum + r.stats.openTickets, 0),
    };
  }, [records, now]);

  /** Any filter change starts the list from the top again. */
  function patch(next: Partial<CustomerQuery>) {
    setQuery((q) => ({ ...q, ...next }));
    setLimit(PAGE);
  }

  if (!hydrated || !ordersHydrated) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const visible = matched.slice(0, limit);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <p className="text-sm font-semibold text-muted tabular-nums">
          {t("count", { count: matched.length })}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statPeople")}
          value={String(stats.people)}
          icon={Users}
          hint={t("statPeopleHint", { count: stats.recentlyActive })}
        />
        <StatCard
          label={t("statBlocked")}
          value={String(stats.blocked)}
          icon={Ban}
          hint={t("statBlockedHint")}
        />
        <StatCard
          label={t("statSpend")}
          value={formatPrice(stats.netSpend, stats.currency)}
          icon={Banknote}
          hint={t("statSpendHint")}
        />
        <StatCard
          label={t("statDisputes")}
          value={String(stats.disputes)}
          icon={LifeBuoy}
          hint={t("statDisputesHint", { count: stats.openDisputes })}
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-10"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CUSTOMER_SEGMENTS.map((segment) => (
            <button
              key={segment}
              type="button"
              aria-pressed={query.segment === segment}
              onClick={() => patch({ segment })}
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
                query.segment === segment
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {t(`segment.${segment}`)}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
                  query.segment === segment
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-muted text-muted",
                )}
              >
                {counts[segment]}
              </span>
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
            {t("sortLabel")}
          </span>
          <select
            value={query.sort}
            onChange={(e) => patch({ sort: e.target.value as CustomerSort })}
            className="h-11 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus-visible:border-primary"
          >
            {CUSTOMER_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isEmptyCustomerQuery(query) && (
        <button
          type="button"
          onClick={() => {
            setQuery(EMPTY_CUSTOMER_QUERY);
            setLimit(PAGE);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          {t("clear")}
        </button>
      )}

      {matched.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("empty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {visible.map((record) => (
              <CustomerRow
                key={record.customer.id}
                record={record}
                now={now}
                format={format}
              />
            ))}
          </ul>
          {matched.length > visible.length && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted tabular-nums">
                {t("showing", { shown: visible.length, total: matched.length })}
              </p>
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                {t("more")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One person in the list.
 *
 * Five facts, chosen because they are what a desk decides on: who they are,
 * whether they can order, how to reach them, when they last did, and what they are
 * worth. Everything else is one tap away rather than crammed in.
 */
function CustomerRow({
  record,
  now,
  format,
}: {
  record: CustomerRecord;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("customers");
  const { customer, stats } = record;
  const blocked = customer.status === "blocked";

  return (
    <li>
      <Link
        href={`/admin/customers/${customer.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 transition-colors hover:bg-surface-muted",
          blocked && "bg-danger/5",
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-sm font-bold text-body"
        >
          {customerInitials(customer.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink">{customer.name}</span>
            {blocked ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                <Ban className="size-3" aria-hidden />
                {t("chipBlocked")}
              </span>
            ) : customer.isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-fresh-50 px-2 py-0.5 text-[11px] font-semibold text-fresh-600">
                <BadgeCheck className="size-3" aria-hidden />
                {t("chipVerified")}
              </span>
            ) : (
              <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
                {t("chipUnverified")}
              </span>
            )}
            {stats.openTickets > 0 && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600">
                <LifeBuoy className="size-3" aria-hidden />
                {stats.openTickets}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span dir="ltr">{customer.phone}</span>
            <span aria-hidden>·</span>
            {stats.lastOrderAt
              ? t("lastOrder", {
                  ago: format.relativeTime(new Date(stats.lastOrderAt), now),
                })
              : t("neverOrdered")}
            {stats.lastArea && (
              <>
                <span aria-hidden>·</span>
                {stats.lastArea}
              </>
            )}
          </span>
        </span>

        <span className="text-end">
          <span className="block text-sm font-bold text-ink tabular-nums">
            {formatPrice(stats.netSpend, stats.currency as CurrencyCode)}
          </span>
          <span className="block text-[11px] font-semibold text-muted tabular-nums">
            {t("orderCount", { count: stats.orders })}
          </span>
        </span>
      </Link>
    </li>
  );
}
