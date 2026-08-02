"use client";

import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Printer, Plus } from "lucide-react";
import type { PosSale } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { Modal } from "@/frontend/components/ui/modal";
import { Button } from "@/frontend/components/ui/button";

/**
 * PosReceiptDialog — the post-sale receipt. Confirms the tender, itemises the
 * ticket and offers a (simulated) print and a one-tap new sale. Printing is a
 * stub toast in the prototype — no real device.
 */
export function PosReceiptDialog({
  sale,
  currency,
  onNewSale,
}: {
  sale: PosSale | null;
  currency: CurrencyCode;
  onNewSale: () => void;
}) {
  const t = useTranslations("pos");
  const format = useFormatter();

  if (!sale) return null;

  const { pricing, payment } = sale;

  return (
    <Modal open onClose={onNewSale} labelledBy="pos-receipt-title" className="sm:max-w-sm">
      <div className="flex flex-col items-center gap-1.5 border-b border-line px-5 pb-4 pt-6 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-pill bg-fresh/15 text-fresh-600">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 id="pos-receipt-title" className="text-h4 font-bold text-ink">
          {t("receiptTitle")}
        </h2>
        <p className="text-sm text-muted">{t("receiptSubtitle")}</p>
      </div>

      <div className="space-y-3 px-5 py-4 text-sm">
        {/* Meta */}
        <div className="flex items-center justify-between font-semibold text-ink">
          <span className="text-muted">{t("saleNumber")}</span>
          <span className="tabular-nums">{sale.saleNumber}</span>
        </div>
        <div className="flex items-center justify-between text-body">
          <span>{t(`orderType.${sale.orderType}`)}</span>
          <span>
            {sale.tableLabel
              ? t("tableShort", { label: sale.tableLabel })
              : format.dateTime(new Date(sale.soldAt), {
                  hour: "numeric",
                  minute: "numeric",
                })}
          </span>
        </div>

        {/* Lines */}
        <ul className="space-y-1.5 border-y border-dashed border-line py-3">
          {sale.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-body">
                <span className="font-semibold text-ink tabular-nums">
                  {line.quantity}×
                </span>{" "}
                {line.name}
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">
                {formatPrice(line.unitPrice * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>

        {/* Totals */}
        <dl className="space-y-1">
          <RowLine label={t("subtotal")} value={formatPrice(pricing.subtotal, currency)} />
          {pricing.discount > 0 && (
            <RowLine
              label={t("discount")}
              value={`− ${formatPrice(pricing.discount, currency)}`}
            />
          )}
          <RowLine
            label={`${pricing.taxLabel} (${Math.round(pricing.taxRate * 100)}%)`}
            value={formatPrice(pricing.tax, currency)}
          />
          <div className="flex items-center justify-between border-t border-line pt-1.5">
            <dt className="font-bold text-ink">{t("total")}</dt>
            <dd className="text-base font-extrabold text-ink tabular-nums">
              {formatPrice(pricing.total, currency)}
            </dd>
          </div>
        </dl>

        {/* Payment */}
        <div className="space-y-1 rounded-card bg-surface-muted px-3.5 py-2.5">
          <RowLine label={t("paidWith")} value={t(`method.${payment.method}`)} />
          {payment.method === "cash" && payment.tendered != null && (
            <>
              <RowLine label={t("tendered")} value={formatPrice(payment.tendered, currency)} />
              <RowLine label={t("change")} value={formatPrice(payment.change ?? 0, currency)} />
            </>
          )}
          {payment.method === "card" && payment.cardLast4 && (
            <RowLine label={t("card")} value={`•••• ${payment.cardLast4}`} />
          )}
        </div>

        <p className="text-center text-xs text-muted">
          {t("cashier")}: {sale.cashierName}
        </p>
      </div>

      <div className="flex gap-2 border-t border-line px-5 py-4">
        <Button
          variant="outline"
          size="md"
          className="flex-1"
          onClick={() => toast.success(t("receiptPrinted"))}
        >
          <Printer className="size-4.5" aria-hidden />
          {t("printReceipt")}
        </Button>
        <Button size="md" className="flex-1" onClick={onNewSale}>
          <Plus className="size-4.5" aria-hidden />
          {t("newSale")}
        </Button>
      </div>
    </Modal>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-body">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
