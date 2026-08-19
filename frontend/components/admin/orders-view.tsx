"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  Banknote,
  Bike,
  Inbox,
  Search,
  Store,
  X,
} from "lucide-react";
import type {
  FulfillmentType,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useOrders } from "@/stores/orders";
import { stuckReason } from "@/lib/order-lifecycle";
import {
  ALL_ORDER_STATUSES,
  EMPTY_ORDER_QUERY,
  ORDER_DATE_RANGES,
  ORDER_STATUS_GROUPS,
  countByGroup,
  filterOrders,
  isEmptyQuery,
  type OrderDateRange,
  type OrderQuery,
} from "@/lib/order-search";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { cn } from "@/lib/utils";

/** How often the list re-reads the clock — only "needs attention" depends on it. */
const TICK_MS = 5000;

/** Rows rendered before "show more". An operations list is long by nature. */
const PAGE = 25;

/**
 * AdminOrders — every order on the platform, searchable (Phase 4, G14).
 *
 * The live board answers "what is happening right now"; this answers "find me
 * *that* order" — the question a support call actually opens with. They are
 * different jobs, which is why this is a second surface over the same store
 * rather than more columns on the first: the board is worked oldest-first and
 * shows only what is in flight, and a desk looking for last Tuesday's refund
 * needs neither of those properties.
 *
 * All of the filtering lives in `lib/order-search` as one pure predicate, so this
 * component holds a query object and renders rows. Nothing about the lifecycle is
 * re-derived here: statuses come from the machine's own groups and "needs
 * attention" is the same `stuckReason` the live board flags with.
 */
export function AdminOrders() {
  const t = useTranslations("admin");
  const to = useTranslations("order");
  const format = useFormatter();

  const hydrated = useOrders((s) => s.hydrated);
  const orders = useOrders((s) => s.orders);

  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState<OrderQuery>(EMPTY_ORDER_QUERY);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    useOrders.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const matched = useMemo(() => filterOrders(orders, query, now), [orders, query, now]);
  const counts = useMemo(() => countByGroup(orders, query, now), [orders, query, now]);

  /** Any filter change starts the list from the top again. */
  function patch(next: Partial<OrderQuery>) {
    setQuery((q) => ({ ...q, ...next }));
    setLimit(PAGE);
  }

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
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
          <h1 className="text-h2 text-ink">{t("ordersTitle")}</h1>
          <p className="text-sm text-muted">{t("ordersSubtitle")}</p>
        </div>
        <p className="text-sm font-semibold text-muted tabular-nums">
          {t("ordersCount", { count: matched.length })}
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder={t("ordersSearchPlaceholder")}
          aria-label={t("ordersSearchLabel")}
          className="ps-10"
        />
      </div>

      {/* Quick status groups */}
      <div className="flex flex-wrap gap-1.5">
        <Chip
          label={t("ordersAll")}
          count={matched.length}
          active={query.group === null && query.status === null}
          onClick={() => patch({ group: null, status: null })}
        />
        {ORDER_STATUS_GROUPS.map((group) => (
          <Chip
            key={group}
            label={t(`group.${group}`)}
            count={counts[group]}
            active={query.group === group}
            onClick={() => patch({ group: query.group === group ? null : group, status: null })}
          />
        ))}
      </div>

      {/* The precise filters. Each is independent; together they compose. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label={t("filterStatus")}
          value={query.status ?? ""}
          onChange={(value) => patch({ status: (value || null) as OrderStatus | null })}
          options={ALL_ORDER_STATUSES.map((status) => [status, to(`status.${status}`)])}
          anyLabel={t("filterAnyStatus")}
        />
        <Select
          label={t("filterPayment")}
          value={query.payment ?? ""}
          onChange={(value) => patch({ payment: (value || null) as PaymentMethod | null })}
          options={(["cash", "card", "wallet"] as PaymentMethod[]).map((method) => [
            method,
            to(`payment.${method}`, { last4: "••••" }),
          ])}
          anyLabel={t("filterAnyPayment")}
        />
        <Select
          label={t("filterPaymentStatus")}
          value={query.paymentStatus ?? ""}
          onChange={(value) =>
            patch({ paymentStatus: (value || null) as PaymentStatus | null })
          }
          options={(["pending", "paid", "failed", "refunded"] as PaymentStatus[]).map(
            (status) => [status, to(`paymentStatus.${status}`)],
          )}
          anyLabel={t("filterAnyPaymentStatus")}
        />
        <Select
          label={t("filterFulfillment")}
          value={query.fulfillment ?? ""}
          onChange={(value) =>
            patch({ fulfillment: (value || null) as FulfillmentType | null })
          }
          options={(["delivery", "pickup"] as FulfillmentType[]).map((kind) => [
            kind,
            t(`fulfillment.${kind}`),
          ])}
          anyLabel={t("filterAnyFulfillment")}
        />
        <Select
          label={t("filterRange")}
          value={query.range}
          onChange={(value) => patch({ range: (value || "all") as OrderDateRange })}
          options={ORDER_DATE_RANGES.map((range) => [range, t(`range.${range}`)])}
        />
      </div>

      {!isEmptyQuery(query) && (
        <button
          type="button"
          onClick={() => {
            setQuery(EMPTY_ORDER_QUERY);
            setLimit(PAGE);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          {t("ordersClear")}
        </button>
      )}

      {/* Results */}
      {matched.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("ordersEmpty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("ordersEmptyHint")}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {visible.map((order) => (
              <OrderRow key={order.id} order={order} now={now} format={format} />
            ))}
          </ul>
          {matched.length > visible.length && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted tabular-nums">
                {t("ordersShowing", { shown: visible.length, total: matched.length })}
              </p>
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                {t("ordersMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One order in the list.
 *
 * Six facts, chosen because they are the ones a caller can quote: the reference,
 * where it is, who cooked it, who is carrying it, what it cost and how it was
 * paid. Everything else is one tap away rather than crammed in.
 */
function OrderRow({
  order,
  now,
  format,
}: {
  order: Order;
  now: number;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("admin");
  const to = useTranslations("order");
  const stuck = stuckReason(order, now);

  return (
    <li>
      <Link
        href={`/admin/orders/${order.id}`}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 transition-colors hover:bg-surface-muted",
          stuck && "bg-danger/5",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{order.orderNumber}</span>
            <OrderStatusChip status={order.status} size="sm" />
            {stuck && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                <AlertTriangle className="size-3" aria-hidden />
                {t(stuck.key, { minutes: stuck.minutes })}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <Store className="size-3" aria-hidden />
            {order.vendor.name}
            <span aria-hidden>·</span>
            {order.contact.name}
            <span aria-hidden>·</span>
            {t(`fulfillment.${order.fulfillment}`)}
            <span aria-hidden>·</span>
            {format.relativeTime(new Date(order.placedAt), now)}
          </span>
        </span>

        {order.lifecycle.rider && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-body">
            <Bike className="size-3" aria-hidden />
            {order.lifecycle.rider.name}
          </span>
        )}

        <span className="text-end">
          <span className="block text-sm font-bold text-ink tabular-nums">
            {formatPrice(order.pricing.total, order.pricing.currency as CurrencyCode)}
          </span>
          <span
            className={cn(
              "block text-[11px] font-semibold",
              order.payment.status === "paid"
                ? "text-fresh-600"
                : order.payment.status === "refunded"
                  ? "text-primary"
                  : "text-muted",
            )}
          >
            {order.payment.method === "cash" && (
              <Banknote className="me-0.5 inline size-3" aria-hidden />
            )}
            {to(`paymentStatus.${order.payment.status}`)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A filter chip with its count. */
function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line text-body hover:bg-surface-muted",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 text-xs font-bold tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-surface-muted text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * A labelled native select. Native on purpose: five of these on one toolbar, on a
 * desk that is often driven by keyboard, is exactly what the platform control is
 * good at.
 */
function Select({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  /** Shown as the empty option; omitted when every option is a real choice. */
  anyLabel?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus-visible:border-primary"
      >
        {anyLabel && <option value="">{anyLabel}</option>}
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
