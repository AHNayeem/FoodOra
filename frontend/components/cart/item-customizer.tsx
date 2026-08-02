"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CartLine, CartSelectedOption, CartVendor, FoodItem } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { useCart } from "@/frontend/stores/cart";
import { buildCartLine, lineUnitPrice } from "@/frontend/lib/cart";
import { formatPrice } from "@/frontend/lib/format";
import { Modal } from "@/frontend/components/ui/modal";
import { QuantityStepper } from "@/frontend/components/cart/quantity-stepper";
import { cn } from "@/frontend/lib/utils";

/**
 * ItemCustomizer — the "configure then add" sheet for dishes with option
 * groups. Required groups render as single-select, optional groups as
 * multi-select capped at `max`. The footer shows the live line total.
 *
 * By default it writes to the delivery cart. Pass `onAdd` to receive the built
 * line instead — the QR menu (C12) uses that to add to a table sitting, which
 * is a different store with the same line shape.
 */
export function ItemCustomizer({
  item,
  vendor,
  open,
  onClose,
  onAdd,
}: {
  item: FoodItem;
  vendor: CartVendor;
  open: boolean;
  onClose: () => void;
  /** Takes ownership of the built line; the cart store is left untouched. */
  onAdd?: (line: CartLine) => void;
}) {
  const t = useTranslations("cart");
  const add = useCart((s) => s.add);
  const openCart = useCart((s) => s.open);
  const currency = vendor.currency as CurrencyCode;

  // Default: preselect required groups up to their minimum.
  const initial = useMemo(() => {
    const sel: Record<string, string[]> = {};
    for (const g of item.optionGroups) {
      sel[g.id] = g.required ? g.options.slice(0, g.min).map((o) => o.id) : [];
    }
    return sel;
  }, [item.optionGroups]);

  const [selected, setSelected] = useState<Record<string, string[]>>(initial);
  const [qty, setQty] = useState(1);

  function toggle(groupId: string, optionId: string, max: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const chosen: CartSelectedOption[] = useMemo(() => {
    const out: CartSelectedOption[] = [];
    for (const g of item.optionGroups) {
      for (const id of selected[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === id);
        if (opt) {
          out.push({ groupId: g.id, optionId: opt.id, name: opt.name, priceDelta: opt.priceDelta });
        }
      }
    }
    return out;
  }, [item.optionGroups, selected]);

  const unit = lineUnitPrice(item.price, chosen);

  function handleAdd() {
    const line = buildCartLine(item, chosen, qty);
    onClose();

    if (onAdd) {
      onAdd(line);
      return;
    }

    const { conflict } = add(vendor, line);
    if (!conflict) {
      openCart();
      toast.success(t("added", { name: item.name }));
    }
  }

  const titleId = `customize-${item.id}`;

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      {/* Header image */}
      <div className="relative aspect-[16/9] w-full bg-surface-muted">
        <Image src={item.image} alt="" fill sizes="448px" className="object-cover" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("keepCart")}
          className="absolute end-3 top-3 inline-flex size-9 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-card backdrop-blur hover:bg-surface"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="p-5">
        <h2 id={titleId} className="text-h3 text-ink">
          {item.name}
        </h2>
        <p className="mt-1 text-sm text-body">{item.description}</p>

        {item.optionGroups.map((g) => (
          <fieldset key={g.id} className="mt-5">
            <legend className="flex w-full items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">{g.name}</span>
              <span className="text-xs font-medium text-muted">
                {g.required ? t("required") : t("chooseUpTo", { max: g.max })}
              </span>
            </legend>
            <div className="mt-2 space-y-1.5">
              {g.options.map((o) => {
                const isSel = (selected[g.id] ?? []).includes(o.id);
                const single = g.max === 1;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-field border px-3 py-2.5 transition-colors",
                      isSel ? "border-primary bg-primary/5" : "border-line hover:bg-surface-muted",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={g.id}
                        checked={isSel}
                        onChange={() => toggle(g.id, o.id, g.max)}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      <span className="text-sm text-ink">{o.name}</span>
                    </span>
                    {o.priceDelta > 0 && (
                      <span className="text-sm text-muted">+{formatPrice(o.priceDelta, currency)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* Footer: quantity + add */}
        <div className="mt-6 flex items-center gap-3">
          <QuantityStepper
            value={qty}
            onChange={setQty}
            min={1}
            decrementLabel={t("decrease")}
            incrementLabel={t("increase")}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 active:scale-[0.98]"
          >
            <span>{t("addForPrice", { price: formatPrice(unit * qty, currency) })}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
