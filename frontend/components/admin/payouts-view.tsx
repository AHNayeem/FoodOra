"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Bike,
  Clock,
  Inbox,
  Landmark,
  Send,
  Store,
  Wallet,
} from "lucide-react";
import type { RiderSettlement, VendorSettlement } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import type { PlatformPayouts } from "@/services/finance";
import { getPlatformPayouts } from "@/services/finance";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { usePayouts } from "@/stores/payouts";
import { isPayable, settlementTotals } from "@/lib/settlement";
import {
  EMPTY_PAYOUT_QUERY,
  countBySettlementStatus,
  filterSettlements,
  isPayableRow,
  riderSettlementHaystack,
  settlementPeriods,
  vendorSettlementHaystack,
  type PayoutQuery,
} from "@/lib/payout-search";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PayoutFilters } from "@/components/finance/payout-filters";
import { SettlementStatusChip } from "@/components/finance/settlement-status-chip";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";

/** Which ledger is on screen. */
type Payee = "vendor" | "rider";

/**
 * AdminPayouts — the platform's payout run (Phase 8, G17).
 *
 * `finance-manager` has been an admin role since the auth seed with no surface
 * behind it, and the commission Phase 2 started charging had nowhere to be paid
 * out. This is that surface: both ledgers, filtered the same way, with the totals
 * of exactly what is on screen and one action — send it.
 *
 * Three decisions worth stating.
 *
 * **Two ledgers, one screen.** A vendor settlement and a rider settlement are
 * different arithmetic (net food money less corrections; fares less the cash the
 * courier is holding) but the same *job* — a Friday afternoon of transfers — so
 * they are tabs over one query object rather than two routes. The filter, the
 * counts and the totals row are shared components for the same reason.
 *
 * **The totals row totals what is filtered.** `settlementTotals` is called over
 * the visible rows, not the whole set. A payout screen whose header quietly reports
 * the unfiltered total is the most plausibly wrong number it could show.
 *
 * **Payability is the domain's answer, not this screen's.** The button is offered
 * when `lib/settlement.isPayable` says so, and `stores/payouts` asks the same
 * function before it writes — so a row can never offer a transfer the store would
 * refuse, and a stale render cannot pay a week twice.
 */
export function AdminPayouts() {
  const t = useTranslations("finance");
  const format = useFormatter();

  const [payee, setPayee] = useState<Payee>("vendor");
  const [query, setQuery] = useState<PayoutQuery>({
    ...EMPTY_PAYOUT_QUERY,
    // Opens on the work: the reason to visit this screen is almost always a week
    // that has closed and not been paid.
    payableOnly: true,
  });
  const [data, setData] = useState<PlatformPayouts | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmRun, setConfirmRun] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const admin = useAuth((s) => s.user);
  const adminName = admin?.name ?? t("deskFallback");

  const orders = useOrders((s) => s.orders);
  const ordersHydrated = useOrders((s) => s.hydrated);

  const payouts = usePayouts((s) => s.payouts);
  const riderPayouts = usePayouts((s) => s.riderPayouts);
  const adjustments = usePayouts((s) => s.adjustments);
  const payoutsHydrated = usePayouts((s) => s.hydrated);
  const payVendor = usePayouts((s) => s.payVendor);
  const payRider = usePayouts((s) => s.payRider);
  const runVendorPayouts = usePayouts((s) => s.runVendorPayouts);
  const runRiderPayouts = usePayouts((s) => s.runRiderPayouts);

  useEffect(() => {
    useOrders.persist.rehydrate();
    usePayouts.persist.rehydrate();
    useAuth.persist.rehydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const ready = ordersHydrated && payoutsHydrated;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getPlatformPayouts({ live: orders, payouts, riderPayouts, adjustments, now })
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ready, orders, payouts, riderPayouts, adjustments, now]);

  const vendorRows = useMemo(
    () =>
      data ? filterSettlements(data.vendors, query, vendorSettlementHaystack) : [],
    [data, query],
  );
  const riderRows = useMemo(
    () => (data ? filterSettlements(data.riders, query, riderSettlementHaystack) : []),
    [data, query],
  );

  const counts = useMemo(() => {
    if (!data) return {};
    return payee === "vendor"
      ? countBySettlementStatus(data.vendors, query, vendorSettlementHaystack)
      : countBySettlementStatus(data.riders, query, riderSettlementHaystack);
  }, [data, query, payee]);

  const periods = useMemo(
    () => (data ? settlementPeriods(payee === "vendor" ? data.vendors : data.riders) : []),
    [data, payee],
  );

  // The header totals the rows on screen, so a filtered list's total is the total
  // of what is filtered.
  const visible = payee === "vendor" ? vendorRows : riderRows;
  const totals = useMemo(
    () => settlementTotals(visible, data?.currency ?? "BDT"),
    [visible, data?.currency],
  );
  const runnable = useMemo(() => visible.filter(isPayableRow), [visible]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  const currency = data.currency as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);

  function handlePayOne(settlement: VendorSettlement | RiderSettlement) {
    const result =
      payee === "vendor"
        ? payVendor(settlement as VendorSettlement, adminName)
        : payRider(settlement as RiderSettlement, adminName);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    toast.success(
      t("paidToast", {
        payout: result.payout!.payoutRef,
        amount: formatPrice(result.payout!.amount, currency),
      }),
    );
  }

  function handleRun() {
    const result =
      payee === "vendor"
        ? runVendorPayouts(vendorRows, adminName)
        : runRiderPayouts(riderRows, adminName);
    setConfirmRun(false);
    if (result.paid === 0) {
      toast.error(t("errors.settlementNotPayable"));
      return;
    }
    toast.success(
      t("runToast", { count: result.paid, amount: formatPrice(result.amount, currency) }),
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h2 text-ink">{t("payoutsTitle")}</h1>
        <p className="text-sm text-muted">{t("payoutsSubtitle")}</p>
      </header>

      {/* The platform's own side of the same book, so the desk can see what it
          took beside what it owes. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("kpiToPay")}
          value={money(totals.available)}
          icon={Wallet}
          hint={t("kpiToPayHint", { count: runnable.length })}
        />
        <StatCard
          label={t("kpiAccruing")}
          value={money(totals.pending)}
          icon={Clock}
          hint={t("kpiAccruingHint")}
        />
        <StatCard
          label={t("kpiSent")}
          value={money(totals.paid)}
          icon={Landmark}
          hint={t("kpiSentHint")}
        />
        <StatCard
          label={t("kpiPlatformTake")}
          value={formatPrice(data.platform.platformAmount, currency)}
          icon={Banknote}
          hint={t("kpiPlatformTakeHint", { count: data.platform.orderCount })}
        />
      </div>

      {/* Which ledger. */}
      <div
        role="tablist"
        aria-label={t("payeeTabs")}
        className="flex gap-1.5 overflow-x-auto"
      >
        <PayeeTab
          active={payee === "vendor"}
          onClick={() => setPayee("vendor")}
          icon={Store}
          label={t("payeeVendors")}
          count={data.vendors.length}
        />
        <PayeeTab
          active={payee === "rider"}
          onClick={() => setPayee("rider")}
          icon={Bike}
          label={t("payeeRiders")}
          count={data.riders.length}
        />
      </div>

      <PayoutFilters
        query={query}
        onChange={setQuery}
        counts={counts}
        payableCount={runnable.length}
        periods={periods}
        searchPlaceholder={
          payee === "vendor" ? t("searchVendorsPlaceholder") : t("searchRidersPlaceholder")
        }
        searchLabel={t("searchLabel")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5">
        <p className="text-sm text-body">
          {t("runSummary", { count: runnable.length, amount: money(totals.available) })}
        </p>
        <Button
          size="sm"
          disabled={runnable.length === 0}
          onClick={() => setConfirmRun(true)}
        >
          <Send className="size-4" aria-hidden />
          {t("runPayouts")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface text-muted">
            <Inbox className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{t("listEmpty")}</p>
          <p className="max-w-sm text-xs text-muted">{t("listEmptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {payee === "vendor"
            ? vendorRows.map((settlement) => (
                <Row
                  key={settlement.id}
                  id={settlement.id}
                  name={settlement.vendorName}
                  periodRef={settlement.periodRef}
                  periodStart={settlement.periodStart}
                  periodEnd={settlement.periodEnd}
                  status={settlement.status}
                  netPayable={settlement.netPayable}
                  payoutRef={settlement.payoutRef}
                  currency={settlement.currency}
                  meta={t("vendorRowMeta", {
                    count: settlement.orderCount,
                    commission: formatPrice(
                      settlement.commissionAmount,
                      settlement.currency as CurrencyCode,
                    ),
                  })}
                  payable={isPayable(settlement)}
                  onPay={() => handlePayOne(settlement)}
                  format={format}
                />
              ))
            : riderRows.map((settlement) => (
                <Row
                  key={settlement.id}
                  id={settlement.id}
                  name={settlement.riderName}
                  periodRef={settlement.periodRef}
                  periodStart={settlement.periodStart}
                  periodEnd={settlement.periodEnd}
                  status={settlement.status}
                  netPayable={settlement.netPayable}
                  payoutRef={settlement.payoutRef}
                  currency={settlement.currency}
                  meta={t("riderRowMeta", {
                    count: settlement.tripCount,
                    cash: formatPrice(
                      settlement.cashCollected,
                      settlement.currency as CurrencyCode,
                    ),
                  })}
                  payable={isPayable(settlement)}
                  onPay={() => handlePayOne(settlement)}
                  format={format}
                />
              ))}
        </ul>
      )}

      <Modal
        open={confirmRun}
        onClose={() => setConfirmRun(false)}
        labelledBy="payout-run-title"
        className="p-5"
      >
        <h2 id="payout-run-title" className="text-h3 text-ink">
          {t("runTitle")}
        </h2>
        <p className="mt-2 text-sm text-body">
          {t("runBody", { count: runnable.length, amount: money(totals.available) })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmRun(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleRun}>
            {t("confirmRun")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function PayeeTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Store;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-pill border px-3.5 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-line text-body hover:bg-surface-muted",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
      <span className="text-xs font-bold tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/**
 * One settlement row, for either payee.
 *
 * Written over the fields both sides share plus a `meta` line the caller composes,
 * rather than as two components: the row's *layout* is not what differs between a
 * restaurant and a courier, only the one sentence describing what made the number.
 */
function Row({
  id,
  name,
  periodRef,
  periodStart,
  periodEnd,
  status,
  netPayable,
  payoutRef,
  currency,
  meta,
  payable,
  onPay,
  format,
}: {
  id: string;
  name: string;
  periodRef: string;
  periodStart: string;
  periodEnd: string;
  status: VendorSettlement["status"];
  netPayable: number;
  payoutRef: string | null;
  currency: string;
  meta: string;
  payable: boolean;
  onPay: () => void;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("finance");

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5">
      <Link href={`/admin/payouts/${id}`} className="min-w-0 flex-1 group">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-ink group-hover:underline">
            {name}
          </span>
          <SettlementStatusChip status={status} />
          <span className="rounded-pill bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-body">
            {periodRef}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {format.dateTime(new Date(periodStart), { day: "numeric", month: "short" })}
          {" – "}
          {format.dateTime(new Date(periodEnd), { day: "numeric", month: "short" })}
          {" · "}
          {meta}
          {payoutRef && ` · ${payoutRef}`}
        </span>
      </Link>

      <span
        className={cn(
          "shrink-0 text-sm font-bold tabular-nums",
          netPayable < 0 ? "text-danger" : "text-ink",
        )}
      >
        {formatPrice(netPayable, currency as CurrencyCode)}
      </span>

      {payable ? (
        <Button size="sm" variant="secondary" onClick={onPay} className="shrink-0">
          {t("pay")}
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-muted">
          {status === "paid" ? t("alreadyPaid") : t("notPayable")}
        </span>
      )}
    </li>
  );
}
