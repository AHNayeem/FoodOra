"use client";

import { useState } from "react";
import Image from "next/image";
import { Flame, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CartLine, CartVendor, FoodItem } from "@/frontend/types";
import type { CurrencyCode } from "@/frontend/config/regions";
import { buildCartLine } from "@/frontend/lib/cart";
import { ItemCustomizer } from "@/frontend/components/cart/item-customizer";
import { Badge } from "@/frontend/components/ui/badge";
import { formatPrice } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

/**
 * QrItemRow — one dish on the scanned table menu (Phase C12).
 *
 * A thumb-reachable variant of `FoodItemCard`: it must work one-handed on a
 * phone at a dinner table, so the whole row is the tap target when the venue
 * takes orders. Dishes with option groups reuse the cart's `ItemCustomizer`
 * via its `onAdd` escape hatch — the sitting store, not the delivery cart,
 * receives the line. Venues that only browse (`ordering: false`) get the same
 * row without any action.
 */
export function QrItemRow({
  item,
  vendor,
  ordering,
  onAdd,
}: {
  item: FoodItem;
  vendor: CartVendor;
  ordering: boolean;
  onAdd: (line: CartLine) => void;
}) {
  const t = useTranslations("qr");
  const [customizing, setCustomizing] = useState(false);

  const currency = vendor.currency as CurrencyCode;
  const hasOptions = item.optionGroups.length > 0;
  const actionable = ordering && item.isAvailable;

  function commit(line: CartLine) {
    onAdd(line);
    toast.success(t("addedToRound", { name: item.name }));
  }

  function handleAdd() {
    if (hasOptions) {
      setCustomizing(true);
      return;
    }
    commit(buildCartLine(item, [], 1));
  }

  return (
    <>
      <div
        className={cn(
          "relative flex gap-3 rounded-card border border-line bg-surface p-3",
          !item.isAvailable && "opacity-60",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate font-semibold text-ink">{item.name}</h4>
            {item.isPopular && (
              <Badge tone="primary" className="shrink-0">
                {t("popular")}
              </Badge>
            )}
            {item.spicyLevel > 0 && (
              <span
                className="inline-flex shrink-0 items-center"
                aria-label={t("spicy", { level: item.spicyLevel })}
              >
                {Array.from({ length: item.spicyLevel }).map((_, i) => (
                  <Flame key={i} className="size-3.5 text-primary" aria-hidden />
                ))}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-body">{item.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-semibold text-ink">
              {formatPrice(item.price, currency)}
            </span>
            {item.compareAtPrice && (
              <span className="text-sm text-muted line-through">
                {formatPrice(item.compareAtPrice, currency)}
              </span>
            )}
            {item.calories && (
              <span className="text-xs text-muted">· {item.calories} kcal</span>
            )}
          </div>
        </div>

        <div className="relative shrink-0">
          <div className="relative size-20 overflow-hidden rounded-field bg-surface-muted">
            <Image
              src={item.image}
              alt=""
              fill
              sizes="80px"
              className={cn("object-cover", !item.isAvailable && "grayscale")}
            />
          </div>
          {actionable ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={t("add", { name: item.name })}
              className="absolute -bottom-2 end-1 inline-flex size-9 items-center justify-center rounded-field bg-primary text-white shadow-sm transition-[transform,background] duration-[var(--duration-fast)] hover:bg-primary-600 active:scale-90"
            >
              <Plus className="size-5" aria-hidden />
            </button>
          ) : (
            !item.isAvailable && (
              <Badge tone="danger" className="absolute -bottom-2 end-0">
                {t("unavailable")}
              </Badge>
            )
          )}
        </div>
      </div>

      {hasOptions && (
        <ItemCustomizer
          item={item}
          vendor={vendor}
          open={customizing}
          onClose={() => setCustomizing(false)}
          onAdd={commit}
        />
      )}
    </>
  );
}
