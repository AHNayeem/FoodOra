"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X, ShoppingBag } from "lucide-react";
import type { CurrencyCode } from "@/config/regions";
import { useCart } from "@/stores/cart";
import {
  amountToFreeDelivery,
  amountToMinOrder,
  cartCount,
  cartSubtotal,
  deliveryFeeFor,
} from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { cn } from "@/lib/utils";

/**
 * CartDrawer — the primary cart surface (Phase C7): a side-sheet listing the
 * current single-vendor cart with quantity controls, free-delivery progress,
 * a minimum-order gate and a checkout hand-off (checkout lands in C8).
 */
export function CartDrawer() {
  const t = useTranslations("cart");
  const { vendor, lines, isOpen, close, setQuantity, removeLine, clear } = useCart();

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const currency = (vendor?.currency ?? "BDT") as CurrencyCode;
  const count = cartCount(lines);
  const subtotal = cartSubtotal(lines);
  const empty = lines.length === 0 || !vendor;

  const fee = vendor ? deliveryFeeFor(vendor, subtotal) : 0;
  const toFree = vendor ? amountToFreeDelivery(vendor, subtotal) : 0;
  const toMin = vendor ? amountToMinOrder(vendor, subtotal) : 0;
  const total = subtotal + fee;
  const belowMin = toMin > 0;

  const freePct =
    vendor?.freeDeliveryOver && vendor.freeDeliveryOver > 0
      ? Math.min(100, (subtotal / vendor.freeDeliveryOver) * 100)
      : 100;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="animate-fade-in absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={close} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="animate-drawer-in absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-surface-alt shadow-menu"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-h3 text-ink">{t("title")}</h2>
            {vendor && !empty && (
              <p className="truncate text-sm text-muted">{t("fromVendor", { vendor: vendor.name })}</p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("close")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface-muted"
          >
            <X className="size-5" />
          </button>
        </header>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-pill bg-surface-muted text-muted">
              <ShoppingBag className="size-7" aria-hidden />
            </span>
            <p className="text-h3 text-ink">{t("empty")}</p>
            <p className="text-sm text-body">{t("emptyHint")}</p>
            <Link
              href="/restaurants"
              onClick={close}
              className="mt-2 inline-flex h-11 items-center rounded-pill bg-primary px-6 font-semibold text-white hover:bg-primary-600"
            >
              {t("browseRestaurants")}
            </Link>
          </div>
        ) : (
          <>
            {/* Lines */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-sm font-medium text-muted">{t("items", { count })}</p>
              <ul className="space-y-3">
                {lines.map((line) => (
                  <li key={line.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-field bg-surface-muted">
                      <Image src={line.image} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{line.name}</p>
                      {line.options.length > 0 && (
                        <p className="truncate text-xs text-muted">
                          {line.options.map((o) => o.name).join(", ")}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {formatPrice(line.unitPrice, currency)}
                      </p>
                      <div className="mt-2">
                        <QuantityStepper
                          value={line.quantity}
                          onChange={(next) => setQuantity(line.id, next)}
                          min={1}
                          removable
                          decrementLabel={t("decrease")}
                          incrementLabel={t("increase")}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      aria-label={t("remove", { name: line.name })}
                      className="self-start text-xs font-medium text-muted hover:text-danger"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => {
                  clear();
                  toast.success(t("cleared"));
                }}
                className="mt-4 text-sm font-medium text-muted hover:text-danger"
              >
                {t("clear")}
              </button>
            </div>

            {/* Footer / summary */}
            <footer className="border-t border-line bg-surface px-5 py-4">
              {/* Free-delivery progress */}
              {vendor.freeDeliveryOver != null && (
                <div className="mb-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-muted">
                    <div
                      className={cn("h-full rounded-pill transition-[width]", toFree > 0 ? "bg-accent" : "bg-fresh")}
                      style={{ width: `${freePct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-body">
                    {toFree > 0
                      ? t("freeDeliveryProgress", { amount: formatPrice(toFree, currency) })
                      : t("freeDeliveryReached")}
                  </p>
                </div>
              )}

              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-body">
                  <dt>{t("subtotal")}</dt>
                  <dd className="font-medium text-ink">{formatPrice(subtotal, currency)}</dd>
                </div>
                <div className="flex justify-between text-body">
                  <dt>{t("deliveryFee")}</dt>
                  <dd className="font-medium text-ink">
                    {fee === 0 ? t("free") : formatPrice(fee, currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold text-ink">
                  <dt>{t("total")}</dt>
                  <dd>{formatPrice(total, currency)}</dd>
                </div>
              </dl>

              {belowMin && (
                <p className="mt-2 rounded-field bg-accent/10 px-3 py-2 text-xs font-medium text-body">
                  {t("minOrder", {
                    min: formatPrice(vendor.minOrder, currency),
                    amount: formatPrice(toMin, currency),
                  })}
                </p>
              )}

              {belowMin ? (
                <button
                  type="button"
                  disabled
                  className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-pill bg-primary font-semibold text-white opacity-40"
                >
                  {t("checkout")}
                </button>
              ) : (
                <Link
                  href="/checkout"
                  onClick={close}
                  className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  {t("checkout")}
                  <span className="font-bold">· {formatPrice(total, currency)}</span>
                </Link>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
