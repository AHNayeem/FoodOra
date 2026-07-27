import Image from "next/image";
import Link from "next/link";
import { Clock, Bike } from "lucide-react";
import type { Vendor } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { formatDistance, formatEta, formatPrice } from "@/lib/format";
import type { CurrencyCode } from "@/config/regions";
import { cn } from "@/lib/utils";

/**
 * VendorCard — the primary listing card for restaurants, cafes, chefs and
 * cloud kitchens. Reused across the home page, directory and search results.
 */
export function VendorCard({ vendor, className }: { vendor: Vendor; className?: string }) {
  const currency = vendor.currency as CurrencyCode;
  return (
    <Link
      href={`/restaurants/${vendor.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-card-hover",
        className,
      )}
    >
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
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          {vendor.promoLabel ? (
            <Badge tone="primary" className="bg-primary text-white shadow-sm">
              {vendor.promoLabel}
            </Badge>
          ) : (
            <span />
          )}
          {!vendor.isOpen && (
            <Badge tone="danger" className="bg-ink/80 text-white">
              Closed
            </Badge>
          )}
        </div>
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
  );
}
