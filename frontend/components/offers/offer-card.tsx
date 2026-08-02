import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Store, Tag, Timer } from "lucide-react";
import type { OfferWithVendors } from "@/frontend/services/offers";
import { daysRemaining } from "@/frontend/services/offers";
import type { CurrencyCode } from "@/frontend/config/regions";
import { Badge } from "@/frontend/components/ui/badge";
import { ClaimCoupon } from "./claim-coupon";
import { CopyCode } from "./copy-code";
import { OfferTerms } from "./offer-terms";
import { formatPrice } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

/**
 * OfferCard — one promotion. Flash deals additionally show a scarcity meter and
 * a days-left counter; every card exposes the promo code (if any), the minimum
 * basket, the vendors it applies to and the full terms.
 *
 * `nowMs` is passed in rather than read from the clock here, so the whole page
 * evaluates "days left" against one consistent instant.
 */
export async function OfferCard({
  entry,
  nowMs,
  featured = false,
}: {
  entry: OfferWithVendors;
  nowMs: number;
  featured?: boolean;
}) {
  const t = await getTranslations("offers");
  const { offer, vendors } = entry;
  const currency = offer.currency as CurrencyCode;
  const days = daysRemaining(offer, nowMs);
  const claimedPct =
    offer.claimLimit && offer.claimLimit > 0
      ? Math.min(100, Math.round((offer.claimed / offer.claimLimit) * 100))
      : null;

  // Platform-wide offers open the search filtered to promotions; a single-vendor
  // offer goes straight to that vendor's menu.
  const href =
    vendors.length === 1 ? `/restaurants/${vendors[0].slug}` : "/search?offers=1";

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-card bg-surface shadow-card",
        featured && "sm:flex-row",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden",
          featured ? "aspect-[16/10] sm:aspect-auto sm:w-2/5" : "aspect-[16/9]",
        )}
      >
        <Image
          src={offer.image}
          alt=""
          fill
          sizes={featured ? "(min-width: 640px) 40vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
          className="object-cover"
        />
        <Badge tone="primary" className="absolute start-3 top-3 bg-primary text-white shadow-sm">
          {offer.badge}
        </Badge>
        {claimedPct !== null && claimedPct >= 70 && (
          <Badge tone="danger" className="absolute end-3 top-3 bg-ink/80 text-white">
            {t("almostGone")}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className={cn("font-bold text-ink", featured ? "text-h3" : "text-lg")}>
            {offer.title}
          </h3>
          {days <= 7 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-600">
              <Timer className="size-3.5" aria-hidden />
              {t("daysLeft", { count: days })}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-body">{offer.description}</p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
          {offer.minOrder > 0 && (
            <div className="inline-flex items-center gap-1">
              <Tag className="size-3.5" aria-hidden />
              <dt className="sr-only">{t("minOrderLabel")}</dt>
              <dd>{t("minOrder", { amount: formatPrice(offer.minOrder, currency) })}</dd>
            </div>
          )}
          {offer.maxDiscount !== null && (
            <div>
              <dt className="sr-only">{t("maxDiscountLabel")}</dt>
              <dd>{t("maxDiscount", { amount: formatPrice(offer.maxDiscount, currency) })}</dd>
            </div>
          )}
          {offer.firstOrderOnly && (
            <div>
              <dt className="sr-only">{t("eligibilityLabel")}</dt>
              <dd className="font-semibold text-primary">{t("firstOrderOnly")}</dd>
            </div>
          )}
        </dl>

        {/* Scarcity meter for capped campaigns. */}
        {claimedPct !== null && (
          <div className="mt-4">
            <div
              className="h-1.5 overflow-hidden rounded-pill bg-surface-muted"
              role="progressbar"
              aria-valuenow={claimedPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("claimedAria", { percent: claimedPct })}
            >
              <div className="h-full rounded-pill bg-primary" style={{ width: `${claimedPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {t("claimed", { claimed: offer.claimed, limit: offer.claimLimit! })}
            </p>
          </div>
        )}

        {vendors.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <Store className="size-3.5 shrink-0" aria-hidden />
            {vendors.map((v, i) => (
              <span key={v.id}>
                <Link href={`/restaurants/${v.slug}`} className="hover:text-primary">
                  {v.name}
                </Link>
                {i < vendors.length - 1 && <span aria-hidden>,</span>}
              </span>
            ))}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {offer.code ? (
            <>
              <CopyCode code={offer.code} />
              {entry.couponId && (
                <ClaimCoupon code={offer.code} couponId={entry.couponId} />
              )}
            </>
          ) : (
            <span className="inline-flex items-center rounded-field bg-fresh-50 px-3 py-2 text-xs font-semibold text-fresh-600">
              {t("autoApplied")}
            </span>
          )}
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("orderNow")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>

        <OfferTerms terms={offer.terms} />
      </div>
    </article>
  );
}
