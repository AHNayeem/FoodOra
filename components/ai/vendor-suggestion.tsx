"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, Star } from "lucide-react";
import type { Vendor } from "@/types";
import { formatDistance, formatEta, formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * VendorSuggestion — a restaurant inside a reply.
 *
 * Deliberately not `VendorCard`: that card is a 16:10 hero built for a grid, and
 * four of them in a 24rem chat panel is a scroll marathon. This is the same
 * information at conversation scale — name, rating, how far, how long, and
 * whether the door is open right now, which is the one fact a chat answer is
 * most often asked to settle.
 */
export function VendorSuggestion({ vendor, className }: { vendor: Vendor; className?: string }) {
  const t = useTranslations("ai");

  return (
    <Link
      href={`/restaurants/${vendor.slug}`}
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface p-2.5 transition-shadow hover:shadow-card",
        className,
      )}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-field bg-surface-muted">
        <Image src={vendor.logo} alt="" fill sizes="56px" className="object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="min-w-0 truncate text-sm font-semibold text-ink">{vendor.name}</h4>
          <span
            className={cn(
              "shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              vendor.isOpen ? "bg-fresh-50 text-fresh-600" : "bg-surface-muted text-muted",
            )}
          >
            {t(vendor.isOpen ? "vendor.open" : "vendor.closed")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{vendor.tagline}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-rating text-rating" aria-hidden />
            {formatRating(vendor.rating)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {formatEta(vendor.etaMinutes[0], vendor.etaMinutes[1])}
          </span>
          <span>{formatDistance(vendor.distanceKm)}</span>
        </div>
      </div>
    </Link>
  );
}
