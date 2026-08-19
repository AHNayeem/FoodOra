"use client";

import { useTranslations } from "next-intl";
import { Banknote } from "lucide-react";
import type { DeliveryPayout } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { formatPrice } from "@/lib/format";

/**
 * PayoutBreakdown — what a delivery paid, itemised.
 *
 * Shared by the synthesised trip's receipt and a real order's handoff screen, so
 * a rider is shown their money the same way whichever kind of work they just
 * finished (G39). The numbers are the same numbers too: both sides go through
 * `computePayout`, and a real order's payout is the one stamped on its financials
 * at completion — there is no second earnings display with its own arithmetic.
 *
 * Zero lines are dropped rather than shown as 0: a trip with no peak uplift and
 * no tip did not "earn 0 in tips", it simply had none.
 */
export function PayoutBreakdown({
  payout,
  cashCollected = 0,
  className,
}: {
  payout: DeliveryPayout;
  /** Cash the rider is holding from this work, if any. */
  cashCollected?: number;
  className?: string;
}) {
  const t = useTranslations("delivery");
  const currency = payout.currency as CurrencyCode;

  const rows: [string, number][] = [
    ["payoutBase", payout.baseFare],
    ["payoutDistance", payout.distanceFee],
    ["payoutPeak", payout.peakBonus],
    ["payoutBatch", payout.batchBonus],
    ["payoutTip", payout.tip],
  ];

  return (
    <section className={className}>
      <h2 className="text-sm font-bold text-ink">{t("payoutBreakdown")}</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {rows
          .filter(([, amount]) => amount > 0)
          .map(([key, amount]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-body">{t(key)}</dt>
              <dd className="font-semibold text-ink">{formatPrice(amount, currency)}</dd>
            </div>
          ))}
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="font-bold text-ink">{t("payoutTotal")}</dt>
          <dd className="font-extrabold text-ink">
            {formatPrice(payout.total, currency)}
          </dd>
        </div>
      </dl>
      {cashCollected > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-field bg-surface-alt p-3 text-xs text-body">
          <Banknote className="mt-0.5 size-4 shrink-0 text-accent-600" aria-hidden />
          {t("cashHeldNote", { amount: formatPrice(cashCollected, currency) })}
        </p>
      )}
    </section>
  );
}
