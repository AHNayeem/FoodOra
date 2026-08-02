import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getVendorBySlug,
  getVendorCuisines,
  getVendorMenu,
  getVendorSlugs,
} from "@/services/catalog";
import { VendorHero } from "@/components/vendor/vendor-hero";
import { OpeningHours } from "@/components/vendor/opening-hours";
import { FoodItemCard } from "@/components/cards/food-item-card";
import { VendorPlans } from "@/components/subscriptions/vendor-plans";
import { VenueBookingBand } from "@/components/reservations/venue-booking-band";
import { VendorReviews } from "@/components/reviews/vendor-reviews";
import { AiReviewSummary } from "@/components/ai/ai-review-summary";
import type { CartVendor } from "@/types";

type Params = Promise<{ slug: string }>;

/** Prerender every known vendor at build time (spec: fast, SEO-friendly pages). */
export function generateStaticParams() {
  return getVendorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) return {};
  return {
    title: vendor.name,
    description: vendor.description,
    openGraph: {
      title: vendor.name,
      description: vendor.tagline,
      images: [{ url: vendor.cover }],
    },
  };
}

/**
 * Restaurant Details (Phase C5). Resolves the vendor by slug through the
 * services seam, 404s on miss, then loads its menu (C6 data) and cuisines in
 * parallel. Statically generated per vendor via generateStaticParams.
 */
export default async function VendorPage({ params }: { params: Params }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const [menu, cuisines, t] = await Promise.all([
    getVendorMenu(vendor.id),
    getVendorCuisines(vendor),
    getTranslations("restaurant"),
  ]);
  const cartVendor: CartVendor = {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    currency: vendor.currency,
    countryCode: vendor.location.countryCode,
    deliveryFee: vendor.deliveryFee,
    minOrder: vendor.minOrder,
    freeDeliveryOver: vendor.freeDeliveryOver,
  };

  return (
    <div className="pb-16">
      <VendorHero vendor={vendor} cuisines={cuisines} />

      <div className="container-site mt-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Menu */}
          <div>
            {menu.length > 1 && (
              <nav
                aria-label={t("menu")}
                className="no-scrollbar sticky top-16 z-10 -mx-4 mb-2 flex gap-2 overflow-x-auto border-b border-line bg-surface-alt/85 px-4 py-3 backdrop-blur md:mx-0 md:rounded-field md:px-3"
              >
                {menu.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="shrink-0 rounded-pill px-3 py-1.5 text-sm font-semibold text-body transition-colors hover:bg-surface-muted hover:text-primary"
                  >
                    {section.name}
                  </a>
                ))}
              </nav>
            )}

            {menu.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 pt-6">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-h2 text-ink">{section.name}</h2>
                  <span className="shrink-0 text-sm text-muted">
                    {t("items", { count: section.items.length })}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <FoodItemCard key={item.id} item={item} vendor={cartVendor} />
                  ))}
                </div>
              </section>
            ))}

            {/* Table booking, for venues with a floor (Phase C16) */}
            <VenueBookingBand
              vendorId={vendor.id}
              vendorName={vendor.name}
              vendorSlug={vendor.slug}
            />

            {/* Subscription plans this kitchen runs (Phase C15) */}
            <VendorPlans vendorId={vendor.id} vendorName={vendor.name} />

            {/* What the reviews add up to, in themes (Phase C24) */}
            <AiReviewSummary vendorId={vendor.id} vendorName={vendor.name} />

            {/* What customers made of it (Phase C22) */}
            <VendorReviews vendorId={vendor.id} vendorName={vendor.name} />
          </div>

          {/* Info sidebar */}
          <aside className="flex h-fit flex-col gap-6 lg:sticky lg:top-20">
            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("about")}</h3>
              <p className="mt-2 text-sm text-body">{vendor.description}</p>
              <p className="mt-3 text-sm text-muted">{vendor.location.address}</p>
            </div>
            <div className="rounded-panel border border-line bg-surface p-5">
              <h3 className="text-h3 text-ink">{t("openingHours")}</h3>
              <div className="mt-3">
                <OpeningHours hours={vendor.hours} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
