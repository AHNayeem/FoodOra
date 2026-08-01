"use client";

import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { PaymentMethod } from "@/types";
import { coversAmount, shortfall } from "@/lib/wallet";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Demo payment fixtures — simulated only, no real gateway or stored card. */
export const DEMO_CARD_LAST4 = "4242";
/**
 * The full demo card, sent to the simulated authorisation step. A number ending
 * `0000` is the one `services/orders.authorisePayment` declines, so the failure
 * path is reachable deliberately rather than at random — a payment that fails
 * one time in twenty makes for an unreliable demonstration.
 */
export const DEMO_CARD_NUMBER = "4242424242424242";

/**
 * PaymentMethods — a radio group of the simulated tenders (cash / card /
 * wallet). No real payment is taken; card resolves as "paid" in the orders
 * service, cash stays pending until hand-off.
 *
 * The wallet is different, and has been since C19: it is real money in a real
 * ledger, so this shows the *live* balance rather than a fixture, and refuses
 * to be picked when it cannot cover the total — saying by how much it falls
 * short, since "unavailable" without a number is no use to anyone. The rule is
 * enforced again in `services/wallet.authoriseWalletPayment`; a disabled button
 * is a courtesy, not a control.
 */
export function PaymentMethods({
  value,
  onChange,
  currency,
  walletBalance,
  total,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  currency: CurrencyCode;
  /** Live wallet balance (persisted store), not a fixture. */
  walletBalance: number;
  /** What the wallet would have to cover right now. */
  total: number;
}) {
  const t = useTranslations("checkout");
  const walletCovers = coversAmount(walletBalance, total);
  const missing = shortfall(walletBalance, total);

  const options: Array<{
    method: PaymentMethod;
    icon: typeof Banknote;
    title: string;
    desc: string;
    disabled?: boolean;
  }> = [
    { method: "cash", icon: Banknote, title: t("payCash"), desc: t("payCashDesc") },
    { method: "card", icon: CreditCard, title: t("payCard"), desc: t("payCardDesc", { last4: DEMO_CARD_LAST4 }) },
    {
      method: "wallet",
      icon: Wallet,
      title: t("payWallet"),
      desc: walletCovers
        ? t("payWalletDesc", { balance: formatPrice(walletBalance, currency) })
        : t("payWalletShort", { missing: formatPrice(missing, currency) }),
      disabled: !walletCovers,
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map(({ method, icon: Icon, title, desc, disabled }) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          disabled={disabled}
          aria-pressed={value === method}
          className={cn(
            "flex flex-col gap-1.5 rounded-field border p-3 text-start transition-colors",
            value === method
              ? "border-primary bg-primary/5"
              : "border-line hover:bg-surface-muted",
            disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
          )}
        >
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-field",
              value === method ? "bg-primary text-white" : "bg-surface-muted text-muted",
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span className={cn("text-xs", disabled ? "text-danger" : "text-muted")}>{desc}</span>
        </button>
      ))}
    </div>
  );
}
