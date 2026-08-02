import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import type { CateringService } from "@/frontend/types";
import { Badge } from "@/frontend/components/ui/badge";
import { Rating } from "@/frontend/components/ui/rating";
import { formatCompact, formatPrice } from "@/frontend/lib/format";
import { EVENT_TYPE_EMOJI } from "@/frontend/lib/catering";
import type { CurrencyCode } from "@/frontend/config/regions";
import { cn } from "@/frontend/lib/utils";

/**
 * CateringServiceCard — the listing card for a caterer (Phase C17). Reused on
 * the catering directory and the home/featured rails. Surfaces the "from" price
 * per guest and the guest-capacity range rather than delivery metrics.
 */
export function CateringServiceCard({
  service,
  className,
}: {
  service: CateringService;
  className?: string;
}) {
  const t = useTranslations("catering");
  const currency = service.currency as CurrencyCode;

  return (
    <Link
      href={`/catering/${service.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-card-hover",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={service.cover}
          alt={service.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105"
        />
        {service.isFeatured && (
          <Badge tone="primary" className="absolute start-3 top-3 bg-primary text-white shadow-sm">
            {t("featured")}
          </Badge>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-ink/70 to-transparent p-3">
          {service.eventTypes.slice(0, 3).map((et) => (
            <span
              key={et}
              className="inline-flex items-center gap-1 rounded-pill bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-ink backdrop-blur"
            >
              <span aria-hidden>{EVENT_TYPE_EMOJI[et]}</span>
              {t(`event.${et}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-ink line-clamp-2">{service.name}</h3>
          <Rating value={service.rating} count={service.reviewCount} className="shrink-0" />
        </div>
        <p className="text-sm text-body line-clamp-2">{service.tagline}</p>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {t("guestRange", {
              min: formatCompact(service.minGuests),
              max: formatCompact(service.maxGuests),
            })}
          </span>
          <span className="ms-auto font-semibold text-body">
            {t("fromPerGuest", { price: formatPrice(service.pricePerGuestFrom, currency) })}
          </span>
        </div>
      </div>
    </Link>
  );
}
