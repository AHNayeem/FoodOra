import Image from "next/image";
import Link from "next/link";
import { Clock, Bike } from "lucide-react";
import type { Vendor } from "@/frontend/types";
import { Badge } from "@/frontend/components/ui/badge";
import { Rating } from "@/frontend/components/ui/rating";
import { FavoriteButton } from "@/frontend/components/favorites/favorite-button";
import { formatDistance, formatEta, formatPrice } from "@/frontend/lib/format";
import type { CurrencyCode } from "@/frontend/config/regions";
import { cn } from "@/frontend/lib/utils";

/**
 * VendorCard — the primary listing card for restaurants, cafes, chefs and
 * cloud kitchens. Reused across the home page, directory and search results.
 *
 * The card is a wrapper with the link *inside* it rather than a link around
 * everything, so the favorite heart (C23) can be a real sibling button — a
 * button nested in an anchor is invalid and unreachable by keyboard.
 */
export function VendorCard({ vendor, className }: { vendor: Vendor; className?: string }) {
  const currency = vendor.currency as CurrencyCode;
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-card-hover",
        className,
      )}
    >
      <FavoriteButton
        kind="vendor"
        id={vendor.id}
        name={vendor.name}
        className="absolute end-3 top-3 z-10"
      />

      <Link href={`/restaurants/${vendor.slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image
            src={vendor.cover}
            alt={vendor.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className={cn(
              "object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105",
              !vendor.isOpen && "grayscale",
            )}
          />
          {vendor.promoLabel && (
            <Badge
              tone="primary"
              className="absolute start-3 top-3 bg-primary text-white shadow-sm"
            >
              {vendor.promoLabel}
            </Badge>
          )}
          {/* Closed sits bottom-end so it never collides with the heart. */}
          {!vendor.isOpen && (
            <Badge tone="danger" className="absolute bottom-3 end-3 bg-ink/80 text-white">
              Closed
            </Badge>
          )}
          {vendor.freeDeliveryOver === null && vendor.deliveryFee === 0 && (
            <Badge tone="fresh" className="absolute bottom-3 start-3">
              Free delivery
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-ink line-clamp-2">{vendor.name}</h3>
            <Rating value={vendor.rating} count={vendor.reviewCount} className="shrink-0" />
          </div>
          <p className="text-sm text-body line-clamp-2">{vendor.tagline}</p>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {formatEta(vendor.etaMinutes[0], vendor.etaMinutes[1])}
            </span>
            <span className="inline-flex items-center gap-1">
              <Bike className="size-3.5" aria-hidden />
              {vendor.deliveryFee === 0 ? "Free" : formatPrice(vendor.deliveryFee, currency)}
            </span>
            <span>{formatDistance(vendor.distanceKm)}</span>
            <span aria-label="price level" className="ms-auto font-semibold text-body">
              {"$".repeat(vendor.priceLevel)}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
