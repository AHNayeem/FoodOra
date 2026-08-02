"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Plus,
  RotateCcw,
  Smartphone,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import type { CurrencyCode } from "@/frontend/config/regions";
import type { WalletTransactionType } from "@/frontend/types";
import { useWallet } from "@/frontend/stores/wallet";
import { getWallet, topUpWallet } from "@/frontend/services/wallet";
import {
  MAX_TOP_UP,
  MIN_TOP_UP,
  TOP_UP_METHODS,
  TOP_UP_PRESETS,
  type TopUpMethod,
  type WalletFilter,
  WALLET_FILTERS,
  filterTransactions,
  groupByMonth,
  isLowBalance,
  summarise,
  windowStart,
} from "@/frontend/lib/wallet";
import { formatPrice } from "@/frontend/lib/format";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Modal } from "@/frontend/components/ui/modal";
import { cn } from "@/frontend/lib/utils";

const TXN_ICON: Record<WalletTransactionType, typeof ArrowUpRight> = {
  "top-up": ArrowDownLeft,
  payment: ArrowUpRight,
  refund: RotateCcw,
  reward: Gift,
};

const METHOD_ICON: Record<TopUpMethod, typeof CreditCard> = {
  card: CreditCard,
  "mobile-banking": Smartphone,
};

/** The window the balance card summarises. */
const SUMMARY_DAYS = 30;

/**
 * WalletView — the customer's wallet (Phase C3, rebuilt in C19).
 *
 * C3 showed a balance and a list. C19 made the wallet spendable, which changes
 * what this page is for: it is now the statement behind every wallet payment,
 * so it has to answer "where did it go?" as well as "how much is left?". Hence
 * the thirty-day in/out summary, the type filter, and months as headings — a
 * ledger that pays for orders grows too long to read as one list.
 *
 * Money still only moves through the store's signed-transaction posts; a top-up
 * is authorised by `services/wallet` first, so it can be declined and can fail
 * with a reason, like the checkout gateway it stands in for.
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
  const [filter, setFilter] = useState<WalletFilter>("all");

  useEffect(() => {
    useWallet.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && !seeded) getWallet().then(seed);
  }, [hydrated, seeded, seed]);

  // The window is pinned on mount: re-reading the clock on every render would
  // make the summary shift under the reader for no benefit.
  const [since] = useState(() => windowStart(SUMMARY_DAYS));
  const summary = useMemo(() => summarise(transactions, since), [transactions, since]);
  const visible = useMemo(() => filterTransactions(transactions, filter), [transactions, filter]);
  const months = useMemo(() => groupByMonth(visible), [visible]);

  if (!hydrated || !seeded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const fmtMonth = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="relative overflow-hidden rounded-panel bg-primary p-6 text-white shadow-card">
        <div className="absolute -end-8 -top-8 size-40 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
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

        {/* Thirty-day movement — what the balance did, not just what it is. */}
        <dl className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-white/75">
              <TrendingUp className="size-3.5" aria-hidden />
              {t("moneyIn", { days: SUMMARY_DAYS })}
            </dt>
            <dd className="mt-0.5 text-lg font-bold">{formatPrice(summary.in, currency)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-white/75">
              <TrendingDown className="size-3.5" aria-hidden />
              {t("moneyOut", { days: SUMMARY_DAYS })}
            </dt>
            <dd className="mt-0.5 text-lg font-bold">{formatPrice(summary.out, currency)}</dd>
          </div>
        </dl>
      </div>

      {isLowBalance(balance) && (
        <p className="rounded-panel border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
          {t("lowBalance")}
        </p>
      )}

      {/* Ledger */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("transactions")}
          </h2>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("transactions")}>
            {WALLET_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                  filter === f
                    ? "border-primary bg-primary text-white"
                    : "border-line text-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {f === "all" ? t("filterAll") : t(`txn.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {months.length === 0 ? (
          <p className="rounded-panel border border-line bg-surface p-6 text-center text-sm text-muted">
            {filter === "all" ? t("transactionsEmpty") : t("transactionsFilterEmpty")}
          </p>
        ) : (
          <div className="space-y-5">
            {months.map((month) => (
              <div key={month.month}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  {fmtMonth(month.month)}
                </h3>
                <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
                  {month.transactions.map((txn) => {
                    const Icon = TXN_ICON[txn.type];
                    const credit = txn.amount >= 0;
                    const when = new Date(txn.occurredAt).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
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
              </div>
            ))}
          </div>
        )}
      </section>

      {topUpOpen && (
        <TopUpModal
          currency={currency}
          onClose={() => setTopUpOpen(false)}
          onDone={(amount, description) => {
            topUp(amount, description);
            toast.success(t("topUpSuccess", { amount: formatPrice(amount, currency) }));
            setTopUpOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * TopUpModal — presets, a free amount, and how it is funded. The confirm goes
 * through the simulated gateway (`topUpWallet`), so it takes a visible moment
 * and can come back with a reason it was refused; the wallet is only credited
 * once that returns.
 */
function TopUpModal({
  currency,
  onClose,
  onDone,
}: {
  currency: CurrencyCode;
  onClose: () => void;
  onDone: (amount: number, description: string) => void;
}) {
  const t = useTranslations("account");
  const [amount, setAmount] = useState<number>(TOP_UP_PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<TopUpMethod>("card");
  const [busy, setBusy] = useState(false);

  // A typed amount wins over the presets, so the two controls cannot disagree.
  const typed = custom.trim() === "" ? null : Number(custom);
  const effective = typed ?? amount;
  const valid = Number.isFinite(effective) && effective >= MIN_TOP_UP && effective <= MAX_TOP_UP;

  function confirm() {
    if (!valid || busy) return;
    setBusy(true);
    topUpWallet({ amount: effective, method }).then((res) => {
      setBusy(false);
      if (res.error || !res.data) {
        toast.error(t(res.error ?? "topUpFailed"));
        return;
      }
      onDone(res.data.amount, res.data.description);
    });
  }

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
            onClick={() => {
              setAmount(preset);
              setCustom("");
            }}
            aria-pressed={typed === null && amount === preset}
            className={cn(
              "rounded-field border py-3 text-sm font-bold transition-colors",
              typed === null && amount === preset
                ? "border-primary bg-primary/5 text-primary"
                : "border-line text-ink hover:bg-surface-muted",
            )}
          >
            {formatPrice(preset, currency)}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{t("customAmount")}</span>
        <Input
          type="number"
          inputMode="numeric"
          min={MIN_TOP_UP}
          max={MAX_TOP_UP}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={String(MIN_TOP_UP)}
          aria-invalid={typed !== null && !valid}
        />
        {typed !== null && !valid && (
          <span className="mt-1.5 block text-xs text-danger">
            {t("errors.topUpRange", {
              min: formatPrice(MIN_TOP_UP, currency),
              max: formatPrice(MAX_TOP_UP, currency),
            })}
          </span>
        )}
      </label>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium text-ink">{t("topUpMethod")}</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {TOP_UP_METHODS.map((m) => {
            const Icon = METHOD_ICON[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  "flex items-center gap-2 rounded-field border px-3 py-2.5 text-sm font-semibold transition-colors",
                  method === m
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line text-ink hover:bg-surface-muted",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`topUpVia.${m}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex gap-2">
        <Button className="flex-1" onClick={confirm} disabled={!valid || busy}>
          {busy ? t("topUpProcessing") : t("confirmTopUp")}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">{t("topUpSimulated")}</p>
    </Modal>
  );
}
