import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Bike, Clock, MapPin, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Cuisine, Vendor } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { formatDistance, formatEta, formatPrice } from "@/lib/format";

/**
 * VendorHero — the restaurant detail header (Phase C5): cover image, logo,
 * name, cuisines, live open/closed state and the key delivery stats. Server
 * component — all copy is locale/region-aware.
 */
export async function VendorHero({
  vendor,
  cuisines,
}: {
  vendor: Vendor;
  cuisines: Cuisine[];
}) {
  const t = await getTranslations("restaurant");
  const tc = await getTranslations("common");
  const currency = vendor.currency as CurrencyCode;

  return (
    <header>
      {/* Cover */}
      <div className="relative h-48 w-full overflow-hidden sm:h-64 md:h-80">
        <Image
          src={vendor.cover}
          alt={vendor.name}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
        <div className="container-site absolute inset-x-0 top-0 pt-4">
          <Link
            href="/restaurants"
            className="inline-flex items-center gap-2 rounded-pill bg-surface/90 px-3 py-1.5 text-sm font-semibold text-ink shadow-sm backdrop-blur transition-colors hover:bg-surface"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("backToRestaurants")}
          </Link>
        </div>
      </div>

      {/* Header card */}
      <div className="container-site">
        <div className="relative -mt-14 flex flex-col gap-4 rounded-panel bg-surface p-5 shadow-card md:-mt-16 md:flex-row md:items-start md:p-6">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-card ring-4 ring-surface md:size-24">
            <Image src={vendor.logo} alt="" fill sizes="96px" className="object-cover" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 text-ink">{vendor.name}</h1>
              <Badge tone={vendor.isOpen ? "fresh" : "danger"}>
                {vendor.isOpen ? tc("openNow") : tc("closed")}
              </Badge>
            </div>
            <p className="mt-1 text-body">{vendor.tagline}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Rating value={vendor.rating} count={vendor.reviewCount} />
              <span className="text-sm text-muted">·</span>
              {cuisines.map((c) => (
                <span key={c.id} className="text-sm text-body">
                  {c.emoji} {c.name}
                </span>
              ))}
              <span className="text-sm text-muted">· {"$".repeat(vendor.priceLevel)}</span>
            </div>

            {vendor.promoLabel && (
              <Badge tone="primary" className="mt-3 bg-primary text-white">
                {vendor.promoLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Clock className="size-5" />} label={t("deliveryTime")} value={formatEta(vendor.etaMinutes[0], vendor.etaMinutes[1])} />
          <Stat
            icon={<Bike className="size-5" />}
            label={t("deliveryFee")}
            value={vendor.deliveryFee === 0 ? tc("freeDelivery") : formatPrice(vendor.deliveryFee, currency)}
          />
          <Stat icon={<ShoppingBag className="size-5" />} label={t("minOrder")} value={formatPrice(vendor.minOrder, currency)} />
          <Stat icon={<MapPin className="size-5" />} label={vendor.location.city} value={formatDistance(vendor.distanceKm)} />
        </div>
      </div>
    </header>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <span className="text-primary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="truncate font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
