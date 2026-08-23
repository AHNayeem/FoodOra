"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Plus, Receipt, Send } from "lucide-react";
import type { Order, RiderSettlement, VendorSettlement } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import type { PayoutStatement } from "@/services/finance";
import { getPayoutStatement } from "@/services/finance";
import { useAuth } from "@/stores/auth";
import { useOrders } from "@/stores/orders";
import { usePayouts } from "@/stores/payouts";
import { isPayable } from "@/lib/settlement";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CommissionStatement } from "@/components/finance/commission-statement";
import { SettlementStatusChip } from "@/components/finance/settlement-status-chip";

/**
 * AdminPayoutDetail — one settlement, and everything needed to pay it (Phase 8,
 * G17).
 *
 * A route rather than an expander, for the same reason `/admin/restaurants/[id]` is
 * one: a payout is a decision somebody may need to link a colleague to, and the
 * paperwork behind a transfer does not fit beside forty other rows.
 *
 * The vendor half reuses `CommissionStatement` — the *same* component the restaurant
 * reads on its own earnings page. That is the point: the desk about to send money and
 * the restaurant about to receive it are looking at one document, so there is no
 * version of this screen where the two disagree.
 *
 * The rider half cannot reuse it, because a courier's week is not a commission
 * statement: it is fares, bonuses and tips, less the doorstep cash they are still
 * holding. It gets its own table for that reason and no other — the arithmetic is
 * genuinely different, and `RiderSettlement` carries it already itemised.
 */
export function AdminPayoutDetail({ settlementId }: { settlementId: string }) {
  const t = useTranslations("finance");
  const format = useFormatter();

  const [data, setData] = useState<PayoutStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
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
  const adjust = usePayouts((s) => s.adjust);

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
    getPayoutStatement({
      settlementId,
      live: orders,
      payouts,
      riderPayouts,
      adjustments,
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
  }, [ready, settlementId, orders, payouts, riderPayouts, adjustments, now]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-pill bg-surface" />
        <div className="h-96 animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="rounded-card border border-line bg-surface p-6 text-sm text-body">
          {t("notFound")}
        </p>
      </div>
    );
  }

  const { settlement } = data;
  const currency = settlement.currency as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);
  const payable = isPayable(settlement);

  function handlePay() {
    const result =
      data!.kind === "vendor"
        ? payVendor(data!.settlement as VendorSettlement, adminName)
        : payRider(data!.settlement as RiderSettlement, adminName);
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

  function handleAdjust() {
    if (data!.kind !== "vendor") return;
    const parsed = Number(amount);
    const result = adjust({
      vendorId: (data!.settlement as VendorSettlement).vendorId,
      periodRef: settlement.periodRef,
      label,
      amount: parsed,
      reason,
      by: adminName,
    });
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    setAdjusting(false);
    setLabel("");
    setAmount("");
    setReason("");
    toast.success(t("adjustmentAdded"));
  }

  return (
    <div className="space-y-5">
      <BackLink />

      <header className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h2 text-ink">
                {data.kind === "vendor"
                  ? (settlement as VendorSettlement).vendorName
                  : (settlement as RiderSettlement).riderName}
              </h1>
              <SettlementStatusChip status={settlement.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              <span className="font-mono font-semibold">{settlement.periodRef}</span>
              {" · "}
              {format.dateTime(new Date(settlement.periodStart), {
                day: "numeric",
                month: "short",
              })}
              {" – "}
              {format.dateTime(new Date(settlement.periodEnd), {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              {t(data.kind === "vendor" ? "payeeVendorLabel" : "payeeRiderLabel")}
            </p>
          </div>
          <div className="text-end">
            <p className="text-xs font-semibold text-muted">{t("netPayable")}</p>
            <p className="text-2xl font-extrabold tabular-nums text-ink">
              {money(settlement.netPayable)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {payable ? (
            <Button size="sm" onClick={handlePay}>
              <Send className="size-4" aria-hidden />
              {t("paySettlement")}
            </Button>
          ) : (
            <span className="inline-flex items-center rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted">
              {settlement.status === "paid" ? t("alreadyPaid") : t("notPayable")}
            </span>
          )}
          {/* Corrections belong to the vendor ledger only: a rider's week has no
              adjustment concept, and offering one here would imply a record
              `RiderSettlement` does not carry. */}
          {data.kind === "vendor" && settlement.status !== "paid" && (
            <Button size="sm" variant="outline" onClick={() => setAdjusting(true)}>
              <Plus className="size-4" aria-hidden />
              {t("addAdjustment")}
            </Button>
          )}
        </div>

        {data.payout && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-field bg-fresh/10 p-3 text-sm text-fresh-600">
            <Receipt className="size-4 shrink-0" aria-hidden />
            {t("paidOn", {
              payout: data.payout.payoutRef,
              method: t(`method.${data.payout.method}`),
              date: format.dateTime(new Date(data.payout.paidAt), {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              by: data.payout.paidBy,
            })}
          </p>
        )}
      </header>

      {data.kind === "vendor" ? (
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold text-ink">{t("statementTitle")}</h2>
          <CommissionStatement
            settlement={settlement as VendorSettlement}
            orders={data.orders}
            linkOrders
          />
        </section>
      ) : (
        <RiderBreakdown settlement={settlement as RiderSettlement} orders={data.orders} />
      )}

      <Modal
        open={adjusting}
        onClose={() => setAdjusting(false)}
        labelledBy="adjust-title"
        className="p-5"
      >
        <h2 id="adjust-title" className="text-h3 text-ink">
          {t("adjustTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">{t("adjustBody")}</p>
        <div className="mt-4 space-y-3">
          <Field id="adjust-label" label={t("adjustLabelField")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("adjustLabelPlaceholder")}
              />
            )}
          </Field>
          <Field
            id="adjust-amount"
            label={t("adjustAmountField")}
            hint={t("adjustAmountHint")}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="-250"
              />
            )}
          </Field>
          <Field id="adjust-reason" label={t("adjustReasonField")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("adjustReasonPlaceholder")}
              />
            )}
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdjusting(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleAdjust}>
            {t("saveAdjustment")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function BackLink() {
  const t = useTranslations("finance");
  return (
    <Link
      href="/admin/payouts"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
    >
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t("backToPayouts")}
    </Link>
  );
}

/**
 * A courier's week, itemised.
 *
 * Read straight off `RiderSettlement`, which `lib/settlement` builds from the
 * `OrderRiderEarning` records the orders carry — the same records the rider's own
 * wallet reads. So the desk's breakdown and the courier's app show the same fares,
 * and the cash line is the same liability both are netting off.
 */
function RiderBreakdown({
  settlement,
  orders,
}: {
  settlement: RiderSettlement;
  orders: Order[];
}) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const currency = settlement.currency as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);

  const lines = useMemo(
    () => [
      { key: "baseFare", amount: settlement.baseFare },
      { key: "distanceFee", amount: settlement.distanceFee },
      { key: "peakBonus", amount: settlement.peakBonus },
      { key: "batchBonus", amount: settlement.batchBonus },
      { key: "tips", amount: settlement.tips },
    ],
    [settlement],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-ink">
          {t("riderBreakdownTitle", { count: settlement.tripCount })}
        </h2>
        <dl className="divide-y divide-line">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center justify-between py-2">
              <dt className="text-sm text-body">{t(`payoutLine.${line.key}`)}</dt>
              <dd className="text-sm font-semibold tabular-nums text-ink">
                {money(line.amount)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 font-bold">
            <dt className="text-sm text-ink">{t("riderEarned")}</dt>
            <dd className="text-sm tabular-nums text-ink">
              {money(settlement.earnedAmount)}
            </dd>
          </div>
          {/* Doorstep cash is the platform's money in the rider's pocket, so it is
              subtracted from the transfer rather than shown as an earning. */}
          <div className="flex items-center justify-between py-2">
            <dt className="text-sm text-body">{t("riderCashHeld")}</dt>
            <dd className="text-sm font-semibold tabular-nums text-danger">
              − {money(settlement.cashCollected)}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2 font-bold">
            <dt className="text-sm text-ink">{t("netPayable")}</dt>
            <dd className="text-base tabular-nums text-primary">
              {money(settlement.netPayable)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-ink">{t("riderTripsTitle")}</h2>
        {orders.length === 0 ? (
          <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
            {t("statementNoOrders")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => {
              const earning = order.lifecycle.financials!.riderEarning!;
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="min-w-0 flex-1 font-mono text-xs font-semibold text-primary hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="text-xs text-muted">
                    {format.dateTime(new Date(order.lifecycle.financials!.settledAt), {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  {earning.cashCollected > 0 && (
                    <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600">
                      {t("cashCollectedChip", { amount: money(earning.cashCollected) })}
                    </span>
                  )}
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {money(earning.payout.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
