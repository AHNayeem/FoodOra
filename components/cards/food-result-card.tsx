import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Flame, Store } from "lucide-react";
import type { FoodItem, Vendor } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "@/components/menu/add-to-cart-button";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { toCartVendor } from "@/lib/cart";
import { formatPrice } from "@/lib/format";

/**
 * FoodResultCard — a dish result outside its own menu page (search, offers,
 * collections). Unlike {@link FoodItemCard} it names the vendor it belongs to
 * and links there, because the dish arrives without that context.
 */
export async function FoodResultCard({
  item,
  vendor,
}: {
  item: FoodItem;
  vendor: Vendor;
}) {
  const t = await getTranslations("restaurant");
  const currency = vendor.currency as CurrencyCode;

  return (
    <article className="flex gap-4 rounded-card border border-line bg-surface p-3 transition-shadow hover:shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-ink">{item.name}</h3>
          {item.isPopular && (
            <Badge tone="primary" className="shrink-0">
              {t("popular")}
            </Badge>
          )}
          {item.spicyLevel > 0 && (
            <span
              className="inline-flex shrink-0 items-center"
              aria-label={`spicy level ${item.spicyLevel}`}
            >
              {Array.from({ length: item.spicyLevel }).map((_, i) => (
                <Flame key={i} className="size-3.5 text-primary" aria-hidden />
              ))}
            </span>
          )}
        </div>

        <Link
          href={`/restaurants/${vendor.slug}`}
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary"
        >
          <Store className="size-3.5" aria-hidden />
          {vendor.name}
        </Link>

        <p className="mt-1 line-clamp-2 text-sm text-body">{item.description}</p>

        <div className="mt-2 flex items-center gap-2">
          <span className="font-semibold text-ink">{formatPrice(item.price, currency)}</span>
          {item.compareAtPrice && (
            <span className="text-sm text-muted line-through">
              {formatPrice(item.compareAtPrice, currency)}
            </span>
          )}
        </div>
      </div>

      <div className="relative shrink-0">
        <div className="relative size-24 overflow-hidden rounded-field bg-surface-muted sm:size-28">
          <Image src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
          <FavoriteButton
            kind="food"
            id={item.id}
            name={item.name}
            className="absolute end-1 top-1 size-8"
          />
        </div>
        <div className="absolute -bottom-2 end-2">
          <AddToCartButton item={item} vendor={toCartVendor(vendor)} />
        </div>
      </div>
    </article>
  );
}
