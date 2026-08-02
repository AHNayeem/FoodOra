"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { CateringPackage } from "@/frontend/types";
import { Badge } from "@/frontend/components/ui/badge";
import { formatPrice } from "@/frontend/lib/format";
import { EVENT_TYPE_EMOJI } from "@/frontend/lib/catering";
import type { CurrencyCode } from "@/frontend/config/regions";

/**
 * PackageCard — a per-guest catering package (Phase C17). Shows the menu
 * highlights and inclusions, and links into the quote builder with this package
 * (and its event type) pre-selected.
 */
export function PackageCard({
  pkg,
  serviceSlug,
  currency,
}: {
  pkg: CateringPackage;
  serviceSlug: string;
  currency: CurrencyCode;
}) {
  const t = useTranslations("catering");

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="relative aspect-[16/9] overflow-hidden">
        <Image
          src={pkg.image}
          alt={pkg.name}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink backdrop-blur">
            <span aria-hidden>{EVENT_TYPE_EMOJI[pkg.eventType]}</span>
            {t(`event.${pkg.eventType}`)}
          </span>
          {pkg.isPopular && (
            <Badge tone="accent" className="shadow-sm">
              {t("popular")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-h3 text-ink">{pkg.name}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">{t(`style.${pkg.serviceStyle}`)}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-lg font-bold text-ink">{formatPrice(pkg.pricePerGuest, currency)}</p>
            <p className="text-xs text-muted">{t("perGuest")}</p>
          </div>
        </div>

        <p className="mt-2 text-sm text-body">{pkg.description}</p>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("menuHighlights")}</p>
          <ul className="mt-2 space-y-1.5">
            {pkg.courses.map((course) => (
              <li key={course} className="flex items-start gap-2 text-sm text-body">
                <Check className="mt-0.5 size-4 shrink-0 text-fresh" aria-hidden />
                {course}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {pkg.includes.map((inc) => (
            <span key={inc} className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-body">
              {inc}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-muted">{t("minGuestsShort", { count: pkg.minGuests })}</span>
          <Link
            href={`/catering/${serviceSlug}/quote?package=${pkg.slug}`}
            className="inline-flex h-10 items-center rounded-pill bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
          >
            {t("selectPackage")}
          </Link>
        </div>
      </div>
    </article>
  );
}
