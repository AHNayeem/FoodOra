import Image from "next/image";
import { Flame } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { FoodItem } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "@/components/menu/add-to-cart-button";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * FoodItemCard — a single dish row on a restaurant menu (Phase C5/C6). Server
 * component: text (price, badges) is region/locale-aware. The only interactive
 * part is the client AddToCartButton.
 */
export async function FoodItemCard({
  item,
  currency,
}: {
  item: FoodItem;
  currency: CurrencyCode;
}) {
  const t = await getTranslations("restaurant");

  return (
    <article
      className={cn(
        "flex gap-4 rounded-card border border-line bg-surface p-3 transition-shadow hover:shadow-card",
        !item.isAvailable && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-semibold text-ink">{item.name}</h4>
          {item.isPopular && (
            <Badge tone="primary" className="shrink-0">
              {t("popular")}
            </Badge>
          )}
          {item.spicyLevel > 0 && (
            <span className="inline-flex shrink-0 items-center" aria-label={`spicy level ${item.spicyLevel}`}>
              {Array.from({ length: item.spicyLevel }).map((_, i) => (
                <Flame key={i} className="size-3.5 text-primary" aria-hidden />
              ))}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-body">{item.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-semibold text-ink">{formatPrice(item.price, currency)}</span>
          {item.compareAtPrice && (
            <span className="text-sm text-muted line-through">
              {formatPrice(item.compareAtPrice, currency)}
            </span>
          )}
          {item.calories && <span className="text-xs text-muted">· {item.calories} kcal</span>}
        </div>
      </div>

      <div className="relative shrink-0">
        <div className="relative size-24 overflow-hidden rounded-field bg-surface-muted sm:size-28">
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="112px"
            className={cn("object-cover", !item.isAvailable && "grayscale")}
          />
        </div>
        <div className="absolute -bottom-2 end-2">
          {item.isAvailable ? (
            <AddToCartButton itemName={item.name} />
          ) : (
            <Badge tone="danger">{t("unavailable")}</Badge>
          )}
        </div>
      </div>
    </article>
  );
}
