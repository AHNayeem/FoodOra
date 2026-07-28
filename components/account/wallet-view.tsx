"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Plus,
  RotateCcw,
  Wallet as WalletIcon,
} from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { WalletTransactionType } from "@/types";
import { useWallet } from "@/stores/wallet";
import { getWallet } from "@/services/wallet";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const TXN_ICON: Record<WalletTransactionType, typeof ArrowUpRight> = {
  "top-up": ArrowDownLeft,
  payment: ArrowUpRight,
  refund: RotateCcw,
  reward: Gift,
};

const TOP_UP_PRESETS = [500, 1000, 2000, 5000];

/**
 * WalletView — the customer's wallet (Phase C3). Seeds from the mock service
 * into a persisted store, shows the balance and ledger, and supports a
 * simulated top-up that appends a credit and survives a refresh. No real
 * payment is taken.
 */
export function WalletView() {
  const t = useTranslations("account");
  const locale = useLocale();
  const currency = useWallet((s) => s.currency) as CurrencyCode;
  const balance = useWallet((s) => s.balance);
  const transactions = useWallet((s) => s.transactions);
  const hydrated = useWallet((s) => s.hydrated);
  const seeded = useWallet((s) => s.seeded);
  const seed = useWallet((s) => s.seed);
  const topUp = useWallet((s) => s.topUp);
  const [topUpOpen, setTopUpOpen] = useState(false);

  useEffect(() => {
    useWallet.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && !seeded) getWallet().then(seed);
  }, [hydrated, seeded, seed]);

  if (!hydrated || !seeded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="relative overflow-hidden rounded-panel bg-primary p-6 text-white shadow-card">
        <div className="absolute -end-8 -top-8 size-40 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80">
              <WalletIcon className="size-4" aria-hidden />
              {t("balance")}
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight">
              {formatPrice(balance, currency)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="!bg-white !text-primary hover:!bg-white/90"
            onClick={() => setTopUpOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
            {t("topUp")}
          </Button>
        </div>
      </div>

      {/* Ledger */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("transactions")}
        </h2>
        {transactions.length === 0 ? (
          <p className="rounded-panel border border-line bg-surface p-6 text-center text-sm text-muted">
            {t("transactionsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
            {transactions.map((txn) => {
              const Icon = TXN_ICON[txn.type];
              const credit = txn.amount >= 0;
              const when = new Date(txn.occurredAt).toLocaleDateString(locale, {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <li key={txn.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className={cn(
                      "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
                      credit ? "bg-fresh/15 text-fresh" : "bg-surface-muted text-muted",
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {t(`txn.${txn.type}`)}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {txn.description}
                      {txn.orderNumber ? ` · ${txn.orderNumber}` : ""} · {when}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold",
                      credit ? "text-fresh" : "text-ink",
                    )}
                  >
                    {credit ? "+" : "−"}
                    {formatPrice(Math.abs(txn.amount), currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {topUpOpen && (
        <TopUpModal
          currency={currency}
          onClose={() => setTopUpOpen(false)}
          onConfirm={(amount) => {
            topUp(amount);
            toast.success(t("topUpSuccess", { amount: formatPrice(amount, currency) }));
            setTopUpOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TopUpModal({
  currency,
  onClose,
  onConfirm,
}: {
  currency: CurrencyCode;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const t = useTranslations("account");
  const [amount, setAmount] = useState(TOP_UP_PRESETS[1]);

  return (
    <Modal open onClose={onClose} labelledBy="topup-title" className="p-6">
      <h2 id="topup-title" className="text-h3 text-ink">
        {t("addFunds")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("addFundsHint")}</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {TOP_UP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            aria-pressed={amount === preset}
            className={cn(
              "rounded-field border py-3 text-sm font-bold transition-colors",
              amount === preset
                ? "border-primary bg-primary/5 text-primary"
                : "border-line text-ink hover:bg-surface-muted",
            )}
          >
            {formatPrice(preset, currency)}
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <Button className="flex-1" onClick={() => onConfirm(amount)}>
          {t("confirmTopUp")}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </Modal>
  );
}
