"use client";

import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { PaymentMethod } from "@/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Demo payment fixtures — simulated only, no real gateway or stored card. */
export const DEMO_CARD_LAST4 = "4242";
export const DEMO_WALLET_BALANCE = 2450;

/**
 * PaymentMethods — a radio group of the simulated tenders (cash / card /
 * wallet). No real payment is taken; card and wallet resolve as "paid" in the
 * orders service, cash stays pending until hand-off.
 */
export function PaymentMethods({
  value,
  onChange,
  currency,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  currency: CurrencyCode;
}) {
  const t = useTranslations("checkout");

  const options: Array<{
    method: PaymentMethod;
    icon: typeof Banknote;
    title: string;
    desc: string;
  }> = [
    { method: "cash", icon: Banknote, title: t("payCash"), desc: t("payCashDesc") },
    { method: "card", icon: CreditCard, title: t("payCard"), desc: t("payCardDesc", { last4: DEMO_CARD_LAST4 }) },
    {
      method: "wallet",
      icon: Wallet,
      title: t("payWallet"),
      desc: t("payWalletDesc", { balance: formatPrice(DEMO_WALLET_BALANCE, currency) }),
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map(({ method, icon: Icon, title, desc }) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          aria-pressed={value === method}
          className={cn(
            "flex flex-col gap-1.5 rounded-field border p-3 text-start transition-colors",
            value === method
              ? "border-primary bg-primary/5"
              : "border-line hover:bg-surface-muted",
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
          <span className="text-xs text-muted">{desc}</span>
        </button>
      ))}
    </div>
  );
}
