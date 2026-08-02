"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Wallet, Loader2, X } from "lucide-react";
import type { PaymentMethod, PosPayment, PosPricing } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { formatPrice } from "@/frontend/lib/format";
import { cashTenderPresets, changeDue } from "@/frontend/lib/pos";
import { Modal } from "@/frontend/components/ui/modal";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

const METHODS: { key: PaymentMethod; icon: typeof Banknote }[] = [
  { key: "cash", icon: Banknote },
  { key: "card", icon: CreditCard },
  { key: "wallet", icon: Wallet },
];

/**
 * PosChargeDialog — takes payment for the current ticket. Cash shows quick
 * tender buttons + a live change calculation; card and wallet are one-tap
 * simulated captures. Emits a `PosPayment` the terminal hands to `completeSale`.
 */
export function PosChargeDialog({
  open,
  onClose,
  pricing,
  currency,
  processing,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pricing: PosPricing;
  currency: CurrencyCode;
  processing: boolean;
  onConfirm: (payment: PosPayment) => void;
}) {
  const t = useTranslations("pos");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tender, setTender] = useState<string>("");

  const total = pricing.total;
  const presets = useMemo(
    () => cashTenderPresets(total, currency),
    [total, currency],
  );

  const tenderNum = tender === "" ? 0 : Number(tender);
  const validCash = tenderNum >= total;
  const change = validCash ? changeDue(total, tenderNum) : 0;
  const canConfirm = method !== "cash" || validCash;

  function confirm() {
    if (processing || !canConfirm) return;
    if (method === "cash") {
      onConfirm({ method, tendered: tenderNum, change, cardLast4: null });
    } else if (method === "card") {
      onConfirm({ method, tendered: null, change: null, cardLast4: "4242" });
    } else {
      onConfirm({ method, tendered: null, change: null, cardLast4: null });
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="pos-charge-title" className="sm:max-w-sm">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="pos-charge-title" className="text-h4 font-bold text-ink">
          {t("payTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Amount due */}
        <div className="rounded-card bg-surface-muted px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("amountDue")}
          </p>
          <p className="mt-0.5 text-h2 font-extrabold text-ink tabular-nums">
            {formatPrice(total, currency)}
          </p>
        </div>

        {/* Method tabs */}
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMethod(key)}
              aria-pressed={method === key}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-card border py-3 text-xs font-semibold transition-colors",
                method === key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(`method.${key}`)}
            </button>
          ))}
        </div>

        {/* Method body */}
        {method === "cash" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {presets.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setTender(String(amount))}
                  className={cn(
                    "rounded-pill px-3 py-1.5 text-sm font-bold tabular-nums transition-colors",
                    tenderNum === amount
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-ink hover:bg-line/60",
                  )}
                >
                  {formatPrice(amount, currency)}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">
                {t("cashReceived")}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={tender}
                onChange={(e) => setTender(e.target.value)}
                placeholder={String(total)}
                className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-base font-bold text-ink outline-none tabular-nums focus:border-primary"
              />
            </label>
            <div className="flex items-center justify-between rounded-card border border-dashed border-line px-4 py-2.5">
              <span className="text-sm font-semibold text-body">
                {t("changeDue")}
              </span>
              <span className="text-lg font-extrabold text-fresh-600 tabular-nums">
                {formatPrice(change, currency)}
              </span>
            </div>
          </div>
        ) : (
          <p className="rounded-card bg-surface-muted px-4 py-3 text-center text-sm text-body">
            {method === "card" ? t("cardHint") : t("walletHint")}
          </p>
        )}

        <Button
          size="lg"
          onClick={confirm}
          disabled={!canConfirm || processing}
          className="w-full"
        >
          {processing ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              {t("paying")}
            </>
          ) : (
            t("confirmPayment")
          )}
        </Button>
      </div>
    </Modal>
  );
}
