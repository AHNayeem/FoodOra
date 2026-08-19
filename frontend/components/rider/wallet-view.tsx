"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  Banknote,
  Bike,
  Building2,
  HandCoins,
  Landmark,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import type { RemittanceMethod, RiderLedgerEntry, RiderWallet } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { useRider } from "@/stores/rider";
import { getRiderWallet, remitCash, withdrawEarnings } from "@/services/delivery";
import { REMITTANCE_METHODS } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRiderApp } from "./rider-context";
import { useRiderRecords } from "./use-rider-records";

const METHOD_ICON: Record<RemittanceMethod, typeof Landmark> = {
  agent: Building2,
  bank: Landmark,
  wallet: WalletIcon,
};

const LEDGER_ICON: Record<RiderLedgerEntry["type"], typeof Bike> = {
  trip: Bike,
  tip: HandCoins,
  bonus: HandCoins,
  "cash-collected": Banknote,
  remittance: Building2,
  withdrawal: ArrowDownToLine,
};

/**
 * RiderWalletView — `/delivery/wallet` (Phase C18; spec: Rider Wallet, Cash
 * Collection).
 *
 * The screen exists to keep two balances from being confused, so it never puts
 * them in one number: **earnings** are what the platform owes the rider, and
 * **cash in hand** is what the rider owes the platform after taking money at the
 * door. Both are settled here — cash out, or hand cash in — and both limits (the
 * platform's minimum withdrawal, the zone's cash ceiling) are enforced by the
 * seam, so the buttons can stay simple.
 */
export function RiderWalletView() {
  const t = useTranslations("delivery");
  const { rider, zone } = useRiderApp();
  const currency = zone.currency as CurrencyCode;

  const { ctx, hydrated } = useRiderRecords();
  const addRemittance = useRider((s) => s.addRemittance);
  const addWithdrawal = useRider((s) => s.addWithdrawal);

  const [wallet, setWallet] = useState<RiderWallet | null>(null);
  const [sheet, setSheet] = useState<"remit" | "withdraw" | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getRiderWallet({ riderId: rider.id, now: Date.now(), ctx }).then((data) => {
      if (active) setWallet(data);
    });
    return () => {
      active = false;
    };
  }, [rider.id, ctx, hydrated]);

  if (!wallet) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const { cash } = wallet;
  const cashPercent = Math.min(100, Math.round((cash.inHand / Math.max(cash.limit, 1)) * 100));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-ink">{t("walletTitle")}</h1>
        <p className="text-sm text-muted">{t("walletSubtitle")}</p>
      </div>

      {/* Earnings balance */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-sm font-medium text-muted">{t("availableBalance")}</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
          {formatPrice(wallet.available, currency)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("pendingToday", { amount: formatPrice(wallet.pending, currency) })}
        </p>
        <button
          type="button"
          onClick={() => setSheet("withdraw")}
          disabled={wallet.available < wallet.minWithdrawal}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-pill bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          <ArrowDownToLine className="size-4" aria-hidden />
          {t("withdraw")}
        </button>
        <p className="mt-2 text-xs text-muted">
          {t("minWithdrawal", { amount: formatPrice(wallet.minWithdrawal, currency) })}
        </p>
      </section>

      {/* Cash in hand */}
      <section
        className={cn(
          "rounded-card border p-5",
          cash.overLimit ? "border-danger/40 bg-danger/5" : "border-line bg-surface",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">{t("cashInHand")}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-extrabold tracking-tight",
                cash.overLimit ? "text-danger" : "text-ink",
              )}
            >
              {formatPrice(cash.inHand, currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheet("remit")}
            disabled={cash.inHand <= 0}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            <Banknote className="size-4" aria-hidden />
            {t("remit")}
          </button>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-line">
          <div
            className={cn("h-full rounded-pill", cash.overLimit ? "bg-danger" : "bg-accent-500")}
            style={{ width: `${cashPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {cash.overLimit
            ? t("cashLimitBody", {
                amount: formatPrice(cash.inHand, currency),
                limit: formatPrice(cash.limit, currency),
              })
            : t("cashOfLimit", {
                limit: formatPrice(cash.limit, currency),
                zone: zone.name,
              })}
        </p>
        <p className="mt-2 text-xs text-muted">{t("cashSettledNote")}</p>
      </section>

      {/* Ledger */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{t("ledgerTitle")}</h2>
        {wallet.entries.length === 0 ? (
          <p className="mt-3 text-sm text-body">{t("ledgerEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {wallet.entries.slice(0, 30).map((entry) => {
              const Icon = LEDGER_ICON[entry.type];
              const credit = entry.amount >= 0;
              return (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
                      credit ? "bg-fresh/10 text-fresh-600" : "bg-surface-muted text-muted",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {t(`ledgerType.${entry.type}`)}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {entry.description}
                      {entry.reference ? ` · ${entry.reference}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold",
                      credit ? "text-fresh-600" : "text-ink",
                    )}
                  >
                    {credit ? "+" : "−"}
                    {formatPrice(Math.abs(entry.amount), currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sheet === "remit" && (
        <AmountSheet
          title={t("remitTitle")}
          subtitle={t("remitSubtitle", { amount: formatPrice(cash.inHand, currency) })}
          confirmLabel={t("remitConfirm")}
          max={cash.inHand}
          currency={currency}
          withMethod
          onClose={() => setSheet(null)}
          onSubmit={async (amount, method) => {
            const res = await remitCash({
              riderId: rider.id,
              amount,
              method,
              position: cash,
              now: Date.now(),
            });
            if (res.error || !res.data) return t(res.error ?? "errors.generic");
            addRemittance(res.data);
            toast.success(
              t("remitDone", { amount: formatPrice(res.data.amount, currency) }),
            );
            setSheet(null);
            return null;
          }}
        />
      )}

      {sheet === "withdraw" && (
        <AmountSheet
          title={t("withdrawTitle")}
          subtitle={t("withdrawSubtitle", {
            amount: formatPrice(wallet.available, currency),
          })}
          confirmLabel={t("withdrawConfirm")}
          max={wallet.available}
          currency={currency}
          onClose={() => setSheet(null)}
          onSubmit={async (amount) => {
            const res = await withdrawEarnings({
              riderId: rider.id,
              amount,
              wallet,
              now: Date.now(),
            });
            if (res.error || !res.data) return t(res.error ?? "errors.generic");
            addWithdrawal(res.data);
            toast.success(
              t("withdrawDone", { amount: formatPrice(res.data.amount, currency) }),
            );
            setSheet(null);
            return null;
          }}
        />
      )}
    </div>
  );
}

/**
 * The sheet both money movements share: an amount, a "whole balance" shortcut,
 * and (for a hand-in) where the cash is going. Errors come back from the seam and
 * are shown in place rather than as a toast, because the rider has to fix them
 * here.
 */
function AmountSheet({
  title,
  subtitle,
  confirmLabel,
  max,
  currency,
  withMethod,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  max: number;
  currency: CurrencyCode;
  withMethod?: boolean;
  onClose: () => void;
  /** Returns a translated error, or null on success. */
  onSubmit: (amount: number, method: RemittanceMethod) => Promise<string | null>;
}) {
  const t = useTranslations("delivery");
  const [amount, setAmount] = useState(String(Math.round(max)));
  const [method, setMethod] = useState<RemittanceMethod>("agent");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(await onSubmit(Number(amount), method));
    setSubmitting(false);
  }

  return (
    <Modal open onClose={onClose} labelledBy="amount-sheet-title" className="sm:max-w-sm">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="amount-sheet-title" className="text-h3 text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 p-5">
        <label className="block">
          <span className="text-sm font-semibold text-ink">{t("amountLabel")}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={max}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            className="mt-1.5"
          />
        </label>

        <button
          type="button"
          onClick={() => setAmount(String(Math.round(max)))}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t("useWholeBalance", { amount: formatPrice(max, currency) })}
        </button>

        {withMethod && (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">{t("methodLabel")}</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REMITTANCE_METHODS.map((option) => {
                const Icon = METHOD_ICON[option];
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMethod(option)}
                    aria-pressed={method === option}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-field border py-2.5 text-xs font-semibold transition-colors",
                      method === option
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-line text-body hover:bg-surface-muted",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`method.${option}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !amount}
          className="h-12 w-full rounded-pill bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          {submitting ? t("working") : confirmLabel}
        </button>
        <p className="text-center text-xs text-muted">{t("moneySimulatedNote")}</p>
      </div>
    </Modal>
  );
}
