"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import type { Order, VendorSettlement } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";

/**
 * CommissionStatement — one settlement period, itemised (Phase 8, G16/G17).
 *
 * The spec asks the restaurant for a "commission statement" and the admin for
 * "details". Those are the same document read by two people, so it is one
 * component: the restaurant checking what was deducted and the finance desk
 * checking what it is about to pay must be looking at identical arithmetic, and two
 * tables is how they stop being identical.
 *
 * Every figure is read off `order.lifecycle.financials.commission` — the record
 * stamped at completion — and never recomputed here. The footer is the settlement's
 * own totals, not a sum of the rows above it: if the two ever disagreed, summing
 * the rows would hide it, and showing the settlement's number is what makes the
 * disagreement visible.
 *
 * `linkOrders` is off for the restaurant because `/admin/orders/[id]` is not their
 * surface; the row still names the order so a support call has a reference.
 */
export function CommissionStatement({
  settlement,
  orders,
  linkOrders = false,
}: {
  settlement: VendorSettlement;
  /** The completed orders behind the period, newest first. */
  orders: Order[];
  linkOrders?: boolean;
}) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const currency = settlement.currency as CurrencyCode;
  const money = (n: number) => formatPrice(n, currency);

  if (orders.length === 0) {
    return (
      <p className="rounded-field bg-surface-muted p-3 text-sm text-muted">
        {t("statementNoOrders")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <caption className="sr-only">
          {t("statementCaption", { period: settlement.periodRef })}
        </caption>
        <thead>
          <tr className="border-b border-line text-start text-xs font-semibold text-muted">
            <th scope="col" className="py-2 pe-3 text-start font-semibold">
              {t("colOrder")}
            </th>
            <th scope="col" className="py-2 pe-3 text-start font-semibold">
              {t("colDate")}
            </th>
            <th scope="col" className="py-2 pe-3 text-end font-semibold">
              {t("colGross")}
            </th>
            <th scope="col" className="py-2 pe-3 text-end font-semibold">
              {t("colCommissionable")}
            </th>
            <th scope="col" className="py-2 pe-3 text-end font-semibold">
              {t("colRate")}
            </th>
            <th scope="col" className="py-2 pe-3 text-end font-semibold">
              {t("colCommission")}
            </th>
            <th scope="col" className="py-2 text-end font-semibold">
              {t("colNet")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((order) => {
            const c = order.lifecycle.financials!.commission;
            return (
              <tr key={order.id}>
                <td className="py-2.5 pe-3 font-mono text-xs">
                  {linkOrders ? (
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink">{order.orderNumber}</span>
                  )}
                </td>
                <td className="py-2.5 pe-3 text-xs text-muted">
                  {format.dateTime(new Date(order.lifecycle.financials!.settledAt), {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td className="py-2.5 pe-3 text-end tabular-nums text-body">
                  {money(c.grossAmount)}
                </td>
                <td className="py-2.5 pe-3 text-end tabular-nums text-body">
                  {money(c.commissionableAmount)}
                </td>
                <td className="py-2.5 pe-3 text-end tabular-nums text-muted">
                  {Math.round(c.rate * 100)}%
                </td>
                <td className="py-2.5 pe-3 text-end tabular-nums text-danger">
                  − {money(c.commissionAmount)}
                </td>
                <td className="py-2.5 text-end font-semibold tabular-nums text-ink">
                  {money(c.vendorNetAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* The settlement's own totals, deliberately not a sum of the rows — see
            the component note. */}
        <tfoot>
          <tr className="border-t-2 border-line font-bold">
            <td className="py-2.5 pe-3 text-xs uppercase tracking-wide text-muted" colSpan={2}>
              {t("statementTotal", { count: settlement.orderCount })}
            </td>
            <td className="py-2.5 pe-3 text-end tabular-nums text-ink">
              {money(settlement.grossAmount)}
            </td>
            <td className="py-2.5 pe-3 text-end tabular-nums text-ink">
              {money(settlement.commissionableAmount)}
            </td>
            <td className="py-2.5 pe-3" />
            <td className="py-2.5 pe-3 text-end tabular-nums text-danger">
              − {money(settlement.commissionAmount)}
            </td>
            <td className="py-2.5 text-end tabular-nums text-primary">
              {money(settlement.netPayable - settlement.adjustmentTotal)}
            </td>
          </tr>
          {/* Corrections sit below the food money rather than inside it: a goodwill
              credit is not something a restaurant sold. */}
          {settlement.adjustments.map((adjustment) => (
            <tr key={adjustment.id} className="text-xs">
              <td className="py-2 pe-3 text-muted" colSpan={6}>
                {adjustment.label}
                {adjustment.reason && (
                  <span className="text-muted"> · {adjustment.reason}</span>
                )}
              </td>
              <td
                className={
                  adjustment.amount < 0
                    ? "py-2 text-end font-semibold tabular-nums text-danger"
                    : "py-2 text-end font-semibold tabular-nums text-fresh-600"
                }
              >
                {adjustment.amount < 0 ? "− " : "+ "}
                {money(Math.abs(adjustment.amount))}
              </td>
            </tr>
          ))}
          {settlement.adjustments.length > 0 && (
            <tr className="border-t border-line font-bold">
              <td className="py-2.5 pe-3 text-xs uppercase tracking-wide text-muted" colSpan={6}>
                {t("statementPayable")}
              </td>
              <td className="py-2.5 text-end tabular-nums text-primary">
                {money(settlement.netPayable)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
