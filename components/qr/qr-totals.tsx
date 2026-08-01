"use client";

import { useTranslations } from "next-intl";
import type { QrPricing } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";

/**
 * QrTotals — the shared price breakdown for a dine-in round and for the full
 * bill (Phase C12). Zero-value lines are hidden so a venue with no service
 * charge doesn't show a "Service charge 0" row.
 */
export function QrTotals({ pricing }: { pricing: QrPricing }) {
  const t = useTranslations("qr");
  const currency = pricing.currency as CurrencyCode;
  const percent = `${Math.round(pricing.serviceChargeRate * 100)}%`;
  const taxPercent = `${Math.round(pricing.taxRate * 100)}%`;

  return (
    <dl className="space-y-1.5 rounded-field bg-surface-muted p-3.5 text-sm">
      <Row label={t("subtotal")} value={formatPrice(pricing.subtotal, currency)} />
      {pricing.serviceCharge > 0 && (
        <Row
          label={t("serviceCharge", { percent })}
          value={formatPrice(pricing.serviceCharge, currency)}
        />
      )}
      {pricing.tax > 0 && (
        <Row
          label={`${pricing.taxLabel} (${taxPercent})`}
          value={formatPrice(pricing.tax, currency)}
        />
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
        <dt className="font-bold text-ink">{t("total")}</dt>
        <dd className="text-base font-extrabold text-ink">
          {formatPrice(pricing.total, currency)}
        </dd>
      </div>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
