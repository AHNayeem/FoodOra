import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CalendarClock, Star, Users, Utensils } from "lucide-react";
import type { CateringService, Cuisine } from "@/types";
import { Button } from "@/components/ui/button";
import { formatCompact, formatPrice, formatRating } from "@/lib/format";
import { EVENT_TYPE_EMOJI } from "@/lib/catering";
import type { CurrencyCode } from "@/config/regions";

/**
 * ServiceHero — the caterer detail header (Phase C17). Server component: cover
 * image, identity, the headline stats a customer books on (rating, capacity,
 * from-price, lead time) and the primary "request a quote" call to action.
 */
export async function ServiceHero({
  service,
  cuisines,
}: {
  service: CateringService;
  cuisines: Cuisine[];
}) {
  const t = await getTranslations("catering");
  const currency = service.currency as CurrencyCode;

  const stats = [
    { icon: Star, label: t("stat.rating"), value: `${formatRating(service.rating)} · ${t("reviews", { count: service.reviewCount })}` },
    { icon: Users, label: t("stat.capacity"), value: t("guestRange", { min: formatCompact(service.minGuests), max: formatCompact(service.maxGuests) }) },
    { icon: Utensils, label: t("stat.fromPerGuest"), value: formatPrice(service.pricePerGuestFrom, currency) },
    { icon: CalendarClock, label: t("stat.leadTime"), value: t("leadTimeDays", { count: service.leadTimeDays }) },
  ];

  return (
    <section>
      <div className="relative aspect-[21/9] w-full overflow-hidden md:aspect-[3/1]">
        <Image
          src={service.cover}
          alt={service.name}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
      </div>

      <div className="container-site">
        <div className="relative -mt-16 rounded-panel border border-line bg-surface p-6 shadow-card md:-mt-20 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {service.eventTypes.map((et) => (
                  <span
                    key={et}
                    className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                  >
                    <span aria-hidden>{EVENT_TYPE_EMOJI[et]}</span>
                    {t(`event.${et}`)}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-h1 text-ink">{service.name}</h1>
              <p className="mt-1 text-body">{service.tagline}</p>
              {cuisines.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {cuisines.map((c) => `${c.emoji} ${c.name}`).join(" · ")}
                </p>
              )}
            </div>

            <div className="shrink-0">
              <Button href={`/catering/${service.slug}/quote`} size="lg" className="w-full lg:w-auto">
                {t("requestQuote")}
              </Button>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-6 md:grid-cols-4">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-field bg-surface-muted text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="truncate text-sm font-semibold text-ink">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
