import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BadgePercent, TicketPercent, Zap } from "lucide-react";
import { getOffers, getPromoVendors } from "@/frontend/services/offers";
import { getBanners, getRouteMetadata, readOptions } from "@/frontend/services/cms";
import { PromoStrip } from "@/frontend/components/cms/promo-strip";
import { OfferCard } from "@/frontend/components/offers/offer-card";
import { VendorCard } from "@/frontend/components/cards/vendor-card";
import { SectionHeading } from "@/frontend/components/sections/section-heading";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return getRouteMetadata("/offers", readOptions(locale, (key) => t(key)), {
    title: t("offers.metaTitle"),
    description: t("offers.metaDescription"),
  });
}

/**
 * Offers (spec: Offers, Coupons, Flash Deals, Happy Hour). Every live promotion,
 * grouped by placement: flash deals with scarcity meters, featured platform
 * offers, copyable coupon codes, then the long tail of vendor deals.
 *
 * The service resolves the clock and hands back the instant it used, which is
 * threaded into every card so all the "days left" figures on the page agree.
 */
export default async function OffersPage() {
  const [t, locale] = await Promise.all([getTranslations("offers"), getLocale()]);
  const root = await getTranslations();

  const [board, promoVendors, banners] = await Promise.all([
    getOffers(),
    getPromoVendors(6),
    getBanners("offers-top", undefined, readOptions(locale, (key) => root(key))),
  ]);
  const { nowMs, groups: grouped, total: totalLive } = board;

  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="border-b border-line bg-surface-muted">
        <div className="container-site py-12 md:py-16">
          <span className="inline-flex items-center gap-2 rounded-pill bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            <BadgePercent className="size-4" aria-hidden />
            {t("liveCount", { count: totalLive })}
          </span>
          <h1 className="text-display mt-4 max-w-2xl text-ink">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-lg text-body">{t("subtitle")}</p>
          <PromoStrip placement="offers-top" banners={banners} className="mt-8 sm:grid-cols-1" />
        </div>
      </section>

      {totalLive === 0 ? (
        <section className="container-site py-16">
          <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line py-16 text-center">
            <TicketPercent className="size-10 text-muted" aria-hidden />
            <p className="text-lg font-semibold text-ink">{t("emptyTitle")}</p>
            <p className="max-w-sm text-body">{t("emptyBody")}</p>
            <Link
              href="/restaurants"
              className="mt-2 inline-flex h-11 items-center rounded-pill bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600"
            >
              {t("browseAll")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Flash deals */}
          {grouped.flash.length > 0 && (
            <section className="container-site py-12">
              <SectionHeading
                title={
                  <span className="inline-flex items-center gap-2">
                    <Zap className="size-6 text-accent-600" aria-hidden />
                    {t("flashTitle")}
                  </span>
                }
                subtitle={t("flashSubtitle")}
              />
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {grouped.flash.map((entry) => (
                  <OfferCard key={entry.offer.id} entry={entry} nowMs={nowMs} />
                ))}
              </div>
            </section>
          )}

          {/* Featured platform offers */}
          {grouped.featured.length > 0 && (
            <section className="container-site py-12">
              <SectionHeading title={t("featuredTitle")} subtitle={t("featuredSubtitle")} />
              <div className="grid gap-6 lg:grid-cols-2">
                {grouped.featured.map((entry) => (
                  <OfferCard key={entry.offer.id} entry={entry} nowMs={nowMs} featured />
                ))}
              </div>
            </section>
          )}

          {/* Coupon codes */}
          {grouped.coupon.length > 0 && (
            <section className="border-y border-line bg-surface-muted py-12">
              <div className="container-site">
                <SectionHeading title={t("couponsTitle")} subtitle={t("couponsSubtitle")} />
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {grouped.coupon.map((entry) => (
                    <OfferCard key={entry.offer.id} entry={entry} nowMs={nowMs} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Everything else */}
          {grouped.standard.length > 0 && (
            <section className="container-site py-12">
              <SectionHeading title={t("moreTitle")} subtitle={t("moreSubtitle")} />
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {grouped.standard.map((entry) => (
                  <OfferCard key={entry.offer.id} entry={entry} nowMs={nowMs} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Vendors running their own promotions */}
      {promoVendors.length > 0 && (
        <section className="container-site py-12">
          <SectionHeading
            title={t("promoVendorsTitle")}
            subtitle={t("promoVendorsSubtitle")}
            seeAllHref="/search?offers=1"
            seeAllLabel={t("seeAllDeals")}
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {promoVendors.map((v) => (
              <VendorCard key={v.id} vendor={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
