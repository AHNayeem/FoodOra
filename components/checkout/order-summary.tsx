"use client";

import { useTranslations } from "next-intl";
import { Loader2, Tag, X } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import type { CartLine, CartVendor, OrderPricing } from "@/types";
import type { Promo } from "@/lib/checkout";
import { TIP_PRESETS } from "@/lib/checkout";
import { cartCount } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * OrderSummary — the sticky right rail of the checkout: the itemised cart, a
 * promo-code field, a rider-tip selector, the money breakdown and the primary
 * "Place order" action. Purely presentational; all state lives in CheckoutView.
 */
export function OrderSummary({
  vendor,
  lines,
  pricing,
  tipPercent,
  onTipChange,
  promoInput,
  onPromoInputChange,
  appliedPromo,
  promoError,
  onApplyPromo,
  onRemovePromo,
  onPlaceOrder,
  submitting,
  disabled,
}: {
  vendor: CartVendor;
  lines: CartLine[];
  pricing: OrderPricing;
  tipPercent: number;
  onTipChange: (percent: number) => void;
  promoInput: string;
  onPromoInputChange: (value: string) => void;
  appliedPromo: Promo | null;
  promoError: string | null;
  onApplyPromo: () => void;
  onRemovePromo: () => void;
  onPlaceOrder: () => void;
  submitting: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("checkout");
  const currency = vendor.currency as CurrencyCode;
  const count = cartCount(lines);

  return (
    <div className="rounded-panel border border-line bg-surface p-5 lg:sticky lg:top-20">
      <h2 className="text-h3 text-ink">{t("summaryTitle")}</h2>
      <p className="mt-0.5 text-sm text-muted">{t("items", { count })}</p>

      {/* Line items */}
      <ul className="mt-4 space-y-2.5 border-b border-line pb-4">
        {lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-body">
              <span className="font-semibold text-ink">{line.quantity}×</span> {line.name}
              {line.options.length > 0 && (
                <span className="block truncate text-xs text-muted">
                  {line.options.map((o) => o.name).join(", ")}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium text-ink">
              {formatPrice(line.unitPrice * line.quantity, currency)}
            </span>
          </li>
        ))}
      </ul>

      {/* Promo code */}
      <div className="border-b border-line py-4">
        <label htmlFor="promo" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Tag className="size-4 text-muted" aria-hidden />
          {t("promoTitle")}
        </label>
        {appliedPromo ? (
          <div className="flex items-center justify-between rounded-field bg-fresh/10 px-3 py-2">
            <span className="text-sm font-semibold text-fresh-600">
              {t("promoApplied", { code: appliedPromo.code })}
            </span>
            <button
              type="button"
              onClick={onRemovePromo}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-danger"
            >
              <X className="size-3.5" /> {t("removePromo")}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              id="promo"
              value={promoInput}
              onChange={(e) => onPromoInputChange(e.target.value)}
              placeholder={t("promoPlaceholder")}
              aria-invalid={!!promoError}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onApplyPromo();
                }
              }}
              className="uppercase"
            />
            <button
              type="button"
              onClick={onApplyPromo}
              className="shrink-0 rounded-field border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
            >
              {t("apply")}
            </button>
          </div>
        )}
        {promoError && <p className="mt-1.5 text-xs font-medium text-danger">{t(promoError)}</p>}
      </div>

      {/* Tip */}
      <div className="border-b border-line py-4">
        <span className="mb-2 block text-sm font-semibold text-ink">{t("tipTitle")}</span>
        <div className="grid grid-cols-4 gap-2">
          {TIP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onTipChange(preset)}
              aria-pressed={tipPercent === preset}
              className={cn(
                "rounded-field border py-2 text-sm font-semibold transition-colors",
                tipPercent === preset
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-line text-body hover:bg-surface-muted",
              )}
            >
              {preset === 0 ? t("tipNone") : `${Math.round(preset * 100)}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <dl className="space-y-2 py-4 text-sm">
        <Row label={t("subtotal")} value={formatPrice(pricing.subtotal, currency)} />
        <Row
          label={t("deliveryFee")}
          value={pricing.deliveryFee === 0 ? t("free") : formatPrice(pricing.deliveryFee, currency)}
        />
        {pricing.discount > 0 && (
          <Row
            label={t("discount")}
            value={`− ${formatPrice(pricing.discount, currency)}`}
            className="text-fresh-600"
          />
        )}
        <Row label={t("tax", { label: pricing.taxLabel })} value={formatPrice(pricing.tax, currency)} />
        {pricing.tip > 0 && <Row label={t("tip")} value={formatPrice(pricing.tip, currency)} />}
      </dl>

      <div className="flex items-center justify-between border-t border-line pt-3 text-base font-bold text-ink">
        <span>{t("total")}</span>
        <span>{formatPrice(pricing.total, currency)}</span>
      </div>

      <button
        type="button"
        onClick={onPlaceOrder}
        disabled={disabled || submitting}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:pointer-events-none disabled:opacity-40"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {t("placing")}
          </>
        ) : (
          t("placeOrderPrice", { price: formatPrice(pricing.total, currency) })
        )}
      </button>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between text-body", className)}>
      <dt>{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
