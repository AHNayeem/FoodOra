"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Banknote,
  ChevronDown,
  Clock,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { VendorEarnings } from "@/services/finance";
import { getVendorEarnings } from "@/services/finance";
import { useOrders } from "@/stores/orders";
import { adjustmentsForVendor, usePayouts } from "@/stores/payouts";
import { formatPrice } from "@/lib/format";
import { CommissionStatement } from "@/components/finance/commission-statement";
import { SettlementStatusChip } from "@/components/finance/settlement-status-chip";
import { cn } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";
import { StatCard } from "./stat-card";

/**
 * EarningsView — the restaurant's money (Phase 8, G16).
 *
 * The prototype published a commission rate in its marketing copy, deducted
 * commission on every completed order from Phase 2, and then had nowhere for a
 * restaurant to *read* any of it: the overview showed one three-figure summary and
 * the settlement periods behind it were invisible. This screen is the spec's list —
 * earnings, commission statements, settlement history, payout history, pending and
 * available balances, gross, commission and net — over the records that already
 * existed.
 *
 * It computes nothing. `services/finance.getVendorEarnings` resolves the order book
 * and `lib/settlement` does the arithmetic, which is the same path the overview's
 * earnings panel takes: two readings of one data set rather than two sums. The
 * balances in particular are worth stating — **pending** is money from the week
 * still running and **available** is money from closed, unpaid weeks. Collapsing
 * them into one "balance" is what makes a restaurant think they are owed money the
 * platform does not consider payable yet.
 *
 * The payout column is read-only here on purpose. A restaurant does not run its own
 * payout; the desk does, on `/admin/payouts`, and this screen shows the result.
 */
export function EarningsView() {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { vendor } = useDashboard();

  const [data, setData] = useState<VendorEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  // The clock decides which period is still open, so it is state rather than
  // something read during render.
  const [now, setNow] = useState(() => Date.now());

  const liveOrders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);

  const payouts = usePayouts((s) => s.payouts);
  const adjustments = usePayouts((s) => s.adjustments);
  const payoutsHydrated = usePayouts((s) => s.hydrated);

  useEffect(() => {
    useOrders.persist.rehydrate();
    usePayouts.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const mine = useMemo(
    () => adjustmentsForVendor(adjustments, vendor.id),
    [adjustments, vendor.id],
  );

  // Both stores feed the answer, so neither may be read before it has hydrated —
  // a settlement built without the payouts would report a paid week as owed.
  const ready = ordersHydrated && payoutsHydrated;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getVendorEarnings({
      vendorId: vendor.id,
      live: liveOrders,
      payouts,
      adjustments: mine,
      now,
    })
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ready, vendor.id, liveOrders, payouts, mine, now]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  const currency = data.currency as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);
  const { balance } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("earningsTitle")}</h1>
          <p className="text-sm text-muted">{t("earningsSubtitle")}</p>
        </div>
        <span className="rounded-pill bg-surface-muted px-3 py-1.5 text-sm font-semibold text-muted">
          {t("commissionRate", { rate: Math.round(data.rate * 100) })}
        </span>
      </header>

      {/* The two balances, first, because they are what a restaurant opens this
          page to see — and separated, because they are not the same money. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("kpiAvailable")}
          value={money(balance.available)}
          icon={Wallet}
          hint={t("kpiAvailableHint")}
        />
        <StatCard
          label={t("kpiPending")}
          value={money(balance.pending)}
          icon={Clock}
          hint={t("kpiPendingHint")}
        />
        <StatCard
          label={t("kpiPaid")}
          value={money(balance.paid)}
          icon={Landmark}
          hint={t("kpiPaidHint")}
        />
        <StatCard
          label={t("kpiGross")}
          value={money(balance.grossAmount)}
          icon={Banknote}
          hint={t("kpiGrossHint", { count: balance.orderCount })}
        />
      </div>

      {/* Gross, what the platform took, what is left — one sentence read left to
          right, over every settled period. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-ink">{t("lifetimeTitle")}</h2>
        {balance.orderCount === 0 ? (
          <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("earningsEmpty")}
          </p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Figure label={t("figureGross")} value={money(balance.grossAmount)} />
            <Figure
              label={t("figureCommission")}
              value={`− ${money(balance.commissionAmount)}`}
              tone="danger"
            />
            <Figure
              label={t("figureNet")}
              value={money(balance.netAmount)}
              tone="primary"
            />
          </dl>
        )}
      </section>

      {/* Settlement history — one row per week, expandable into its statement. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-ink">{t("settlementsTitle")}</h2>
        {data.statements.length === 0 ? (
          <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("settlementsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.statements.map(({ settlement, orders }) => {
              const open = openPeriod === settlement.periodRef;
              return (
                <li key={settlement.id} className="py-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenPeriod(open ? null : settlement.periodRef)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-field px-1 py-3 text-start transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-ink">
                          {settlement.periodRef}
                        </span>
                        <SettlementStatusChip status={settlement.status} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {format.dateTime(new Date(settlement.periodStart), {
                          day: "numeric",
                          month: "short",
                        })}
                        {" – "}
                        {format.dateTime(new Date(settlement.periodEnd), {
                          day: "numeric",
                          month: "short",
                        })}
                        {" · "}
                        {t("ordersCount", { count: settlement.orderCount })}
                        {settlement.payoutRef && ` · ${settlement.payoutRef}`}
                      </span>
                    </span>
                    <span className="text-end">
                      <span className="block text-sm font-bold text-ink tabular-nums">
                        {money(settlement.netPayable)}
                      </span>
                      <span className="block text-xs text-muted tabular-nums">
                        − {money(settlement.commissionAmount)}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted transition-transform",
                        open && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <div className="pb-4 pt-1">
                      <CommissionStatement settlement={settlement} orders={orders} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Payout history — what actually arrived, and when. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-ink">{t("payoutHistoryTitle")}</h2>
        {data.payouts.length === 0 ? (
          <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("payoutHistoryEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-field bg-fresh/10 text-fresh-600">
                  <Receipt className="size-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-bold text-ink">
                    {payout.payoutRef}
                  </span>
                  <span className="block text-xs text-muted">
                    {payout.periodRef} · {t(`method.${payout.method}`)} ·{" "}
                    {format.dateTime(new Date(payout.paidAt), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </span>
                <span className="text-sm font-bold text-fresh-600 tabular-nums">
                  + {formatPrice(payout.amount, payout.currency as CurrencyCode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One figure in the earnings statement. Grouped as a `<dl>` because gross,
 * commission and net are one sentence, not three KPIs.
 */
function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "danger";
}) {
  return (
    <div className="rounded-field bg-surface-muted p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-extrabold tabular-nums",
          tone === "primary" ? "text-primary" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
