"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { CartVendor, FoodItem } from "@/frontend/types";
import { useCart } from "@/frontend/stores/cart";
import { buildCartLine } from "@/frontend/lib/cart";
import { ItemCustomizer } from "@/frontend/components/cart/item-customizer";
import { cn } from "@/frontend/lib/utils";

/**
 * AddToCartButton — the menu's cart action (Phase C7). Dishes with option
 * groups open the customizer; simple dishes add straight to the store. The
 * single-vendor conflict prompt is handled globally by CartConflictDialog, so
 * this only reacts to the non-conflict success path.
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

  const hasOptions = item.optionGroups.length > 0;

  function handleClick() {
    if (hasOptions) {
      setCustomizing(true);
      return;
    }
    const line = buildCartLine(item, [], 1);
    const { conflict } = add(vendor, line);
    if (!conflict) {
      openCart();
      toast.success(tc("added", { name: item.name }));
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${t("add")} — ${item.name}`}
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
          item={item}
          vendor={vendor}
          open={customizing}
          onClose={() => setCustomizing(false)}
        />
      )}
    </>
  );
}
