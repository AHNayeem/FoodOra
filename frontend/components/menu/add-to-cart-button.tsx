"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { CartVendor, FoodItem } from "@/types";
import { useCart } from "@/stores/cart";
import { buildCartLine } from "@/lib/cart";
import { ItemCustomizer } from "@/components/cart/item-customizer";
import { useMenuItem } from "@/components/menu/use-menu-item";
import { cn } from "@/lib/utils";

/**
 * AddToCartButton — the menu's cart action (Phase C7). Dishes with option
 * groups open the customizer; simple dishes add straight to the store. The
 * single-vendor conflict prompt is handled globally by CartConflictDialog, so
 * this only reacts to the non-conflict success path.
 *
 * ## Phase 9: the dish, as its restaurant authored it
 *
 * The card around this button is server-rendered from the catalog, which cannot see
 * the menu builder's client-side draft. This *can* — `useMenuItem` folds the draft
 * over the prop — and it is the right place for it, because everything the fold
 * changes is something the customer is about to be charged for or asked to choose:
 * the price the line is built at, the option groups the customiser renders, and
 * whether the dish is orderable at all.
 *
 * So an item the restaurant deleted, 86'd or sold out refuses to be added rather
 * than reaching the cart from a page that was rendered before the change. The
 * button says which, because "unavailable" and "sold out" are different answers to
 * a customer deciding whether to wait.
 */
export function AddToCartButton({
  item,
  vendor,
  className,
}: {
  item: FoodItem;
  vendor: CartVendor;
  className?: string;
}) {
  const t = useTranslations("restaurant");
  const tc = useTranslations("cart");
  const add = useCart((s) => s.add);
  const openCart = useCart((s) => s.open);
  const [customizing, setCustomizing] = useState(false);

  const resolved = useMenuItem(item);
  // A deleted dish keeps the prop's name for the label and nothing else: it is not
  // orderable, so there is no authored record to price it from.
  const live = resolved?.live ?? false;
  const current = resolved?.item ?? item;
  const hasOptions = current.optionGroups.length > 0;

  function handleClick() {
    if (hasOptions) {
      setCustomizing(true);
      return;
    }
    const line = buildCartLine(current, [], 1);
    const { conflict } = add(vendor, line);
    if (!conflict) {
      openCart();
      toast.success(tc("added", { name: current.name }));
    }
  }

  if (!live) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-pill bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger",
          className,
        )}
      >
        {resolved?.outOfStock ? t("soldOut") : t("unavailable")}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${t("add")} — ${current.name}`}
        onClick={handleClick}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-field bg-primary text-white shadow-sm transition-[transform,background] duration-[var(--duration-fast)] hover:bg-primary-600 active:scale-90",
          className,
        )}
      >
        <Plus className="size-5" aria-hidden />
      </button>
      {hasOptions && (
        <ItemCustomizer
          item={current}
          vendor={vendor}
          open={customizing}
          onClose={() => setCustomizing(false)}
        />
      )}
    </>
  );
}
